// Replicação local da edge function supabase/functions/controlid-webhook/index.ts.
// Protocolo PUSH: o dispositivo faz polling em /api/controlid-webhook (GET/POST),
// recebe comandos da push_command_queue, executa e devolve o resultado no mesmo
// endpoint. Identificações (modo monitor/online) são respondidas IMEDIATAMENTE
// com a ordem de abertura; o trabalho de banco roda em background.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const sanitizeString = (val, maxLength = 255) => {
  if (typeof val !== 'string' && typeof val !== 'number') return '';
  return String(val).trim().substring(0, maxLength);
};

const parseFormEncodedPayload = (raw) => {
  const params = new URLSearchParams(raw);
  const entries = Array.from(params.entries()).filter(([key]) => key && key.trim().length > 0);

  if (entries.length > 0) {
    return Object.fromEntries(entries.map(([key, value]) => [sanitizeString(key, 100), sanitizeString(value, 500)]));
  }

  if (!raw.includes('=')) return {};

  const result = {};
  for (const pair of raw.split('&')) {
    const [rawKey, ...rawValueParts] = pair.split('=');
    if (!rawKey) continue;
    const key = sanitizeString(decodeURIComponent(rawKey.replace(/\+/g, ' ')), 100);
    const value = sanitizeString(decodeURIComponent(rawValueParts.join('=').replace(/\+/g, ' ')), 500);
    if (key) result[key] = value;
  }
  return result;
};

const parseRawBody = (raw) => {
  const text = raw || '';
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { /* não é JSON */ }
  const form = parseFormEncodedPayload(text);
  if (Object.keys(form).length > 0) return form;
  return { raw_data: text.substring(0, 1000) };
};

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_WINDOW = 200;

function checkRateLimit(deviceId) {
  const nowMs = Date.now();
  const limit = rateLimitMap.get(deviceId);
  if (!limit || nowMs > limit.resetTime) {
    rateLimitMap.set(deviceId, { count: 1, resetTime: nowMs + RATE_LIMIT_WINDOW });
    return true;
  }
  if (limit.count >= MAX_REQUESTS_PER_WINDOW) return false;
  limit.count++;
  return true;
}

function runBackground(label, task) {
  if (task && typeof task.catch === 'function') {
    task.catch((error) => console.error(`Background task failed: ${label}`, error));
  }
}

// Detecta o host para configurar o dispositivo apontar para ESTE servidor local.
// IMPORTANTE: o Tauri/WebView serve a interface em 127.0.0.1, então o Host do
// pedido NÃO é o endereço que o aparelho (outro IP da LAN) pode alcançar.
// Nesses casos resolvemos o IP real da LAN; sem isso o dispositivo passa a
// apontar para ele mesmo e o canal de push/mortor morre.
function isLoopback(host) {
  return host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
}

function lanAddress() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) return iface.address;
    }
  }
  return null;
}

function parseHost(req) {
  const hostHeader = (req.headers.host || '127.0.0.1:8080').replace(/[^a-zA-Z0-9.:\-\[\]]/g, '');
  let host;
  let port;
  const bracketMatch = hostHeader.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketMatch) {
    host = bracketMatch[1];
    port = bracketMatch[2] || '80';
  } else {
    const idx = hostHeader.lastIndexOf(':');
    if (idx > -1 && /^\d+$/.test(hostHeader.slice(idx + 1))) {
      host = hostHeader.slice(0, idx);
      port = hostHeader.slice(idx + 1);
    } else {
      host = hostHeader;
      port = '80';
    }
  }
  if (isLoopback(host)) {
    const resolved = process.env.PORTALGUARD_SERVER_HOST || lanAddress();
    if (resolved) host = resolved;
  }
  return { host, port };
}

export function buildWebhookConfig(req) {
  const { host, port } = parseHost(req);
  return {
    monitor: {
      request_timeout: '15000',
      hostname: host,
      port: String(port),
      path: '/api/controlid-webhook',
    },
    push_server: {
      push_remote_address: `http://${host}:${port}/api/controlid-webhook`,
      push_request_timeout: '15000',
      push_request_period: '5',
    },
    general: { online: '1', local_identification: '1', ihm_enterprise_mode: '0' },
  };
}

function detectEventType(urlPath, payload) {
  const path = String(urlPath).toLowerCase();

  if (path.includes('/push-config')) return 'push_config';
  if (path.includes('/send-config')) return 'send_config';

  if (path.includes('/push/result') || path.endsWith('/result')) return 'push_result';
  if (path.includes('device_is_alive.fcgi') || path.includes('/device_is_alive')) return 'device_is_alive';
  if (path.includes('identification_event.fcgi') || path.includes('new_user_identified.fcgi')) return 'identification_event';
  if (path.includes('session_is_valid.fcgi')) return 'session_is_valid';

  if ((path.includes('/push') || path.endsWith('/controlid-webhook')) && payload?.access_logs !== undefined) {
    return 'device_is_alive';
  }

  if (payload && typeof payload === 'object') {
    const hasEvent = payload.event !== undefined;
    const hasUserId = payload.user_id !== undefined;
    const hasUserName = payload.user_name !== undefined || payload.name !== undefined;
    const hasPortal = payload.portal_id !== undefined;
    if (hasEvent && (hasUserId || hasUserName || hasPortal)) {
      return 'identification_event';
    }
  }

  if (path.endsWith('/push') || (path.includes('/push') && !path.includes('.fcgi'))) {
    return 'push_request';
  }

  if (path.endsWith('/controlid-webhook') || path.endsWith('/controlid-webhook/')) {
    return 'push_request';
  }

  if (path.includes('/dao')) return 'dao';
  if (path.includes('/operation_mode')) return 'operation_mode';
  if (path.includes('/door')) return 'door';
  if (path.includes('/catra_event')) return 'catra_event';
  if (path.includes('/access_photo')) return 'access_photo';

  if (payload?.object_changes) return 'dao';
  if (payload?.access_logs !== undefined) return 'device_is_alive';
  if (payload?.operation_mode) return 'operation_mode';
  if (payload?.door) return 'door';
  if (payload?.access_photo) return 'access_photo';
  if (payload?.event) return 'catra_event';

  return 'unknown';
}

function extractDeviceId(urlPath, query, payload, req) {
  if (payload?.device_id) return sanitizeString(payload.device_id, 100);
  if (payload?.deviceId) return sanitizeString(payload.deviceId, 100);
  if (payload?.serial) return sanitizeString(payload.serial, 100);

  const qDeviceId = query.deviceId || query.device_id;
  if (qDeviceId) return sanitizeString(qDeviceId, 100);

  const hDeviceId = req.headers['x-device-id'];
  if (hDeviceId) return sanitizeString(hDeviceId, 100);

  return '';
}

function buildIdentificationActions(payload) {
  const portalId = Number.parseInt(String(payload?.portal_id ?? '1'), 10);
  const resolvedPortal = Number.isFinite(portalId) && portalId > 0 ? portalId : 1;
  const relayAction = process.env.CONTROLID_RELAY_ACTION === 'door' ? 'door' : 'sec_box';

  // Um �nico rel�: cada modelo tem sa�das independentes e pulsar as duas pode
  // acionar portas diferentes. A escolha vem de CONTROLID_RELAY_ACTION.
  return [{
    action: relayAction,
    parameters: relayAction === 'door' ? `door=${resolvedPortal}` : 'id=65793, reason=1',
  }];
}

