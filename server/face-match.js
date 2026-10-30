// Motor de reconhecimento facial do PortalGuard.
//
// Fluxo centralizado: quando o leitor envia um `identification_event` sem
// identificar a pessoa (event 3, user_name vazio), o PortalGuard puxa um frame
// da câmera do próprio leitor (save_screenshot), detecta o rosto e compara com
// os descritores faciais das fotos dos moradores. Se casar dentro do limiar, o
// morador é liberado; caso contrário, o portão permanece fechado.
//
// Tudo roda em Node puro (backend WASM do tfjs), sem compilação nativa, para
// funcionar dentro do servidor empacotado com o pkg.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_THRESHOLD = Number(process.env.PORTALGUARD_FACE_THRESHOLD || 0.55);
// Visitantes usam um limiar mais rígido: a saída de um visitante reconhecido
// abre o relé, então um falso positivo não pode fechar uma visita em aberto.
const VISITOR_THRESHOLD = Number(process.env.PORTALGUARD_VISITOR_FACE_THRESHOLD || 0.45);
// Distância mínima entre o melhor e o segundo melhor candidato. Sem essa
// margem, dois rostos parecidos (irmãos, fotos antigas, gêmeos) podem gerar
// uma "vitória" por diferença ínfima e abrir o portão para a pessoa errada.
const MATCH_MARGIN = Number(process.env.PORTALGUARD_FACE_MATCH_MARGIN || 0.05);
const VISITOR_INDEX_LIMIT = Number(process.env.PORTALGUARD_VISITOR_FACE_LIMIT || 300);
const DETECTOR_INPUT = Number(process.env.PORTALGUARD_FACE_DETECTOR_INPUT || 320);
const DETECTOR_SCORE = Number(process.env.PORTALGUARD_FACE_DETECTOR_SCORE || 0.3);
const DEVICE_TIMEOUT_MS = Number(process.env.PORTALGUARD_FACE_DEVICE_TIMEOUT || 4000);
// Abrir uma sessão no leitor é uma ida e volta extra na rede. A câmera é
// consultada a cada reconhecimento central, então reaproveitar a sessão deixa
// a liberação perceptivelmente mais rápida sem alterar a comparação facial.
// Em caso de sessão expirada, getDeviceFrame autentica de novo e tenta uma vez.
const DEVICE_SESSION_TTL_MS = Number(process.env.PORTALGUARD_FACE_SESSION_TTL || 5 * 60 * 1000);
const INDEX_REFRESH_MS = Number(process.env.PORTALGUARD_FACE_INDEX_REFRESH || 120000);

const WASM_FILES = [
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
];

const MODEL_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

const ASSET_FILES = [...WASM_FILES, ...MODEL_FILES];

let libsPromise = null;
let tf = null;
let wasm = null;
let faceapi = null;
let PNGLib = null;
let jpeg = null;
const deviceSessions = new Map(); // base URL -> { session, expiresAt }
const pendingDeviceLogins = new Map(); // base URL -> Promise<string | null>

function loadLibs() {
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    const tfMod = await import('@tensorflow/tfjs');
    tf = tfMod.default ?? tfMod;
    const wasmMod = await import('@tensorflow/tfjs-backend-wasm');
    wasm = wasmMod.default ?? wasmMod;
    const faMod = await import('@vladmandic/face-api/dist/face-api.node-wasm.js');
    faceapi = faMod.default ?? faMod;
    const pngMod = await import('pngjs');
    const pngNs = pngMod.default ?? pngMod;
    PNGLib = pngNs.PNG ?? pngNs;
    const jpegMod = await import('jpeg-js');
    jpeg = jpegMod.default ?? jpegMod;
    return { tf, wasm, faceapi, PNGLib, jpeg };
  })();
  return libsPromise;
}

