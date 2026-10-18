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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_THRESHOLD = Number(process.env.PORTALGUARD_FACE_THRESHOLD || 0.55);
const DETECTOR_INPUT = Number(process.env.PORTALGUARD_FACE_DETECTOR_INPUT || 320);
const DETECTOR_SCORE = Number(process.env.PORTALGUARD_FACE_DETECTOR_SCORE || 0.3);
const DEVICE_TIMEOUT_MS = Number(process.env.PORTALGUARD_FACE_DEVICE_TIMEOUT || 4000);
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

// Puxa um frame ao vivo da câmera do leitor Control iD (save_screenshot).
// É o mesmo mecanismo usado na identificação central: não exige tocar no
// equipamento. Exposto para o cadastro capturar a foto direto da câmera.
export async function getDeviceFrame(address) {
  const base = /^https?:\/\//i.test(address) ? address : `http://${address}`;
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

export function createFaceEngine({ db, photosDir, logger = console }) {
  const assetsDir = path.join(path.dirname(photosDir), 'face-assets');
  const cache = new Map(); // residentId -> { name, apartment, descriptor: Float32Array }
  let ready = false;
  let initError = null;
  let backend = null;
  let refreshTimer = null;

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

  async function refreshIndex() {
    if (!ready) return;
    const base = path.join(photosDir, 'resident-photos');
    if (!fs.existsSync(base)) return;

    const residents = db.prepare('SELECT id, name, apartment FROM residents').all();
    const byId = new Map(residents.map((r) => [r.id, r]));

    let indexed = 0;
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
        cache.set(residentId, { name: resident.name, apartment: resident.apartment, descriptor });
        indexed += 1;
      } else {
        cache.delete(residentId);
      }
    }
    return indexed;
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => { refreshIndex().catch(() => {}); }, INDEX_REFRESH_MS);
    if (refreshTimer.unref) refreshTimer.unref();
  }

  async function initAndIndex() {
    try {
      await init();
      const n = await refreshIndex();
      logger.log?.(`[face] indice de moradores: ${n ?? 0} rosto(s)`);
      startAutoRefresh();
    } catch (e) {
      initError = e;
      logger.error?.('[face] falha ao iniciar motor facial:', e.message);
    }
  }

  async function matchFrame(buffer, threshold = DEFAULT_THRESHOLD) {
    await init();
    if (cache.size === 0) return { matched: false, reason: 'sem_moradores_indexados' };

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

    let best = null;
    for (const [residentId, info] of cache) {
      const distance = faceapi.euclideanDistance(detection.descriptor, info.descriptor);
      if (!best || distance < best.distance) {
        best = { residentId, name: info.name, apartment: info.apartment, distance };
      }
    }
    if (best && best.distance <= threshold) {
      return { matched: true, residentId: best.residentId, name: best.name, apartment: best.apartment, distance: best.distance };
    }
    return { matched: false, reason: 'abaixo_do_limiar', best };
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
      return { ready, backend, error: initError ? String(initError.message || initError) : null, indexed: cache.size };
    },
    defaultThreshold: DEFAULT_THRESHOLD,
  };
}