// Só é chamada quando o motor central autorizou. A decisão do banco é a juíza:
// um morador encontrado (por TAG/vehicle_tag ou por nome) é liberado mesmo que o
// equipamento tenha enviado event 3 (TAG não gravada na memória do leitor).
function buildIdentificationResponse(payload, urlPath, deviceType, decision) {
  const userId = Number.parseInt(String(payload?.user_id ?? '0'), 10);
  const resolvedUserId = Number.parseInt(String(decision?.resolved_user_id ?? '0'), 10);
  const portalId = Number.parseInt(String(payload?.portal_id ?? '1'), 10);
  const userName = sanitizeString(payload?.user_name || payload?.name || '', 200);
  const residentName = sanitizeString(decision?.resident_name || decision?.resident || '', 200);

  const resolvedPortal = Number.isFinite(portalId) && portalId > 0 ? portalId : 1;

  const result = {
    event: 7,
    user_id: Number.isFinite(resolvedUserId) && resolvedUserId > 0
      ? resolvedUserId
      : (Number.isFinite(userId) ? userId : 0),
    user_name: residentName || userName,
    user_image: payload?.user_has_image === 1 || payload?.user_has_image === '1'
      || payload?.user_has_image === true || payload?.user_has_image === 'true',
    portal_id: resolvedPortal,
    actions: buildIdentificationActions(payload),
  };

  const shouldWrapResult = String(urlPath).toLowerCase().includes('.fcgi');
  return shouldWrapResult ? { result } : result;
}

// ============= CENTRAL ACCESS DECISION ENGINE =============
// The database is the judge. If the DB doesn't answer within the budget, we
// fall back to the device decision (hybrid contingency) so the gate never hangs.
const DECISION_TIMEOUT_MS = 2500;

const normalizeName = (value) =>
  String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const VISITOR_ACCESS_TYPES = ['visitor', 'service_provider', 'delivery'];
const normalizeDocument = (value) =>
  String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const hardwareIdFor = (value) => {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
};
const visitorSubjectKey = (document, name) => {
  const doc = normalizeDocument(document);
  if (doc.length >= 4) return `doc:${doc}`;
  const normalizedName = normalizeName(name);
  return normalizedName ? `name:${normalizedName}` : null;
};
const visitorSubjectFromEntry = (row) => ({
  subjectKey: visitorSubjectKey(row.visitor_document, row.visitor_name),
  name: row.visitor_name,
  document: row.visitor_document,
  visitorType: row.visitor_type,
  photoUrl: row.photo_url || null,
});
const sameVisitorSubject = (entry, subject) => {
  const entryKey = visitorSubjectKey(entry.visitor_document, entry.visitor_name);
  return !!entryKey && entryKey === subject.subjectKey;
};
// Procura um cadastro do Novo Cadastro pelo que o equipamento enviou. O leitor
// pode mandar o documento em `registration`, o id interno (hash de `sp-<doc>`)
// ou apenas o nome.
const findVisitorSubject = (db, { registration, userName, userId }) => {
  const reg = normalizeDocument(registration);
  const name = normalizeName(userName);
  const uid = Number(userId) || 0;
  if (!reg && !name && !uid) return null;

  const rows = db.prepare(`SELECT visitor_name, visitor_document, visitor_type, photo_url, entry_time
    FROM access_entries
    WHERE visitor_type IN ('visitor', 'service_provider', 'delivery')
    ORDER BY entry_time DESC
    LIMIT 1000`).all();

  for (const row of rows) {
    const doc = normalizeDocument(row.visitor_document);
    if (reg && doc && reg === doc) return visitorSubjectFromEntry(row);
  }
  if (uid > 0) {
    for (const row of rows) {
      if (!row.visitor_document) continue;
      if (hardwareIdFor(`sp-${row.visitor_document}`) === uid) return visitorSubjectFromEntry(row);
    }
  }
  if (name) {
    for (const row of rows) {
      if (normalizeName(row.visitor_name) === name) return visitorSubjectFromEntry(row);
    }
  }
  return null;
};

const evaluateCentralAccess = async (db, payload) => {
  const work = (async () => {
    const incomingEvent = Number.parseInt(String(payload?.event ?? '0'), 10);
    const rawCardValue = String(payload?.card_value ?? '');
    const cardValue = sanitizeString(rawCardValue, 100).replace(/^0+/, '');
    const userName = sanitizeString(payload?.user_name || payload?.name || '', 200);
    let resident = null;

    // TAG: consulta os DOIS formatos (com e sem zeros à esquerda), pois o
    // equipamento pode enviar "0001234" e o banco gravar "1234" (ou o contrário).
    if ((cardValue && cardValue !== '0') || rawCardValue) {
      const cleanCardValue = sanitizeString(rawCardValue, 100);
      const candidates = Array.from(new Set([cleanCardValue, cardValue].filter(Boolean)));
      const placeholders = candidates.map(() => '?').join(',');
      resident = db.prepare(
        `SELECT id, name, apartment, contract_type, contract_end_date, person_type, vehicle_tag FROM residents WHERE vehicle_tag IN (${placeholders}) LIMIT 1`
      ).get(...candidates) || null;
    }

    if (!resident && userName) {
      const m = userName.match(/^(\d+\w?)\s*[-–]\s*(.+)$/i);
      if (m) {
        const [, apt, n] = m;
        const rows = db.prepare(
          'SELECT id, name, apartment, contract_type, contract_end_date, person_type FROM residents WHERE apartment LIKE ?'
        ).all(`%${apt.trim()}%`);
        const target = normalizeName(n);
        // Só autoriza quando o NOME realmente corresponde. Não usar mais o
        // atalho "rows.length === 1" — ele abria para o morador errado quando
        // o nome do evento não batia com ninguém do apartamento.
        resident = rows.find((r) => {
          const rn = normalizeName(r.name);
          return rn.includes(target) || target.includes(rn);
        }) || null;
      }
    }

    if (resident) {
      // Dados do morador encontrado retornados junto da decisão para que a
      // resposta do equipamento use o nome real do banco (event 7).
      const found = {
        allow: true,
        reason: 'Morador ativo',
        source: 'db',
        resident: resident.name,
        resident_name: resident.name,
        resident_id: resident.id,
        resolved_user_id: resident.id,
        person_type: resident.person_type || 'morador',
        apartment: resident.apartment || null,
      };
      if (resident.contract_end_date) {
        const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // America/Sao_Paulo
        if (resident.contract_end_date < today) {
          return { ...found, allow: false, reason: 'Contrato vencido' };
        }
      }
      if (resident.person_type && resident.person_type !== 'morador') {
        return { ...found, reason: 'Acesso autorizado - colaborador ativo' };
      }
      return found;
    }

    // Not a resident: check restriction list by name
    if (userName) {
      const cleanName = userName.replace(/^(\d+\w?)\s*[-–]\s*/, '').trim();
      const blocked = db.prepare(
        'SELECT id, visitor_name FROM blocked_visitors WHERE is_active = 1 AND visitor_name LIKE ? LIMIT 50'
      ).all(`%${cleanName}%`).find((b) => normalizeName(b.visitor_name) === normalizeName(cleanName));
      if (blocked) return { allow: false, reason: 'Pessoa bloqueada', source: 'db' };
    }

    if (incomingEvent === 3 || incomingEvent === 6) {
      return { allow: false, reason: 'Nǜo identificado', source: 'db' };
    }

    // O equipamento identificou alguém que não é morador: pode ser um cadastro
    // do Novo Cadastro (visitante/prestador/entregador). A regra de uso único é
    // aplicada depois, no fluxo de liberação facial.
    const visitorSubject = findVisitorSubject(db, {
      registration: payload?.registration,
      userName,
      userId: payload?.user_id,
    });
    if (visitorSubject) {
      return { allow: false, reason: 'Visitante reconhecido', source: 'db', visitor_subject: visitorSubject };
    }

    // Known by the device (staff, service providers registered locally): allow.
    return { allow: true, reason: 'Cadastro no equipamento', source: 'db' };
  })();

  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ allow: true, reason: 'Timeout - decisão do equipamento', source: 'fallback' }), DECISION_TIMEOUT_MS)
  );
  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    console.error('Central decision error:', e);
    return { allow: true, reason: 'Erro - decisão do equipamento', source: 'fallback' };
  }
};