async function ensureAssets(dir) {
  const complete = ASSET_FILES.every((f) => fs.existsSync(path.join(dir, f)));
  if (complete) return dir;

  fs.mkdirSync(dir, { recursive: true });

  // 1) Assets embutidos no bundle (produção, exe empacotado com pkg).
  try {
    const embedded = await import('./face-assets.data.mjs');
    const assets = embedded?.ASSETS || embedded?.default?.ASSETS;
    if (assets) {
      for (const f of ASSET_FILES) {
        const b64 = assets[f];
        if (b64 && !fs.existsSync(path.join(dir, f))) {
          fs.writeFileSync(path.join(dir, f), Buffer.from(b64, 'base64'));
        }
      }
      return dir;
    }
  } catch {
    // Sem bundle (modo dev) — cai para o node_modules.
  }

  // 2) Modo dev: copia do node_modules.
  const wasmDist = path.join(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist');
  const modelDir = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
  for (const f of ASSET_FILES) {
    const src = f.endsWith('.wasm') ? path.join(wasmDist, f) : path.join(modelDir, f);
    const dst = path.join(dir, f);
    if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  return dir;
}

const normalizeDocument = (value) =>
  String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

const normalizePersonName = (value) =>
  String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Chave estável de um visitante: documento normalizado (preferencial) ou nome.
const visitorSubjectKey = (document, name) => {
  const doc = normalizeDocument(document);
  if (doc.length >= 4) return `doc:${doc}`;
  const normalizedName = normalizePersonName(name);
  return normalizedName ? `name:${normalizedName}` : null;
};

function resolveEntryPhoto(photosDir, photoUrl) {
  const raw = String(photoUrl ?? '');
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const base64 = raw.split(',')[1] || '';
    if (base64.length < 100) return null;
    const digest = createHash('sha1').update(base64).digest('hex');
    return { mtime: `data:${digest}`, path: null, load: () => Buffer.from(base64, 'base64') };
  }
  if (/^https?:/i.test(raw)) return null;
  const file = path.join(photosDir, 'entry-photos', raw.replace(/^\/+/, ''));
  try {
    if (!fs.existsSync(file)) return null;
    return { mtime: String(fs.statSync(file).mtimeMs), path: file, load: () => fs.readFileSync(file) };
  } catch {
    return null;
  }
}

function decodeToTensor(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNGLib.sync.read(buffer);
    const rgb = new Uint8Array(png.width * png.height * 3);
    for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
      rgb[j] = png.data[i];
      rgb[j + 1] = png.data[i + 1];
      rgb[j + 2] = png.data[i + 2];
    }
    return tf.tensor3d(rgb, [png.height, png.width, 3], 'int32');
  }
  const jpg = jpeg.decode(buffer, { useTArray: true });
  const rgb = new Uint8Array(jpg.width * jpg.height * 3);
  for (let i = 0, j = 0; i < jpg.data.length; i += 4, j += 3) {
    rgb[j] = jpg.data[i];
    rgb[j + 1] = jpg.data[i + 1];
    rgb[j + 2] = jpg.data[i + 2];
  }
  return tf.tensor3d(rgb, [jpg.height, jpg.width, 3], 'int32');
}

async function computeDescriptor(buffer) {
  const tensor = decodeToTensor(buffer);
  try {
    const res = await faceapi
      .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_INPUT, scoreThreshold: DETECTOR_SCORE }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return res?.descriptor ?? null;
  } finally {
    tensor.dispose();
  }
}

function deviceBaseUrl(address) {
  return (/^https?:\/\//i.test(address) ? address : `http://${address}`).replace(/\/+$/, '');
}

function cachedDeviceSession(base) {
  const cached = deviceSessions.get(base);
  if (!cached || cached.expiresAt <= Date.now()) {
    deviceSessions.delete(base);
    return null;
  }
  return cached.session;
}

async function loginToDevice(base, force = false) {
  if (!force) {
    const cached = cachedDeviceSession(base);
    if (cached) return cached;
  } else {
    deviceSessions.delete(base);
  }

  const pending = pendingDeviceLogins.get(base);
  if (pending) return pending;

  const login = (async () => {
    const loginResp = await fetch(`${base}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin' }),
      signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
    });
    if (!loginResp.ok) return null;
    const loginData = await loginResp.json();
    const session = loginData?.session;
    if (!session) return null;
    deviceSessions.set(base, { session, expiresAt: Date.now() + DEVICE_SESSION_TTL_MS });
    return session;
  })().finally(() => pendingDeviceLogins.delete(base));
  pendingDeviceLogins.set(base, login);
  return login;
}

async function requestDeviceFrame(base, session) {
  const shotResp = await fetch(`${base}/save_screenshot.fcgi?session=${session}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frame_type: 'camera', camera: 'rgb' }),
    signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
  });
  if (!shotResp.ok) return null;

  const contentType = shotResp.headers.get('content-type') || '';
  const ab = Buffer.from(await shotResp.arrayBuffer());
  if (contentType.includes('json')) {
    try {
      const json = JSON.parse(ab.toString('utf8'));
      const b64 = json?.image || json?.frame || json?.photo || json?.data;
      if (typeof b64 === 'string') {
        return Buffer.from(b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''), 'base64');
      }
    } catch { /* nao era JSON util */ }
    return null;
  }
  return ab.length > 0 ? ab : null;
}