function buildDeniedResponse(payload, urlPath) {
  const userId = Number.parseInt(String(payload?.user_id ?? '0'), 10);
  const portalId = Number.parseInt(String(payload?.portal_id ?? '1'), 10);
  const result = {
    event: 6,
    user_id: Number.isFinite(userId) ? userId : 0,
    user_name: sanitizeString(payload?.user_name || payload?.name || '', 200),
    user_image: false,
    portal_id: Number.isFinite(portalId) && portalId > 0 ? portalId : 1,
  };
  const shouldWrapResult = String(urlPath).toLowerCase().includes('.fcgi');
  return shouldWrapResult ? { result } : result;
}

const tryParseJsonString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
};

const normalizeBase64Candidate = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fromDataUri = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/i);
  const candidate = (fromDataUri?.[1] || trimmed).replace(/\s+/g, '');
  if (candidate.length < 100) return null;

  if (!/^[A-Za-z0-9+/=_-]+$/.test(candidate)) return null;
  return candidate;
};

const extractPhotoBase64 = (payload) => {
  const parsedResponse = tryParseJsonString(payload?.response);
  const parsedRawData = tryParseJsonString(payload?.raw_data);

  const candidates = [
    payload?.user_image_hash,
    payload?.user_image_data,
    payload?.face_image,
    payload?.image,
    payload?.photo,
    payload?.photo_data,
    payload?.access_photo?.image,
    payload?.access_photo?.photo,
    payload?.result?.user_image,
    payload?.result?.image,
    payload?.result?.photo,
    payload?.result?.access_photo,
    payload?.response?.user_image,
    payload?.response?.image,
    payload?.response?.photo,
    parsedResponse?.user_image,
    parsedResponse?.image,
    parsedResponse?.photo,
    parsedResponse?.access_photo?.image,
    parsedResponse?.access_photo?.photo,
    parsedRawData?.user_image,
    parsedRawData?.image,
    parsedRawData?.photo,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBase64Candidate(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const extractUserName = (values) => sanitizeString(values.user_name || values.name || values.userName || values.user || '', 200);

function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]);
}

export function registerControlidWebhook(app, ctx) {
  const { db, now, genId, notifyRealtime, PHOTOS_DIR, faceEngine = null } = ctx;
  const FACE_TIMEOUT_MS = Number(process.env.PORTALGUARD_FACE_TIMEOUT_MS || 6000);

  // Descobre o endereço (ip:porta) do leitor para puxar o frame da câmera.
  function resolveDeviceAddress(deviceId) {
    if (!deviceId) return null;
    try {
      const row = db.prepare('SELECT ip_address FROM devices WHERE serial_number = ? OR ip_address = ? LIMIT 1').get(deviceId, deviceId);
      return row?.ip_address || null;
    } catch {
      return null;
    }
  }

  // Captura o corpo bruto ANTES do express.json consumir o stream.
  app.use('/api/controlid-webhook', (req, res, next) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      req._body = true;
      next();
    });
    req.on('error', () => { /* socket abortado */ });
  });

  function insertControlidLog(deviceId, eventType, payload, processed = false) {
    const id = genId();
    db.prepare('INSERT INTO controlid_logs (id, device_id, event_type, payload, processed, received_at) VALUES (?,?,?,?,?,?)')
      .run(id, deviceId || 'unknown', eventType, JSON.stringify(payload), processed ? 1 : 0, now());
    const row = db.prepare('SELECT * FROM controlid_logs WHERE id = ?').get(id);
    notifyRealtime('controlid_logs', 'INSERT', { ...row, payload, processed: !!row.processed });
    if (VISUALIZATION_LOG_TYPES.includes(eventType)) trimVisualizationLogs();
    return id;
  }

  // Prestador de servico fixo / empregado domestico reconhecido pelo leitor:
  // grava a passagem no log de acesso (access_entries) como registro CONCLUIDO
  // (entry_time = exit_time) para constar nos "Logs de Acesso" e relatorios,
  // sem ficar em "Ativos no Condominio". Moradores nao geram registro.
  function recordCollaboratorAccess(residentId) {
    try {
      if (!residentId) return;
      const resident = db.prepare('SELECT id, name, apartment, person_type FROM residents WHERE id = ?').get(residentId);
      if (!resident) return;
      const personType = String(resident.person_type || 'morador');
      if (personType === 'morador') return;

      const ts = now();
      const name = resident.name || '';
      const id = genId();
      db.prepare(`INSERT INTO access_entries (
        id, apartment, auto_recognized, badge_number, company, entry_time, exit_time,
        notes, photo_url, purpose, registered_by, resident_id, resident_name,
        vehicle_color, vehicle_model, vehicle_plate, visitor_document, visitor_name, visitor_type
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, resident.apartment || '', 1, null, null, ts, ts,
        null, null, 'Acesso automatico (leitor)', null, resident.id, name,
        null, null, null, '', name, 'service_provider'
      );
      const inserted = db.prepare('SELECT * FROM access_entries WHERE id = ?').get(id);
      notifyRealtime('access_entries', 'INSERT', { ...inserted, auto_recognized: !!inserted.auto_recognized });
    } catch (e) {
      console.error('recordCollaboratorAccess error:', e);
    }
  }

  // A portaria só precisa ver os acessos recentes na tela. Mantemos apenas os
  // últimos N eventos de visualização e apagamos os mais antigos automaticamente
  // (as fotos não são mais armazenadas). Outros tipos (push_result etc.) ficam
  // intactos por serem operacionais.
  const VISUALIZATION_LOG_TYPES = ['dao', 'access_photo', 'identification_event', 'catra_event'];
  const MAX_VISUALIZATION_LOGS = Number(process.env.PORTALGUARD_MAX_LOGS || 30);

  // ============= LIBERAÇÃO FACIAL DE USO ÚNICO (NOVO CADASTRO) =============
  // Cada visita concluída exige uma nova liberação da portaria. O leitor serve
  // para entrada e saída: a primeira leitura confirma a entrada (janela de
  // tolerância após o cadastro) e a seguinte registra a saída.
  const FACIAL_GRACE_MS = Number(process.env.PORTALGUARD_FACIAL_ENTRY_GRACE_MS || 120000);
  const FACIAL_SCAN_DEBOUNCE_MS = Number(process.env.PORTALGUARD_FACIAL_SCAN_DEBOUNCE_MS || 30000);
  const FACIAL_REQUEST_TTL_MS = Number(process.env.PORTALGUARD_FACIAL_REQUEST_TTL_MS || 300000);
  const FACIAL_DENY_COOLDOWN_MS = Number(process.env.PORTALGUARD_FACIAL_DENY_COOLDOWN_MS || 60000);

  function isBlockedVisitor(subject) {
    try {
      const rows = db.prepare('SELECT visitor_document, visitor_name FROM blocked_visitors WHERE is_active = 1').all();
      const doc = normalizeDocument(subject.document);
      const name = normalizeName(subject.name);
      return rows.some((b) => {
        const blockedDoc = normalizeDocument(b.visitor_document);
        return (doc && blockedDoc && doc === blockedDoc)
          || (name && normalizeName(b.visitor_name) === name);
      });
    } catch {
      return false;
    }
  }

  function loadVisitorEntries(subject) {
    try {
      return db.prepare(`SELECT * FROM access_entries
        WHERE visitor_type IN ('visitor', 'service_provider', 'delivery')
        ORDER BY entry_time DESC
        LIMIT 1000`).all().filter((entry) => sameVisitorSubject(entry, subject));
    } catch {
      return [];
    }
  }

  function decideVisitorAccess(deviceId, subject) {
    if (!subject?.subjectKey) return null;

    const visitorName = sanitizeString(subject.name, 200) || 'Visitante';
    const base = {
      resident: visitorName,
      resident_name: visitorName,
      resolved_user_id: subject.document ? hardwareIdFor(`sp-${subject.document}`) : 0,
      visitor_subject: subject,
    };

    if (isBlockedVisitor(subject)) {
      return { ...base, allow: false, reason: 'Pessoa bloqueada', source: 'db', visitor_action: 'blocked' };
    }

    const entries = loadVisitorEntries(subject);
    const template = entries[0] || null;
    const photoTemplate = entries.find((entry) => entry.photo_url) || template;
    const active = entries.find((entry) => !entry.exit_time);

    if (active) {
      const nowMs = Date.now();
      const entryAge = active.entry_time ? nowMs - new Date(active.entry_time).getTime() : Number.POSITIVE_INFINITY;
      const scanAge = active.entry_scan_at ? nowMs - new Date(active.entry_scan_at).getTime() : null;

      // O leitor pode capturar o mesmo rosto mais de uma vez em segundos: não
      // transformar a segunda leitura em saída.
      if (scanAge !== null && scanAge < FACIAL_SCAN_DEBOUNCE_MS) {
        return { ...base, allow: true, reason: 'Entrada em andamento', source: 'db', visitor_action: 'entry', visitor_entry_id: active.id };
      }

      // Entrada recém-cadastrada/aprovada: a primeira leitura apenas confirma
      // que a pessoa entrou, sem fechar a visita.
      if (!active.entry_scan_at && entryAge < FACIAL_GRACE_MS) {
        const ts = now();
        db.prepare('UPDATE access_entries SET entry_scan_at = ? WHERE id = ?').run(ts, active.id);
        const updated = db.prepare('SELECT * FROM access_entries WHERE id = ?').get(active.id);
        notifyRealtime('access_entries', 'UPDATE',
          { ...updated, auto_recognized: !!updated.auto_recognized },
          { ...active, auto_recognized: !!active.auto_recognized });
        return { ...base, allow: true, reason: 'Entrada confirmada', source: 'db', visitor_action: 'entry', visitor_entry_id: active.id };
      }

      return { ...base, allow: true, reason: 'Saída registrada', source: 'db', visitor_action: 'exit', visitor_entry_id: active.id };
    }

    const ts = now();
    const pending = db.prepare(`SELECT * FROM facial_release_requests
      WHERE subject_key = ? AND status = 'pending'
      ORDER BY requested_at DESC LIMIT 1`).get(subject.subjectKey);

    if (pending) {
      const pendingAge = Date.now() - new Date(pending.requested_at).getTime();
      if (pendingAge <= FACIAL_REQUEST_TTL_MS) {
        db.prepare('UPDATE facial_release_requests SET requested_at = ?, match_distance = ?, match_source = ? WHERE id = ?')
          .run(ts, subject.distance ?? null, subject.source || 'face', pending.id);
        return { ...base, allow: false, reason: 'Aguardando liberação da portaria', source: 'db', visitor_action: 'pending', release_request_id: pending.id };
      }
      db.prepare("UPDATE facial_release_requests SET status = 'expired', resolved_at = ? WHERE id = ?").run(ts, pending.id);
    }

    const denied = db.prepare(`SELECT * FROM facial_release_requests
      WHERE subject_key = ? AND status = 'denied'
      ORDER BY resolved_at DESC LIMIT 1`).get(subject.subjectKey);
    if (denied?.resolved_at && (Date.now() - new Date(denied.resolved_at).getTime()) < FACIAL_DENY_COOLDOWN_MS) {
      return { ...base, allow: false, reason: 'Liberação negada recentemente', source: 'db', visitor_action: 'denied' };
    }

    const requestId = genId();
    const photoUrl = photoTemplate?.photo_url || subject.photoUrl || null;
    db.prepare(`INSERT INTO facial_release_requests (
        id, device_id, subject_key, visitor_name, visitor_document, visitor_type,
        apartment, resident_id, resident_name, photo_url, company, vehicle_plate,
        vehicle_model, vehicle_color, purpose, badge_number, match_source, match_distance,
        status, requested_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      requestId,
      deviceId || null,
      subject.subjectKey,
      visitorName,
      subject.document || template?.visitor_document || null,
      subject.visitorType || template?.visitor_type || 'visitor',
      template?.apartment || '',
      template?.resident_id || null,
      template?.resident_name || null,
      photoUrl,
      template?.company || null,
      template?.vehicle_plate || null,
      template?.vehicle_model || null,
      template?.vehicle_color || null,
      template?.purpose || null,
      template?.badge_number || null,
      subject.source || 'face',
      subject.distance ?? null,
      'pending',
      ts,
    );

    const row = db.prepare('SELECT * FROM facial_release_requests WHERE id = ?').get(requestId);
    notifyRealtime('facial_release_requests', 'INSERT', row);
    return { ...base, allow: false, reason: 'Aguardando liberação da portaria', source: 'db', visitor_action: 'pending', release_request_id: requestId };
  }

  function closeVisitorEntry(entryId) {
    if (!entryId) return;
    try {
      const entry = db.prepare('SELECT * FROM access_entries WHERE id = ?').get(entryId);
      if (!entry || entry.exit_time) return;
      const ts = now();
      db.prepare('UPDATE access_entries SET exit_time = ?, entry_scan_at = COALESCE(entry_scan_at, entry_time, ?) WHERE id = ?')
        .run(ts, ts, entryId);
      const updated = db.prepare('SELECT * FROM access_entries WHERE id = ?').get(entryId);
      notifyRealtime('access_entries', 'UPDATE',
        { ...updated, auto_recognized: !!updated.auto_recognized },
        { ...entry, auto_recognized: !!entry.auto_recognized });
    } catch (e) {
      console.error('closeVisitorEntry error:', e);
    }
  }

  function trimVisualizationLogs(max = MAX_VISUALIZATION_LOGS) {
    try {
      const placeholders = VISUALIZATION_LOG_TYPES.map(() => '?').join(',');
      const stale = db.prepare(
        `SELECT id FROM controlid_logs WHERE event_type IN (${placeholders}) AND id NOT IN (
           SELECT id FROM controlid_logs WHERE event_type IN (${placeholders}) ORDER BY received_at DESC, rowid DESC LIMIT ?
         )`
      ).all(...VISUALIZATION_LOG_TYPES, ...VISUALIZATION_LOG_TYPES, max);
      if (!stale.length) return;
      const del = db.prepare('DELETE FROM controlid_logs WHERE id = ?');
      for (const { id } of stale) {
        del.run(id);
        notifyRealtime('controlid_logs', 'DELETE', null, { id });
      }
    } catch (e) {
      console.error('Error trimming controlid_logs:', e);
    }
  }

  function insertPushCommand(deviceId, command) {
    const id = genId();
    db.prepare('INSERT INTO push_command_queue (id, command, created_at, device_id, status) VALUES (?,?,?,?,?)')
      .run(id, JSON.stringify(command), now(), deviceId, 'pending');
    notifyRealtime('push_command_queue', 'INSERT', { id, command, created_at: now(), device_id: deviceId, status: 'pending' });
    return id;
  }

  function insertRealtimeEvent(type, description, priority, relatedId = null) {
    const id = genId();
    const ts = now();
    db.prepare('INSERT INTO realtime_events (id, type, description, priority, related_id, timestamp, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, sanitizeString(type, 50), sanitizeString(description, 200), sanitizeString(priority, 20), relatedId || null, ts, ts);
    notifyRealtime('realtime_events', 'INSERT', { id, type: sanitizeString(type, 50), description: sanitizeString(description, 200), priority: sanitizeString(priority, 20), related_id: relatedId || null, timestamp: ts, created_at: ts, user_id: null });
  }

  function saveAccessPhoto(deviceId, base64Data) {
    try {
      const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
      const normalizedBase64 = cleanBase64.replace(/-/g, '+').replace(/_/g, '/');
      const missingPadding = normalizedBase64.length % 4;
      const paddedBase64 = missingPadding === 0 ? normalizedBase64 : `${normalizedBase64}${'='.repeat(4 - missingPadding)}`;
      const buf = Buffer.from(paddedBase64, 'base64');
      if (buf.length === 0) return null;

      const safeDeviceId = String(deviceId || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
      const dir = path.join(PHOTOS_DIR, 'access-photos', safeDeviceId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = `${safeDeviceId}/${Date.now()}.jpg`;
      fs.writeFileSync(path.join(dir, path.basename(filePath)), buf);
      return filePath;
    } catch (e) {
      console.error('Error saving access photo:', e);
      return null;
    }
  }

  function resolveDeviceType(deviceId) {
    if (!deviceId) return null;
    if (deviceTypeCache.has(deviceId)) return deviceTypeCache.get(deviceId) ?? null;
    let resolvedType = null;
    try {
      const row = db.prepare('SELECT type FROM devices WHERE serial_number = ? OR ip_address = ? LIMIT 1').get(deviceId, deviceId);
      resolvedType = typeof row?.type === 'string' ? row.type : null;
    } catch (e) {
      console.error('Error resolving device type for identification response:', e);
    }
    deviceTypeCache.set(deviceId, resolvedType);
    return resolvedType;
  }

  const deviceTypeCache = new Map();
  const deviceActiveCache = new Map();
  const lastDeviceStatusWriteMap = new Map();
  const deviceRowIdCache = new Map();
  const lastConfigRefreshCheckMap = new Map();
  const lastStaleSweepMap = new Map();
  const emptyQueueUntilMap = new Map();

  const CONFIG_REFRESH_CHECK_INTERVAL_MS = 600000;
  const CONFIG_REFRESH_INTERVAL_MS = 1800000;
  const DEVICE_STATUS_WRITE_INTERVAL_MS = 180000;
  const STALE_SWEEP_INTERVAL_MS = 60000;
  const EMPTY_QUEUE_CACHE_MS = 8000;

  function isDeviceActive(deviceId) {
    if (!deviceId) return true;
    if (deviceActiveCache.has(deviceId)) return deviceActiveCache.get(deviceId) !== false;
    try {
      const row = db.prepare('SELECT is_active FROM devices WHERE serial_number = ? OR ip_address = ? LIMIT 1').get(deviceId, deviceId);
      const active = !(row?.is_active === 0 || row?.is_active === '0' || row?.is_active === false);
      deviceActiveCache.set(deviceId, active);
      return active;
    } catch (e) {
      return true;
    }
  }

  function updateDeviceStatus(deviceId) {
    const nowMs = Date.now();
    const lastWriteMs = lastDeviceStatusWriteMap.get(deviceId) || 0;
    if (nowMs - lastWriteMs < DEVICE_STATUS_WRITE_INTERVAL_MS) return;
    lastDeviceStatusWriteMap.set(deviceId, nowMs);

    let rowId = deviceRowIdCache.get(deviceId);
    if (!rowId) {
      const row = db.prepare('SELECT id FROM devices WHERE serial_number = ? OR ip_address = ? LIMIT 1').get(deviceId, deviceId);
      if (row?.id) { rowId = row.id; deviceRowIdCache.set(deviceId, rowId); }
    }
    if (rowId) {
      db.prepare("UPDATE devices SET last_sync = ?, status = 'online' WHERE id = ?").run(now(), rowId);
      const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(rowId);
      deviceActiveCache.set(deviceId, !(updated?.is_active === 0 || updated?.is_active === '0' || updated?.is_active === false));
      notifyRealtime('devices', 'UPDATE', updated);
    }
  }

  function matchResident(userName) {
    if (!userName || userName === 'Desconhecido') return null;

    const aptNameMatch = userName.match(/^(\d+)\s*[-–]\s*(.+)$/);
    if (aptNameMatch) {
      const apartment = aptNameMatch[1].trim();
      const name = aptNameMatch[2].trim();

      const byAptName = db.prepare('SELECT id, name, apartment FROM residents WHERE apartment = ? AND name LIKE ? LIMIT 1')
        .get(apartment, `%${name}%`);
      if (byAptName) return byAptName;

      const byApt = db.prepare('SELECT id, name, apartment FROM residents WHERE apartment = ? LIMIT 1').get(apartment);
      if (byApt) return byApt;
    }

    return db.prepare('SELECT id, name, apartment FROM residents WHERE name LIKE ? LIMIT 1').get(`%${userName}%`) || null;
  }

  function processAccessLogs(deviceId, objectChanges) {
    console.log('Processing access logs from Control iD, changes:', objectChanges.length);

    for (const change of objectChanges) {
      if (change.object === 'access_logs' && change.type === 'inserted') {
        const values = change.values || {};

        const userId = sanitizeString(values.user_id, 100);
        const cardValue = sanitizeString(values.card_value, 100);
        const eventDesc = sanitizeString(values.event, 100);
        const userName = extractUserName(values);

        let entryTime = now();
        if (values.time) {
          try {
            const ts = typeof values.time === 'number' ? values.time : parseInt(values.time, 10);
            if (!isNaN(ts)) entryTime = new Date(ts * 1000).toISOString();
          } catch { /* usa padrão */ }
        }

        const displayName = userName || userId || cardValue || 'Desconhecido';
        const resident = matchResident(displayName);

        insertRealtimeEvent(
          'entry',
          resident
            ? `Acesso reconhecido: ${resident.name} - Apto ${resident.apartment}`
            : `Acesso dispositivo: ${displayName} - Device ${deviceId}`,
          resident ? 'low' : 'medium'
        );

        console.log('Realtime event created from Control iD', resident ? `(matched: ${resident.name})` : '(no match)');
      }

      if (change.object === 'users' && (change.type === 'inserted' || change.type === 'updated')) {
        console.log('Control iD user sync event:', change.values?.name || change.values?.id);
      }
    }
  }

  function parseStoredCommand(command) {
    if (typeof command === 'string') {
      try { return JSON.parse(command); } catch { return {}; }
    }
    return command || {};
  }

  async function handler(req, res) {
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders).status(200).end();
      return;
    }

    const urlPath = req.path || '/api/controlid-webhook';
    const query = req.query || {};

    try {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.set(corsHeaders).status(405).json({ error: 'Method not allowed' });
        return;
      }

      const payload = parseRawBody(req.rawBody);
      const eventType = detectEventType(urlPath, payload);
      const deviceId = extractDeviceId(urlPath, query, payload, req);
      const isFcgiCallback = urlPath.toLowerCase().includes('.fcgi');

      if (eventType !== 'device_is_alive') {
        console.log('Control iD webhook received:', {
          method: req.method,
          path: urlPath,
          event_type: eventType,
          device_id: deviceId || 'unknown',
          timestamp: now(),
        });
      }

      // ===== PUSH MODE: dispositivo faz polling de comandos =====
      if (eventType === 'push_request' && (req.method === 'GET' || req.method === 'POST')) {
        if (deviceId) {
          runBackground('updateDeviceStatus', (async () => { updateDeviceStatus(deviceId); })());
        }

        // Expira comandos 'executing' obsoletos (throttled por dispositivo)
        if (deviceId) {
          const nowMs = Date.now();
          const lastSweep = lastStaleSweepMap.get(deviceId) || 0;
          if (nowMs - lastSweep > STALE_SWEEP_INTERVAL_MS) {
            lastStaleSweepMap.set(deviceId, nowMs);
            const staleThreshold = new Date(nowMs - 120000).toISOString();
            runBackground('expireStaleCommands', (async () => {
              db.prepare("UPDATE push_command_queue SET status = 'error', result = ? WHERE device_id = ? AND status = 'executing' AND executed_at < ?")
                .run(JSON.stringify({ error: 'auto_expired_stale_executing' }), deviceId, staleThreshold);
            })());
          }
        }

        // POST com corpo = resultado de um comando enviado antes
        if (req.method === 'POST' && req.rawBody && req.rawBody.trim()) {
          const executingCmd = db.prepare("SELECT id, command, executed_at FROM push_command_queue WHERE device_id = ? AND status = 'executing' ORDER BY created_at ASC LIMIT 1").get(deviceId);

          if (executingCmd) {
            const executedAt = executingCmd.executed_at ? new Date(executingCmd.executed_at).getTime() : 0;
            const isStale = executedAt > 0 && (Date.now() - executedAt) > 120000;

            if (isStale) {
              console.log('Ignoring stale result for command:', executingCmd.id, 'device:', deviceId);
              db.prepare("UPDATE push_command_queue SET status = 'error', result = ? WHERE id = ?")
                .run(JSON.stringify({ error: 'stale_result_discarded', received_payload: payload }), executingCmd.id);
            } else {
              console.log('Push result (via /push POST) from device:', deviceId, JSON.stringify(payload).substring(0, 300));

              // Não salvamos as imagens recebidas do dispositivo (sem captura de fotos).
              runBackground('storePushResultViaPush', (async () => {
                db.prepare("UPDATE push_command_queue SET status = 'done', executed_at = ?, result = ? WHERE id = ?")
                  .run(new Date().toISOString(), JSON.stringify(payload), executingCmd.id);
                insertControlidLog(deviceId, 'push_result', { ...payload, command_id: executingCmd.id }, true);
              })());
            }

            res.set(corsHeaders).status(200).end('');
            return;
          }
        }

        // Busca o comando pendente mais antigo
        const nowMsQ = Date.now();
        const emptyUntil = emptyQueueUntilMap.get(deviceId) || 0;
        let pendingCmd = null;
        if (nowMsQ >= emptyUntil) {
          pendingCmd = db.prepare("SELECT id, command FROM push_command_queue WHERE device_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1").get(deviceId);
          if (!pendingCmd) emptyQueueUntilMap.set(deviceId, nowMsQ + EMPTY_QUEUE_CACHE_MS);
        }

        if (pendingCmd) {
          const dispatchTime = new Date().toISOString();
          const marked = db.prepare("UPDATE push_command_queue SET status = 'executing', executed_at = ? WHERE id = ? AND status = 'pending'").run(dispatchTime, pendingCmd.id);

          if (marked.changes === 0) {
            res.set(corsHeaders).status(200).end('');
            return;
          }

          const cmd = parseStoredCommand(pendingCmd.command);
          const endpoint = String(cmd.endpoint || '').replace(/\.fcgi$/i, '');
          const pushCommand = {
            verb: cmd.verb || 'POST',
            endpoint,
            body: cmd.body ?? {},
            contentType: cmd.contentType || 'application/json',
          };

          console.log('Sending push command to device:', deviceId, JSON.stringify(pushCommand).substring(0, 200));
          res.set(corsHeaders).status(200).json(pushCommand);
          return;
        }

        // Sem comandos: re-envia push config periodicamente (evita queda após ~90min)
        // Desativado por padrão: dispositivos configurados com o utilitário local
        // guardam as settings no flash; re-envios periódicos sobrescreviam isso.
        if (deviceId && process.env.CONTROLID_AUTO_REFRESH === '1') {
          const nowMs = Date.now();
          const lastCheck = lastConfigRefreshCheckMap.get(deviceId) || 0;
          if (nowMs - lastCheck > CONFIG_REFRESH_CHECK_INTERVAL_MS) {
            lastConfigRefreshCheckMap.set(deviceId, nowMs);
            runBackground('autoRefreshConfig', (async () => {
              const cutoff = new Date(nowMs - CONFIG_REFRESH_INTERVAL_MS).toISOString();
              const lastCfg = db.prepare("SELECT created_at FROM push_command_queue WHERE device_id = ? AND status = 'done' AND json_extract(command, '$.endpoint') = 'set_configuration' AND created_at >= ? LIMIT 1").get(deviceId, cutoff);

              if (!lastCfg) {
                const pendingCfg = db.prepare("SELECT id FROM push_command_queue WHERE device_id = ? AND status IN ('pending','executing') AND json_extract(command, '$.endpoint') = 'set_configuration' LIMIT 1").get(deviceId);
                if (!pendingCfg) {
                  insertPushCommand(deviceId, { verb: 'POST', endpoint: 'set_configuration', body: buildWebhookConfig(req), contentType: 'application/json' });
                  console.log('Auto-queued config refresh for device:', deviceId);
                }
              }
            })());
          }
        }

        res.set(corsHeaders).status(200).end('');
        return;
      }

      // ===== PUSH RESULT =====
      if (eventType === 'push_result' && req.method === 'POST') {
        console.log('Push result from device:', deviceId, JSON.stringify(payload).substring(0, 300));

        if (deviceId) {
          const staleThreshold = new Date(Date.now() - 120000).toISOString();
          db.prepare("UPDATE push_command_queue SET status = 'error', result = ? WHERE device_id = ? AND status = 'executing' AND executed_at < ?")
            .run(JSON.stringify({ error: 'auto_expired_stale_executing' }), deviceId, staleThreshold);
        }

        const executingCmd = deviceId
          ? db.prepare("SELECT id, command FROM push_command_queue WHERE device_id = ? AND status = 'executing' ORDER BY created_at ASC LIMIT 1").get(deviceId)
          : null;

        if (executingCmd) {
          // Não salvamos as imagens recebidas do dispositivo (sem captura de fotos).
          runBackground('storePushResult', (async () => {
            db.prepare("UPDATE push_command_queue SET status = 'done', executed_at = ?, result = ? WHERE id = ?")
              .run(new Date().toISOString(), JSON.stringify(payload), executingCmd.id);
            insertControlidLog(deviceId, 'push_result', { ...payload, command_id: executingCmd.id }, true);
          })());
        }

        res.set(corsHeaders).status(200).end('');
        return;
      }

      // ===== SEND CONFIG: envia config direto ao IP do dispositivo =====
      if (eventType === 'send_config' && req.method === 'POST') {
        const targetIp = payload.device_ip;
        const targetPort = payload.device_port || '80';
        const targetSerial = payload.device_serial || '';

        if (!targetIp) {
          res.set(corsHeaders).status(400).json({ error: 'device_ip is required' });
          return;
        }

        console.log('Sending monitor config to device:', targetIp);
        const fullConfig = buildWebhookConfig(req);

        try {
          const loginUrl = `http://${targetIp}:${targetPort}/login.fcgi`;
          const loginResp = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: 'admin', password: 'admin' }),
            signal: AbortSignal.timeout(10000),
          });

          if (!loginResp.ok) {
            res.set(corsHeaders).status(502).json({ error: 'Failed to login to device', status: loginResp.status });
            return;
          }

          const loginData = await loginResp.json();
          const session = loginData.session;

          if (!session) {
            res.set(corsHeaders).status(502).json({ error: 'No session returned from device login' });
            return;
          }

          const configUrl = `http://${targetIp}:${targetPort}/set_configuration.fcgi?session=${session}`;
          const configResp = await fetch(configUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullConfig),
            signal: AbortSignal.timeout(10000),
          });

          const configResult = configResp.ok ? await configResp.text() : 'Failed';

          let verifyData = null;
          try {
            const verifyUrl = `http://${targetIp}:${targetPort}/get_configuration.fcgi?session=${session}`;
            const verifyResp = await fetch(verifyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ monitor: true, push_server: true }),
              signal: AbortSignal.timeout(10000),
            });
            if (verifyResp.ok) verifyData = await verifyResp.json();
          } catch (e) {
            console.log('Could not verify config:', e);
          }

          insertControlidLog(targetSerial || targetIp, 'config_push', { sent_config: fullConfig, verify_result: verifyData, config_response: configResult, target_ip: targetIp }, true);

          res.set(corsHeaders).status(configResp.ok ? 200 : 502).json({
            success: configResp.ok,
            message: configResp.ok ? 'Configuration sent successfully (monitor + push)' : 'Failed to set configuration',
            sent_config: fullConfig,
            current_config: verifyData || null,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error('Error sending config to device:', errorMsg);
          res.set(corsHeaders).status(502).json({
            error: 'Cannot reach device',
            details: errorMsg,
            hint: 'Verifique se o dispositivo está na mesma rede e acessível a partir deste computador.',
          });
        }
        return;
      }

      // ===== PUSH CONFIG: enfileira set_configuration via push mode =====
      if (eventType === 'push_config' && req.method === 'POST') {
        const targetDeviceId = payload.device_id || payload.deviceId || deviceId;

        if (!targetDeviceId) {
          res.set(corsHeaders).status(400).json({ error: 'device_id is required' });
          return;
        }

        const fullConfig = buildWebhookConfig(req);
        const command = { verb: 'POST', endpoint: 'set_configuration', body: fullConfig, contentType: 'application/json' };

        try {
          insertPushCommand(targetDeviceId, command);
        } catch (e) {
          console.error('Error queuing push command:', e);
          res.set(corsHeaders).status(500).json({ error: 'Failed to queue command', details: e.message });
          return;
        }

        console.log('Queued push config for device (DB-backed):', targetDeviceId);
        insertControlidLog(targetDeviceId, 'config_push_queued', { queued_config: fullConfig }, false);

        res.set(corsHeaders).status(200).json({
          success: true,
          message: 'Configuration queued for push (persistent). Device will receive it on next poll.',
          config: fullConfig,
        });
        return;
      }

      // ===== session_is_valid.fcgi =====
      if (eventType === 'session_is_valid') {
        res.set(corsHeaders).status(200).json({ session_is_valid: true });
        return;
      }

      // ===== Heartbeat =====
      if (eventType === 'device_is_alive') {
        if (deviceId) updateDeviceStatus(deviceId);
        res.set(corsHeaders).status(200).end('');
        return;
      }

      const effectiveDeviceId = deviceId || 'unknown-device';

      if (!checkRateLimit(effectiveDeviceId)) {
        console.error('Rate limit exceeded', { device_id: effectiveDeviceId });
        res.set(corsHeaders).status(429).json({ error: 'Too many requests' });
        return;
      }

      // ===== IDENTIFICAÇÃO: responder abertura IMEDIATAMENTE, DB em background =====
      if (eventType === 'identification_event') {
        // Critical: the device has a short timeout (~15s) and will NOT open the door if
        // the response is delayed by database operations.
        if (!isDeviceActive(effectiveDeviceId)) {
          console.log('Device disabled, denying identification:', effectiveDeviceId);
          const identResponse = buildDeniedResponse(payload, urlPath);
          res.set(corsHeaders).status(200).json(identResponse);
          runBackground('identificationPostProcessDisabled', (async () => {
            try {
              const enrichedPayload = payload;
              insertControlidLog(effectiveDeviceId, eventType, enrichedPayload, false);
            } catch (e) {
              console.error('Error in disabled device post-processing:', e);
            }
          })());
          return;
        }
        const [deviceType, decision] = await Promise.all([
          Promise.resolve(resolveDeviceType(effectiveDeviceId)),
          evaluateCentralAccess(db, payload),
        ]);

        // ===== IDENTIFICAÇÃO CENTRALIZADA POR ROSTO =====
        // Quando o equipamento detecta um rosto mas não identifica a pessoa
        // (event sem TAG e sem nome), o PortalGuard puxa o frame da câmera do
        // leitor e casa o rosto contra as fotos dos moradores. A decisão do
        // banco continua sendo a juíza; o rosto só ENTRA quando não há nada.
        const rawCard = String(payload?.card_value ?? '');
        const hasCard = rawCard.replace(/^0+/, '') !== '';
        const deviceUserId = Number.parseInt(String(payload?.user_id ?? '0'), 10) || 0;
        const deviceEvent = Number.parseInt(String(payload?.event ?? '0'), 10) || 0;
        // O equipamento NUNCA identificou positivamente (user_id sempre 0 nos
        // eventos reais). Só pulamos o rosto quando há TAG ou quando o próprio
        // equipamento concedeu (event 7). Um nome vindo do equipamento sem
        // user_id não conta como identificação confiável.
        const devicePositivelyIdentified = deviceUserId > 0 || deviceEvent === 7;
        const unidentified = !hasCard && !devicePositivelyIdentified;
        let finalDecision = decision;
        let faceResult = null;

        if (faceEngine && unidentified && !decision.allow && decision.source === 'db') {
          const deviceAddress = resolveDeviceAddress(effectiveDeviceId);
          if (deviceAddress) {
            try {
              faceResult = await withTimeout(
                faceEngine.identifyFromDevice(deviceAddress, faceEngine.defaultThreshold),
                FACE_TIMEOUT_MS,
                { matched: false, reason: 'timeout' },
              );
            } catch (e) {
              faceResult = { matched: false, reason: `erro:${e.message}` };
            }
            console.log('Face identification:', { device_id: effectiveDeviceId, address: deviceAddress, ...faceResult });
            // Visitante reconhecido NÃO abre direto: passa pela regra de uso
            // único (saída ou liberação da portaria). Só morador abre aqui.
            if (faceResult?.matched && faceResult.kind !== 'visitor') {
              finalDecision = {
                allow: true,
                source: 'face',
                reason: `Rosto reconhecido: ${faceResult.name}`,
                resident: faceResult.name,
                resident_name: faceResult.name,
                resident_id: faceResult.residentId,
                resolved_user_id: faceResult.residentId,
                face_distance: faceResult.distance,
              };
            }
          } else {
            console.warn('Face identification: endereço do dispositivo não encontrado', effectiveDeviceId);
          }
        }

        // A decisão do banco (ou do rosto) é autoritativa. Se o motor central não
        // respondeu a tempo (fallback/timeout), respeitamos a decisão do próprio
        // equipamento (event 7 = identificou localmente) para o portão nunca abrir
        // às cegas.
        // Cadastro do Novo Cadastro identificado pelo rosto ou pelo equipamento:
        // aplica a regra de uso único (saída, confirmação de entrada ou pedido
        // de liberação para a portaria).
        if (!finalDecision.allow) {
          const faceSubject = faceResult?.matched && faceResult.kind === 'visitor'
            ? {
                subjectKey: faceResult.subjectKey,
                name: faceResult.name,
                document: faceResult.document,
                visitorType: faceResult.visitorType,
                photoUrl: faceResult.photoUrl,
                source: 'face',
                distance: faceResult.distance,
              }
            : null;
          const subject = finalDecision.visitor_subject || faceSubject;
          if (subject) {
            const visitorDecision = decideVisitorAccess(effectiveDeviceId, subject);
            if (visitorDecision) finalDecision = visitorDecision;
          }
        }

        const deviceGranted = Number.parseInt(String(payload?.event ?? '0'), 10) === 7;
        const authoritative = finalDecision.source === 'db' || finalDecision.source === 'face';
        const allowByDb = authoritative ? finalDecision.allow : deviceGranted;
        const identResponse = allowByDb
          ? buildIdentificationResponse(payload, urlPath, deviceType, finalDecision)
          : buildDeniedResponse(payload, urlPath);
        console.log('Central access decision:', { device_id: effectiveDeviceId, ...finalDecision });
        console.log('Identification response (immediate):', {
          device_id: effectiveDeviceId,
          device_type: deviceType,
          path: urlPath,
          portal_id: payload?.portal_id,
          event_in: payload?.event,
          response: identResponse,
        });

        runBackground('identificationPostProcess', (async () => {
          try {
            // Não armazenamos fotos: estes eventos servem apenas para a
            // visualização da portaria (nome + horário). As fotos eram o que
            // mais ocupava espaço em disco.
            const extra = {};
            if (faceResult) {
              extra.face_identification = {
                matched: !!faceResult.matched,
                reason: faceResult.reason || null,
                distance: faceResult.distance ?? null,
                resident_id: faceResult.residentId || null,
                resident_name: (finalDecision?.source === 'face' && finalDecision.resident_name) || faceResult.name || null,
              };
            }
            const enrichedPayload = Object.keys(extra).length ? { ...payload, ...extra } : payload;
            insertControlidLog(effectiveDeviceId, eventType, enrichedPayload, false);

            // Prestador de servico fixo / empregado domestico: registra a
            // passagem no log de acesso (nao em "Ativos no Condominio").
            if (allowByDb) recordCollaboratorAccess(finalDecision?.resident_id);

            // Visitante saindo: fecha a visita ativa (o cadastro continua
            // existindo para a próxima liberação).
            if (allowByDb && finalDecision.visitor_action === 'exit' && finalDecision.visitor_entry_id) {
              closeVisitorEntry(finalDecision.visitor_entry_id);
            }

            // Auto-sync de vehicle_tag
            const cardValue = String(payload.card_value || '');
            const identUserName = String(payload.user_name || '');
            if (cardValue && identUserName) {
              try {
                const deviceRow = db.prepare('SELECT type FROM devices WHERE serial_number = ? OR ip_address = ? LIMIT 1').get(effectiveDeviceId, effectiveDeviceId);
                if (deviceRow?.type === 'vehicle_tag') {
                  const aptMatch = identUserName.match(/^(\d+\w?)\s*[-–]\s*(.+)$/i);
                  if (aptMatch) {
                    const [, apt, extractedName] = aptMatch;
                    const normalizedName = extractedName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                    const residents = db.prepare('SELECT id, name, vehicle_tag FROM residents WHERE apartment LIKE ?').all(`%${apt.trim()}`);

                    if (residents.length > 0) {
                      const matched = residents.find((resident) => {
                        const residentName = String(resident.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                        return residentName.includes(normalizedName) || normalizedName.includes(residentName);
                      }) || (residents.length === 1 ? residents[0] : null);

                      if (matched && matched.vehicle_tag !== cardValue) {
                        db.prepare('UPDATE residents SET vehicle_tag = ? WHERE id = ?').run(cardValue, matched.id);
                        const updated = db.prepare('SELECT * FROM residents WHERE id = ?').get(matched.id);
                        notifyRealtime('residents', 'UPDATE', updated);
                        console.log(`Auto-synced vehicle_tag ${cardValue} to resident ${matched.name} (${apt})`);
                      }
                    }
                  }
                }
              } catch (e) {
                console.error('Error auto-syncing vehicle_tag:', e);
              }
            }

            // Não enfileiramos mais user_get_image: a portaria não guarda fotos.
          } catch (e) {
            console.error('Error in identification post-processing:', e);
          }
        })());

        res.set(corsHeaders).status(200).json(identResponse);
        return;
      }

      // ===== Eventos NÃO relacionados a identificação =====
      // Sem captura de fotos: a portaria só precisa do nome/horário na tela.
      if (!isDeviceActive(effectiveDeviceId) && eventType !== 'device_is_alive') {
        console.log('Device disabled, ignoring non-identification event:', effectiveDeviceId, eventType);
        res.set(corsHeaders).status(200).end('');
        return;
      }
      try {
        insertControlidLog(effectiveDeviceId, eventType, payload, false);
      } catch (e) {
        console.error('Error saving Control iD log:', e);
      }

      if (eventType === 'dao' && payload.object_changes) {
        processAccessLogs(effectiveDeviceId, payload.object_changes);
      }

      if (isFcgiCallback) {
        res.set(corsHeaders).status(200).end('');
        return;
      }

      res.set(corsHeaders).status(200).json({ success: true, event_type: eventType, photo_saved: false });
    } catch (error) {
      console.error('Error processing Control iD webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.set(corsHeaders).status(500).json({ error: errorMessage });
    }
  }

  app.all('/api/controlid-webhook', handler);
  app.all('/api/controlid-webhook/*', handler);
}