// Puxa um frame ao vivo da câmera do leitor Control iD (save_screenshot).
// É o mesmo mecanismo usado na identificação central: não exige tocar no
// equipamento. Exposto para o cadastro capturar a foto direto da câmera.
export async function getDeviceFrame(address) {
  const base = deviceBaseUrl(address);
  const cachedSession = cachedDeviceSession(base);
  let session = cachedSession || await loginToDevice(base);
  if (!session) return null;

  let frame = await requestDeviceFrame(base, session);
  if (frame || !cachedSession) return frame;

  // A sessão pode ter sido encerrada pelo leitor antes do nosso TTL. Refaz a
  // autenticação somente nessa situação, preservando a latência normal.
  session = await loginToDevice(base, true);
  if (!session) return null;
  return requestDeviceFrame(base, session);
}

export function createFaceEngine({ db, photosDir, logger = console }) {
  const assetsDir = path.join(path.dirname(photosDir), 'face-assets');
  const cache = new Map(); // residentId -> { name, apartment, descriptor: Float32Array }
  const visitorCache = new Map(); // subjectKey -> { name, document, visitorType, photoUrl, descriptor }
  let ready = false;
  let initError = null;
  let backend = null;
  let refreshTimer = null;
  let refreshing = null;

  async function init() {
    if (ready) return true;
    await loadLibs();
    await ensureAssets(assetsDir);
    try {
      wasm.setWasmPaths(assetsDir + path.sep);
      await tf.setBackend('wasm');
      await tf.ready();
      backend = tf.getBackend();
    } catch (e) {
      logger.warn?.('[face] backend wasm indisponivel, usando cpu:', e.message);
      await tf.setBackend('cpu');
      await tf.ready();
      backend = tf.getBackend();
    }
    await faceapi.nets.tinyFaceDetector.loadFromDisk(assetsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(assetsDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(assetsDir);
    ready = true;
    initError = null;
    logger.log?.(`[face] motor pronto (backend ${backend})`);
    return true;
  }

  async function refreshResidentIndex() {
    const base = path.join(photosDir, 'resident-photos');
    let indexed = 0;
    if (!fs.existsSync(base)) return indexed;

    const residents = db.prepare('SELECT id, name, apartment FROM residents').all();
    const byId = new Map(residents.map((r) => [r.id, r]));

    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const residentId = entry.name;
      const resident = byId.get(residentId);
      if (!resident) continue;

      const dir = path.join(base, residentId);
      const file = ['photo.jpg', 'photo.jpeg', 'photo.png']
        .map((f) => path.join(dir, f))
        .find((f) => fs.existsSync(f));
      if (!file) continue;

      let mtime;
      try { mtime = String(fs.statSync(file).mtimeMs); } catch { continue; }

      let descriptor = null;
      try {
        const cached = db.prepare('SELECT descriptor, photo_mtime FROM resident_face_descriptors WHERE resident_id = ?').get(residentId);
        if (cached && cached.photo_mtime === mtime) {
          descriptor = Float32Array.from(JSON.parse(cached.descriptor));
        } else {
          descriptor = await computeDescriptor(fs.readFileSync(file));
          if (descriptor) {
            db.prepare(`INSERT INTO resident_face_descriptors (resident_id, descriptor, photo_path, photo_mtime, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(resident_id) DO UPDATE SET descriptor = excluded.descriptor, photo_path = excluded.photo_path, photo_mtime = excluded.photo_mtime, updated_at = excluded.updated_at`)
              .run(residentId, JSON.stringify(Array.from(descriptor)), file, mtime, new Date().toISOString());
          }
        }
      } catch (e) {
        logger.warn?.(`[face] falha ao indexar morador ${residentId}:`, e.message);
      }

      if (descriptor) {
        cache.set(residentId, { kind: 'resident', name: resident.name, apartment: resident.apartment, descriptor });
        indexed += 1;
      } else {
        cache.delete(residentId);
      }
    }
    return indexed;
  }

  // Indexa as fotos dos cadastros de visitantes/prestadores/entregadores. É o
  // que permite ao PortalGuard reconhecer a pessoa na volta e abrir a liberação
  // de uso único para a portaria decidir.
  async function refreshVisitorIndex() {
    const next = new Map();
    try {
      const rows = db.prepare(`SELECT visitor_name, visitor_document, visitor_type, photo_url, entry_time
        FROM access_entries
        WHERE visitor_type IN ('visitor', 'service_provider', 'delivery')
          AND photo_url IS NOT NULL AND photo_url != ''
        ORDER BY entry_time DESC
        LIMIT ?`).all(VISITOR_INDEX_LIMIT * 8);

      for (const row of rows) {
        if (next.size >= VISITOR_INDEX_LIMIT) break;
        const subjectKey = visitorSubjectKey(row.visitor_document, row.visitor_name);
        if (!subjectKey || next.has(subjectKey)) continue;

        const source = resolveEntryPhoto(photosDir, row.photo_url);
        if (!source) continue;

        let descriptor = null;
        try {
          const cached = db.prepare('SELECT descriptor, photo_mtime FROM visitor_face_descriptors WHERE subject_key = ?').get(subjectKey);
          if (cached && cached.photo_mtime === source.mtime) {
            descriptor = Float32Array.from(JSON.parse(cached.descriptor));
          } else {
            descriptor = await computeDescriptor(source.load());
            if (descriptor) {
              db.prepare(`INSERT INTO visitor_face_descriptors (subject_key, descriptor, photo_path, photo_mtime, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(subject_key) DO UPDATE SET descriptor = excluded.descriptor, photo_path = excluded.photo_path, photo_mtime = excluded.photo_mtime, updated_at = excluded.updated_at`)
                .run(subjectKey, JSON.stringify(Array.from(descriptor)), source.path, source.mtime, new Date().toISOString());
            }
          }
        } catch (e) {
          logger.warn?.(`[face] falha ao indexar visitante ${subjectKey}:`, e.message);
        }

        if (descriptor) {
          next.set(subjectKey, {
            kind: 'visitor',
            subjectKey,
            name: row.visitor_name,
            document: row.visitor_document,
            visitorType: row.visitor_type,
            photoUrl: row.photo_url,
            photoPath: source.path,
            descriptor,
          });
        }
      }
    } catch (e) {
      logger.warn?.('[face] falha ao indexar visitantes:', e.message);
    }

    visitorCache.clear();
    for (const [key, value] of next) visitorCache.set(key, value);
    return visitorCache.size;
  }

  async function refreshIndex() {
    if (!ready) return { residents: 0, visitors: 0 };
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const residents = await refreshResidentIndex();
      const visitors = await refreshVisitorIndex();
      return { residents, visitors };
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => { refreshIndex().catch(() => {}); }, INDEX_REFRESH_MS);
    if (refreshTimer.unref) refreshTimer.unref();
  }

  async function initAndIndex() {
    try {
      await init();
      const counts = await refreshIndex();
      logger.log?.(`[face] indice: ${counts?.residents ?? 0} morador(es), ${counts?.visitors ?? 0} visitante(s)`);
      startAutoRefresh();
    } catch (e) {
      initError = e;
      logger.error?.('[face] falha ao iniciar motor facial:', e.message);
    }
  }

  async function matchFrame(buffer, threshold = DEFAULT_THRESHOLD) {
    await init();
    if (cache.size === 0 && visitorCache.size === 0) {
      return { matched: false, reason: 'sem_rostos_indexados' };
    }

    const tensor = decodeToTensor(buffer);
    let detection = null;
    try {
      detection = await faceapi
        .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_INPUT, scoreThreshold: DETECTOR_SCORE }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    } finally {
      tensor.dispose();
    }
    if (!detection) return { matched: false, reason: 'rosto_nao_detectado' };

    let bestResident = null;
    let secondResident = null;
    for (const [residentId, info] of cache) {
      const distance = faceapi.euclideanDistance(detection.descriptor, info.descriptor);
      if (!bestResident || distance < bestResident.distance) {
        secondResident = bestResident;
        bestResident = { residentId, name: info.name, apartment: info.apartment, distance };
      } else if (!secondResident || distance < secondResident.distance) {
        secondResident = { residentId, name: info.name, apartment: info.apartment, distance };
      }
    }

    let bestVisitor = null;
    let secondVisitor = null;
    for (const [subjectKey, info] of visitorCache) {
      const distance = faceapi.euclideanDistance(detection.descriptor, info.descriptor);
      if (!bestVisitor || distance < bestVisitor.distance) {
        secondVisitor = bestVisitor;
        bestVisitor = {
          subjectKey,
          name: info.name,
          document: info.document,
          visitorType: info.visitorType,
          photoUrl: info.photoUrl,
          distance,
        };
      } else if (!secondVisitor || distance < secondVisitor.distance) {
        secondVisitor = {
          subjectKey,
          name: info.name,
          document: info.document,
          visitorType: info.visitorType,
          photoUrl: info.photoUrl,
          distance,
        };
      }
    }

    // Um candidato só é aceito se estiver dentro do limiar E suficientemente
    // distante do segundo colocado. Isso evita falso positivo quando o rosto
    // é parecido com mais de uma pessoa cadastrada.
    const residentClear = !!bestResident
      && (!secondResident || secondResident.distance - bestResident.distance >= MATCH_MARGIN);
    const visitorClear = !!bestVisitor
      && (!secondVisitor || secondVisitor.distance - bestVisitor.distance >= MATCH_MARGIN);

    const residentMatched = residentClear && bestResident.distance <= threshold;
    const visitorMatched = visitorClear && bestVisitor.distance <= VISITOR_THRESHOLD;
    const ambiguous = (!residentMatched && !!bestResident && bestResident.distance <= threshold)
      || (!visitorMatched && !!bestVisitor && bestVisitor.distance <= VISITOR_THRESHOLD);

    if (residentMatched && (!visitorMatched || bestResident.distance <= bestVisitor.distance)) {
      return {
        matched: true,
        kind: 'resident',
        residentId: bestResident.residentId,
        name: bestResident.name,
        apartment: bestResident.apartment,
        distance: bestResident.distance,
        second_distance: secondResident?.distance ?? null,
      };
    }
    if (visitorMatched) {
      return {
        matched: true,
        kind: 'visitor',
        subjectKey: bestVisitor.subjectKey,
        name: bestVisitor.name,
        document: bestVisitor.document,
        visitorType: bestVisitor.visitorType,
        photoUrl: bestVisitor.photoUrl,
        distance: bestVisitor.distance,
        second_distance: secondVisitor?.distance ?? null,
      };
    }
    return {
      matched: false,
      reason: ambiguous ? 'ambiguo' : 'abaixo_do_limiar',
      best: bestResident || bestVisitor,
      second: bestResident ? (secondResident || null) : (secondVisitor || null),
    };
  }

  async function identifyFromDevice(address, threshold = DEFAULT_THRESHOLD) {
    if (!ready && initError) return { matched: false, reason: 'motor_indisponivel' };
    let frame;
    try {
      frame = await getDeviceFrame(address);
    } catch (e) {
      return { matched: false, reason: `frame_erro:${e.message}` };
    }
    if (!frame) return { matched: false, reason: 'sem_frame' };
    const result = await matchFrame(frame, threshold);
    return { ...result, frame };
  }

  return {
    init,
    initAndIndex,
    refreshIndex,
    matchFrame,
    identifyFromDevice,
    get status() {
      return {
        ready,
        backend,
        error: initError ? String(initError.message || initError) : null,
        indexed: cache.size,
        visitorsIndexed: visitorCache.size,
      };
    },
    defaultThreshold: DEFAULT_THRESHOLD,
    visitorThreshold: VISITOR_THRESHOLD,
  };
}
