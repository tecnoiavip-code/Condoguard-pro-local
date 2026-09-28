import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  db, now, genId, hashPassword, verifyPassword,
  createUser, getUserByEmail, getUserById, getUserRoles,
  seedAdmin, parseSeedFile, PHOTOS_DIR,
} from './db.js';
import { registerControlidWebhook, buildWebhookConfig } from './controlid-webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

parseSeedFile();
const admin = seedAdmin();
console.log(`[portalguard-local] Banco: ${process.env.PGDATA_DIR || path.join(__dirname, '..', 'data', 'portalguard.db')}`);
console.log(`[portalguard-local] Admin: ${admin.email}`);

const app = express();

// O webhook do Control iD precisa do corpo BRUTO (JSON ou form-encoded) e roda
// sem autenticação (o dispositivo não conhece o token). Registrado antes do
// express.json para capturar o stream.
registerControlidWebhook(app, { db, now, genId, notifyRealtime, PHOTOS_DIR });

app.use(express.json({ limit: '50mb' }));

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const KNOWN_TABLES = new Set([
  'access_entries', 'announcement_attachments', 'announcement_reads', 'announcements',
  'blocked_visitors', 'chat_messages', 'controlid_config', 'controlid_logs', 'devices',
  'incidents', 'mails', 'notifications', 'portaria_equipment', 'profiles', 'push_command_queue',
  'push_subscriptions', 'realtime_events', 'residents', 'shift_acknowledgments', 'shift_equipment_checks', 'shifts',
  'user_roles', 'vapid_keys', 'vehicles', 'visitor_authorizations',
]);

const JSON_COLUMNS = {
  shifts: ['team_members'],
  controlid_logs: ['payload'],
  push_command_queue: ['command', 'result'],
};

const BOOLEAN_COLUMNS = {
  access_entries: ['auto_recognized'],
  blocked_visitors: ['is_active'],
  controlid_config: ['is_active'],
  controlid_logs: ['processed'],
  portaria_equipment: ['is_active'],
  chat_messages: ['read'],
  notifications: ['read'],
  visitor_authorizations: ['single_use'],
};

const COLUMNS = {};
function readTableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
}
function tableColumns(table) {
  if (!COLUMNS[table]) {
    COLUMNS[table] = readTableColumns(table);
  }
  return COLUMNS[table];
}
// Re-lê o schema quando uma coluna solicitada não estiver no cache: permite que
// migrações aplicadas (ex.: novas colunas) passem a valer sem reiniciar o servidor.
function invalidateIfColumnMissing(table, names) {
  const cols = tableColumns(table);
  const list = Array.isArray(names) ? names : [names];
  if (list.some(n => n && !cols.has(n))) {
    COLUMNS[table] = readTableColumns(table);
  }
  return COLUMNS[table];
}

function sanitizeWrite(table, row) {
  const out = {};
  const cols = invalidateIfColumnMissing(table, Object.keys(row));
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || !cols.has(k)) continue;
    let val = v;
    if ((JSON_COLUMNS[table] || []).includes(k)) {
      val = typeof v === 'string' ? v : JSON.stringify(v);
    } else if ((BOOLEAN_COLUMNS[table] || []).includes(k)) {
      val = v === true ? 1 : v === false ? 0 : v;
    }
    out[k] = val;
  }
  return out;
}

function sanitizeRead(table, row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of JSON_COLUMNS[table] || []) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { /* keep as string */ }
    }
  }
  for (const k of BOOLEAN_COLUMNS[table] || []) {
    if (out[k] === 1) out[k] = true;
    else if (out[k] === 0) out[k] = false;
  }
  return out;
}

function project(row, selectCols) {
  if (!row || !selectCols || selectCols === '*') return row;
  const out = {};
  for (const c of selectCols) if (c in row) out[c] = row[c];
  return out;
}

// ---------- Realtime (SSE) ----------
const realtimeClients = new Set();

function notifyRealtime(table, event, newRow = null, oldRow = null) {
  const payload = JSON.stringify({ table, event, new: newRow, old: oldRow });
  for (const res of realtimeClients) {
    try { res.write(`data: ${payload}\n\n`); } catch { /* ignore */ }
  }
}

app.get('/api/realtime', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  realtimeClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* ignore */ }
  }, 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    realtimeClients.delete(res);
  });
});

// ---------- Auth ----------
function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now());
  db.prepare('INSERT INTO auth_sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(genId(), userId, token, now(), new Date(Date.now() + SESSION_TTL_MS).toISOString());
  return token;
}

function publicUser(row) {
  if (!row) return null;
  const roles = getUserRoles(row.id);
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.created_at,
    created_at: row.created_at,
    user_metadata: { full_name: row.full_name },
    app_metadata: { roles, provider: 'local' },
  };
}

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function authMiddleware(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: { message: 'No token provided' } });
  const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token);
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: { message: 'Session expired or invalid' } });
  }
  const user = getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: { message: 'User not found' } });
  req.user = user;
  req.token = token;
  next();
}

app.post('/api/auth/signin', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ data: null, error: { message: 'Email e senha são obrigatórios' } });
  const user = getUserByEmail(String(email));
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(400).json({ data: null, error: { message: 'Invalid login credentials' } });
  }
  const token = createSession(user.id);
  res.json({ data: { user: publicUser(user), session: { access_token: token, token_type: 'bearer', expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(), user: publicUser(user) } }, error: null });
});

app.post('/api/auth/signup', (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ data: null, error: { message: 'Email e senha são obrigatórios' } });
  if (String(password).length < 6) return res.status(400).json({ data: null, error: { message: 'Password should be at least 6 characters' } });
  if (getUserByEmail(String(email))) {
    return res.status(400).json({ data: null, error: { message: 'User already registered' } });
  }
  const user = createUser({ email, password, fullName: full_name || '' });
  res.status(201).json({ data: { user: publicUser(user), session: null }, error: null });
});

app.post('/api/auth/signout', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(req.token);
  res.json({ data: null, error: null });
});

app.get('/api/auth/session', authMiddleware, (req, res) => {
  res.json({ data: { session: { access_token: req.token, user: publicUser(req.user) }, user: publicUser(req.user) }, error: null });
});

app.get('/api/auth/user', authMiddleware, (req, res) => {
  res.json({ data: { user: publicUser(req.user) }, error: null });
});

app.post('/api/auth/reset-password', (req, res) => {
  res.json({ data: null, error: { message: 'Modo offline: o envio de e-mail está desativado. Peça ao administrador para redefinir sua senha.' } });
});

app.post('/api/auth/update-password', authMiddleware, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ data: null, error: { message: 'A senha deve ter pelo menos 6 caracteres' } });
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(String(password)), now(), req.user.id);
  res.json({ data: { ok: true }, error: null });
});

app.post('/api/auth/update-user', authMiddleware, (req, res) => {
  const { full_name, password } = req.body || {};
  if (full_name) {
    db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(full_name, now(), req.user.id);
    db.prepare('UPDATE profiles SET full_name = ? WHERE id = ?').run(full_name, req.user.id);
  }
  if (password) {
    if (String(password).length < 6) {
      return res.status(400).json({ data: null, error: { message: 'A senha deve ter pelo menos 6 caracteres' } });
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(String(password)), now(), req.user.id);
  }
  const updated = getUserById(req.user.id);
  res.json({ data: { user: publicUser(updated) }, error: null });
});

// ---------- Filter / OR parsing ----------
function parseOrExpression(expr, params) {
  const conditions = [];
  const clauses = splitTopLevel(expr.replace(/^and\s*\(/i, '').replace(/\)$/, ''));
  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([\w.]+)\.(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/);
    if (!m) continue;
    const [, col, op, rawVal] = m;
    if (op === 'in') {
      const vals = rawVal.slice(1, -1).split(',').map(v => v.trim());
      const placeholders = vals.map(() => '?').join(',');
      conditions.push(`\`${col}\` IN (${placeholders})`);
      params.push(...vals);
    } else if (op === 'is') {
      if (rawVal === 'null') { conditions.push(`\`${col}\` IS NULL`); }
      else if (rawVal === 'true') { conditions.push(`\`${col}\` = 1`); }
      else if (rawVal === 'false') { conditions.push(`\`${col}\` = 0`); }
      else { conditions.push(`\`${col}\` IS ?`); params.push(rawVal); }
    } else if (op === 'ilike' || op === 'like') {
      conditions.push(`\`${col}\` LIKE ?`);
      params.push(rawVal.replace(/[*]/g, '%'));
    } else {
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      conditions.push(`\`${col}\` ${opMap[op] || op} ?`);
      params.push(rawVal);
    }
  }
  return conditions;
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0, current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function buildWhere(filters, orExpr, params) {
  const conditions = [];
  for (const f of filters || []) {
    const { col, op, value, not } = f;
    const prefix = not ? 'NOT ' : '';
    switch (op) {
      case 'eq': conditions.push(`(${prefix}\`${col}\` = ?)`); params.push(value); break;
      case 'neq': conditions.push(`(${prefix}\`${col}\` != ?)`); params.push(value); break;
      case 'gt': conditions.push(`(${prefix}\`${col}\` > ?)`); params.push(value); break;
      case 'gte': conditions.push(`(${prefix}\`${col}\` >= ?)`); params.push(value); break;
      case 'lt': conditions.push(`(${prefix}\`${col}\` < ?)`); params.push(value); break;
      case 'lte': conditions.push(`(${prefix}\`${col}\` <= ?)`); params.push(value); break;
      case 'is':
        if (value === null) conditions.push(`(\`${col}\` IS ${prefix ? 'NOT ' : ''}NULL)`);
        else if (value === true) conditions.push(`(${prefix}\`${col}\` = 1)`);
        else if (value === false) conditions.push(`(${prefix}\`${col}\` = 0)`);
        else conditions.push(`(\`${col}\` IS ?)`), params.push(value);
        break;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          const ph = value.map(() => '?').join(',');
          conditions.push(`(${prefix}\`${col}\` IN (${ph}))`);
          params.push(...value);
        } else {
          conditions.push(`(${prefix}0)`);
        }
        break;
      case 'ilike':
      case 'like':
        conditions.push(`(${prefix}\`${col}\` LIKE ?)`);
        params.push(value);
        break;
      default: break;
    }
  }
  if (orExpr) conditions.push(`(${parseOrExpression(orExpr, params).join(' OR ')})`);
  return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
}

// ---------- Generic table API ----------
app.get('/api/table/:table', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!KNOWN_TABLES.has(table)) return res.status(400).json({ data: null, error: { message: `Unknown table: ${table}` } });
  const selectRaw = typeof req.query.select === 'string' ? req.query.select : '*';
  const requestedCols = selectRaw === '*' ? [] : selectRaw.split(',').map(c => c.trim()).filter(Boolean);
  const selectCols = selectRaw === '*' ? '*' : requestedCols.filter(c => invalidateIfColumnMissing(table, requestedCols).has(c));
  const filters = req.query.filters ? JSON.parse(req.query.filters) : [];
  const orExpr = typeof req.query.or === 'string' ? req.query.or : null;
  const orderCol = typeof req.query.order === 'string' && tableColumns(table).has(req.query.order) ? req.query.order : null;
  const ascending = req.query.ascending !== 'false';
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : null;
  const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
  const countExact = req.query.count === 'exact';
  const headOnly = req.query.head === 'true';

  const params = [];
  const where = buildWhere(filters, orExpr, params);

  try {
    let count = null;
    if (countExact) {
      const countRow = db.prepare(`SELECT COUNT(*) AS c FROM \`${table}\`${where}`).get(...params);
      count = countRow.c;
    }
    if (headOnly) {
      return res.json({ data: [], count, error: null });
    }
    let sql = `SELECT * FROM \`${table}\`${where}`;
    if (orderCol) sql += ` ORDER BY \`${orderCol}\` ${ascending ? 'ASC' : 'DESC'}`;
    if (limit !== null) sql += ` LIMIT ? OFFSET ?`;
    const rows = limit !== null
      ? db.prepare(sql).all(...params, limit, offset)
      : db.prepare(sql).all(...params);
    const data = rows.map(r => project(sanitizeRead(table, r), selectCols));
    res.json({ data, count, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  }
});

function fillDefaults(table, row) {
  const cols = tableColumns(table);
  const out = { ...row };
  if (!out.id) out.id = genId();
  if (cols.has('created_at') && !out.created_at) out.created_at = now();
  if (cols.has('updated_at') && !out.updated_at) out.updated_at = now();
  if (table === 'access_entries' && !out.entry_time) out.entry_time = now();
  return out;
}

app.post('/api/table/:table', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!KNOWN_TABLES.has(table)) return res.status(400).json({ data: null, error: { message: `Unknown table: ${table}` } });
  const row = sanitizeWrite(table, fillDefaults(table, req.body.row || {}));
  try {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(',');
    db.prepare(`INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES (${placeholders})`).run(...cols.map(c => row[c]));
    const inserted = db.prepare(`SELECT * FROM \`${table}\` WHERE id = ?`).get(row.id);
    notifyRealtime(table, 'INSERT', sanitizeRead(table, inserted));
    res.status(201).json({ data: [sanitizeRead(table, inserted)], error: null });
  } catch (e) {
    res.status(400).json({ data: null, error: { message: e.message } });
  }
});

app.patch('/api/table/:table', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!KNOWN_TABLES.has(table)) return res.status(400).json({ data: null, error: { message: `Unknown table: ${table}` } });
  const { set, filters, or } = req.body || {};
  const setRow = sanitizeWrite(table, { ...(set || {}) });
  if (Object.keys(setRow).length === 0) return res.json({ data: [], error: null });

  const params = [];
  const where = buildWhere(filters || [], or || null, params);
  try {
    const oldRows = db.prepare(`SELECT * FROM \`${table}\`${where}`).all(...params);
    const setCols = Object.keys(setRow);
    const setSql = setCols.map(c => `\`${c}\` = ?`).join(', ');
    db.prepare(`UPDATE \`${table}\` SET ${setSql}${where}`).run(...setCols.map(c => setRow[c]), ...params);
    const updatedRows = db.prepare(`SELECT * FROM \`${table}\`${where}`).all(...params);
    const mapped = updatedRows.map(r => sanitizeRead(table, r));
    mapped.forEach(r => notifyRealtime(table, 'UPDATE', r, oldRows.find(o => o.id === r.id) || null));
    res.json({ data: mapped, error: null });
  } catch (e) {
    res.status(400).json({ data: null, error: { message: e.message } });
  }
});

app.delete('/api/table/:table', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!KNOWN_TABLES.has(table)) return res.status(400).json({ data: null, error: { message: `Unknown table: ${table}` } });
  const { filters, or } = req.body || {};
  const params = [];
  const where = buildWhere(filters || [], or || null, params);
  try {
    const oldRows = db.prepare(`SELECT * FROM \`${table}\`${where}`).all(...params);
    db.prepare(`DELETE FROM \`${table}\`${where}`).run(...params);
    oldRows.forEach(r => notifyRealtime(table, 'DELETE', null, sanitizeRead(table, r)));
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(400).json({ data: null, error: { message: e.message } });
  }
});

app.post('/api/table/:table/upsert', authMiddleware, (req, res) => {
  const { table } = req.params;
  if (!KNOWN_TABLES.has(table)) return res.status(400).json({ data: null, error: { message: `Unknown table: ${table}` } });
  const { rows, onConflict } = req.body || {};
  const conflictKey = onConflict || 'id';
  if (!Array.isArray(rows)) return res.status(400).json({ data: null, error: { message: 'rows must be an array' } });
  const inserted = [];
  const errors = [];
  const selectStmt = db.prepare(`SELECT * FROM \`${table}\` WHERE \`${conflictKey}\` = ?`);
  for (const raw of rows) {
    try {
      const rawRow = sanitizeWrite(table, raw);
      const keyValue = rawRow[conflictKey];
      if (keyValue === undefined || keyValue === null) throw new Error(`Missing conflict key value: ${conflictKey}`);
      const existing = selectStmt.get(keyValue);
      const row = existing
        ? { ...rawRow, ...(tableColumns(table).has('updated_at') ? { updated_at: now() } : {}) }
        : fillDefaults(table, rawRow);
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      const quotedCols = cols.map(c => `\`${c}\``).join(', ');
      const updates = cols.filter(c => c !== conflictKey).map(c => `\`${c}\` = excluded.\`${c}\``).join(', ');
      const insertSql = updates
        ? `INSERT INTO \`${table}\` (${quotedCols}) VALUES (${placeholders}) ON CONFLICT(\`${conflictKey}\`) DO UPDATE SET ${updates}`
        : `INSERT OR IGNORE INTO \`${table}\` (${quotedCols}) VALUES (${placeholders})`;
      db.prepare(insertSql).run(...cols.map(c => row[c]));
      const result = selectStmt.get(keyValue);
      notifyRealtime(table, existing ? 'UPDATE' : 'INSERT', sanitizeRead(table, result), existing ? sanitizeRead(table, existing) : null);
      inserted.push(result);
    } catch (e) {
      errors.push(e.message);
    }
  }
  const error = errors.length > 0 ? { message: errors.join('; ') } : null;
  res.status(error ? 400 : 200).json({ data: inserted.map(r => sanitizeRead(table, r)), error });
});

// ---------- RPC: Convite Virtual com QR Code ----------
const STAFF_ROLES = ['admin', 'security_guard', 'receptionist'];

function currentUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token);
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  return getUserById(session.user_id) || null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatPT = (iso) => {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

function findGuestPassByToken(token) {
  if (!token || typeof token !== 'string') return null;
  return db.prepare(`
    SELECT va.*, r.apartment AS resident_apartment, r.name AS resident_full_name
      FROM visitor_authorizations va
      LEFT JOIN residents r ON r.id = va.resident_id
     WHERE va.qr_code_token = ? COLLATE NOCASE
  `).get(token.trim());
}

// Pública (anon): o convidado que abre /convite/:token não tem sessão.
app.post('/api/rpc/validate_guest_pass', (req, res) => {
  const { args = {} } = req.body || {};
  const row = findGuestPassByToken(args._token);
  const user = currentUser(req);
  const isStaff = !!user && getUserRoles(user.id).some(r => STAFF_ROLES.includes(r));

  if (!row) {
    return res.json({ data: { found: false, valid: false, status: 'not_found', reason: 'Convite não encontrado' }, error: null });
  }

  const today = todayISO();
  const d = String(row.authorized_date || '').slice(0, 10);
  const until = row.authorized_until ? String(row.authorized_until).slice(0, 10) : d;

  let status = 'today', reason = null, valid = true;
  const used = row.single_use === 1 && row.used_at;
  if (row.status === 'rejected') { status = 'rejected'; reason = 'Convite rejeitado'; valid = false; }
  else if (used) { status = 'used'; reason = 'Convite já utilizado'; valid = false; }
  else if (today < d) { status = 'future'; reason = 'Autorizado para data futura'; valid = false; }
  else if (today > until) { status = 'expired'; reason = 'Convite expirado'; valid = false; }

  return res.json({
    data: {
      found: true, valid, status, reason,
      visitor_name: row.visitor_name,
      apartment: row.resident_apartment || null,
      authorized_date: d,
      authorized_until: until,
      purpose: row.purpose || null,
      vehicle_plate: row.vehicle_plate || null,
      single_use: row.single_use === 1,
      used_at: row.used_at || null,
      entry_count: row.entry_count || 0,
      visitor_document: isStaff ? (row.visitor_document || null) : null,
      resident_id: isStaff ? row.resident_id : null,
      resident_name: isStaff ? (row.resident_full_name || null) : null,
    },
    error: null,
  });
});

// Pública (anon): pré-check-in do convidado (o token é a credencial do portador).
// Troca de modo (uso único / dia todo): somente o morador responsável autenticado.
app.post('/api/rpc/update_guest_pass', (req, res) => {
  const { args = {} } = req.body || {};
  const row = findGuestPassByToken(args._token);
  if (!row) {
    return res.json({ data: { ok: false, message: 'Convite não encontrado' }, error: null });
  }

  if (args._single_use !== null && args._single_use !== undefined) {
    const user = currentUser(req);
    const roles = user ? getUserRoles(user.id) : [];
    if (!roles.includes('resident')) {
      return res.json({ data: { ok: false, message: 'Somente o morador pode alterar o modo do convite' }, error: null });
    }
    const owner = db.prepare('SELECT id FROM residents WHERE id = ? AND auth_user_id = ?').get(row.resident_id, user.id);
    if (!owner) {
      return res.json({ data: { ok: false, message: 'Este convite não pertence ao seu apartamento' }, error: null });
    }
    db.prepare('UPDATE visitor_authorizations SET single_use = ?, updated_at = ? WHERE id = ?')
      .run(args._single_use === true ? 1 : 0, now(), row.id);
  }

  if (args._vehicle_plate || args._vehicle_model) {
    db.prepare('UPDATE visitor_authorizations SET vehicle_plate = COALESCE(?, vehicle_plate), vehicle_model = COALESCE(?, vehicle_model), updated_at = ? WHERE id = ?')
      .run(args._vehicle_plate || null, args._vehicle_model || null, now(), row.id);
  }

  return res.json({ data: { ok: true }, error: null });
});

// Staff autenticado: valida em segurança, cria access_entries e notifica.
app.post('/api/rpc/redeem_guest_pass', authMiddleware, (req, res) => {
  const roles = getUserRoles(req.user.id);
  if (!roles.some(r => STAFF_ROLES.includes(r))) {
    return res.json({ data: { ok: false, message: 'Acesso negado' }, error: null });
  }

  const { args = {} } = req.body || {};
  const row = findGuestPassByToken(args._token);
  if (!row) return res.json({ data: { ok: false, message: 'Convite não encontrado' }, error: null });
  if (row.status === 'rejected') return res.json({ data: { ok: false, message: 'Convite rejeitado' }, error: null });
  if (row.single_use === 1 && row.used_at) return res.json({ data: { ok: false, message: 'Convite já utilizado' }, error: null });

  const today = todayISO();
  const d = String(row.authorized_date || '').slice(0, 10);
  const until = row.authorized_until ? String(row.authorized_until).slice(0, 10) : d;
  if (today < d) return res.json({ data: { ok: false, message: `Convite válido a partir de ${formatPT(d)}` }, error: null });
  if (today > until) return res.json({ data: { ok: false, message: 'Convite expirado' }, error: null });

  if (row.visitor_document) {
    const blocked = db.prepare('SELECT id FROM blocked_visitors WHERE visitor_document = ? AND is_active = 1').get(row.visitor_document);
    if (blocked) return res.json({ data: { ok: false, message: 'Visitante está na lista de bloqueio' }, error: null });
  }

  const entryId = genId();
  const plate = (args._vehicle_plate && String(args._vehicle_plate).trim()) || row.vehicle_plate || null;
  const model = (args._vehicle_model && String(args._vehicle_model).trim()) || row.vehicle_model || null;

  db.prepare(`INSERT INTO access_entries (
    id, visitor_name, visitor_document, visitor_type, resident_id, resident_name, apartment,
    purpose, entry_time, exit_time, vehicle_plate, vehicle_model, photo_url, registered_by
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    entryId, row.visitor_name, row.visitor_document || '', 'visitor', row.resident_id || null,
    row.resident_full_name || null, row.resident_apartment || '',
    row.purpose || null, now(), null, plate, model, args._photo_url || null, req.user.id
  );

  db.prepare('UPDATE visitor_authorizations SET entry_count = ?, used_at = ?, status = ?, updated_at = ? WHERE id = ?')
    .run((row.entry_count || 0) + 1, now(), row.single_use === 1 ? 'expired' : row.status, now(), row.id);

  if (row.resident_id) {
    const resident = db.prepare('SELECT auth_user_id FROM residents WHERE id = ?').get(row.resident_id);
    if (resident && resident.auth_user_id) {
      notifyUser(resident.auth_user_id, 'Visita autorizada chegou', `${row.visitor_name} entrou no condomínio (convite QR)`, 'visitor', entryId);
    }
  }

  const inserted = db.prepare('SELECT * FROM access_entries WHERE id = ?').get(entryId);
  notifyRealtime('access_entries', 'INSERT', sanitizeRead('access_entries', inserted));
  const updatedAuth = db.prepare('SELECT * FROM visitor_authorizations WHERE id = ?').get(row.id);
  notifyRealtime('visitor_authorizations', 'UPDATE', sanitizeRead('visitor_authorizations', updatedAuth));

  return res.json({
    data: {
      ok: true, entry_id: entryId,
      visitor_name: row.visitor_name,
      visitor_document: row.visitor_document || null,
      resident_name: row.resident_full_name || null,
      apartment: row.resident_apartment || null,
      vehicle_plate: plate,
    },
    error: null,
  });
});

// ---------- RPC ----------
app.post('/api/rpc/:name', authMiddleware, (req, res) => {
  const { name } = req.params;
  const args = req.body?.args || {};
  if (name === 'notify_all_staff') {
    const staffRoles = ['admin', 'security_guard', 'receptionist'];
    const staffUsers = db.prepare('SELECT DISTINCT user_id FROM user_roles WHERE role IN (?,?,?)').all(...staffRoles).map(r => r.user_id);
    const insertStmt = db.prepare('INSERT INTO notifications (id, user_id, title, body, type, related_id, created_at, read) VALUES (?,?,?,?,?,?,?,?)');
    for (const userId of staffUsers) {
      insertStmt.run(genId(), userId, args._title || 'Novo pedido', args._body || '', args._type || 'authorization', args._related_id || null, now(), 0);
    }
    return res.json({ data: null, error: null });
  }
  res.status(404).json({ data: null, error: { message: `Unknown RPC: ${name}` } });
});

// ---------- Storage ----------
function bucketDir(bucket) {
  const dir = path.join(PHOTOS_DIR, bucket);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

app.post('/api/storage/upload', authMiddleware, (req, res) => {
  const { bucket, path: filePath, data } = req.body || {};
  if (!bucket || !filePath || !data) return res.status(400).json({ data: null, error: { message: 'bucket, path e data são obrigatórios' } });
  const safePath = String(filePath).replace(/\.\./g, '').replace(/^\/+/, '');
  const dir = bucketDir(bucket);
  const target = path.join(dir, safePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const base64 = String(data).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  fs.writeFileSync(target, Buffer.from(base64, 'base64'));
  res.json({ data: { path: safePath }, error: null });
});

app.post('/api/storage/remove', authMiddleware, (req, res) => {
  const { bucket, paths } = req.body || {};
  if (!bucket || !Array.isArray(paths)) return res.status(400).json({ data: null, error: { message: 'bucket e paths são obrigatórios' } });
  for (const p of paths) {
    const safePath = String(p).replace(/\.\./g, '').replace(/^\/+/, '');
    const target = path.join(bucketDir(bucket), safePath);
    try { fs.rmSync(target, { force: true }); } catch { /* ignore */ }
  }
  res.json({ data: { message: 'removed' }, error: null });
});

app.get('/api/storage/list', authMiddleware, (req, res) => {
  const { bucket, path: listPath = '' } = req.query;
  if (!bucket) return res.status(400).json({ data: null, error: { message: 'bucket é obrigatório' } });
  const base = bucketDir(bucket);
  const dir = path.join(base, String(listPath || ''));
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const data = entries.map(e => ({ name: e.name, id: `${String(listPath || '')}/${e.name}`.replace(/^\/+/, '') }));
    res.json({ data, error: null });
  } catch {
    res.json({ data: [], error: null });
  }
});

app.get('/api/storage/file', (req, res) => {
  const { bucket, path: filePath } = req.query;
  if (!bucket || !filePath) return res.status(400).json({ error: { message: 'bucket e path são obrigatórios' } });
  const safePath = String(filePath).replace(/\.\./g, '').replace(/^\/+/, '');
  const target = path.join(bucketDir(bucket), safePath);
  if (!fs.existsSync(target)) return res.status(404).json({ error: { message: 'not found' } });
  res.sendFile(target);
});

// ---------- Functions (edge function emuladas) ----------
function notifyUser(userId, title, body, type = 'system', relatedId = null) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (id, user_id, title, body, type, related_id, created_at, read) VALUES (?,?,?,?,?,?,?,?)')
    .run(genId(), userId, title, body, type, relatedId, now(), 0);
}

function notifyStaff(title, body, type = 'system', relatedId = null) {
  const staffUsers = db.prepare('SELECT DISTINCT user_id FROM user_roles WHERE role IN (?,?,?)').all('admin', 'security_guard', 'receptionist').map(r => r.user_id);
  for (const userId of staffUsers) notifyUser(userId, title, body, type, relatedId);
}

// Rota dedicada: o nome da função tem "/" e o parâmetro :name do Express não
// casa segmentos com barra (o frontend chama supabase.functions.invoke(
// 'controlid-webhook/push-config') -> /api/functions/controlid-webhook/push-config).
app.post('/api/functions/controlid-webhook/push-config', authMiddleware, (req, res) => {
  const { device_id, deviceId } = req.body || {};
  const targetDeviceId = device_id || deviceId;
  if (!targetDeviceId) return res.status(400).json({ data: { error: 'device_id é obrigatório' }, error: null });
  const fullConfig = buildWebhookConfig(req);
  db.prepare('INSERT INTO push_command_queue (id, command, created_at, device_id, status) VALUES (?,?,?,?,?)')
    .run(genId(), JSON.stringify({ verb: 'POST', endpoint: 'set_configuration', body: fullConfig, contentType: 'application/json' }), now(), targetDeviceId, 'pending');
  db.prepare('INSERT INTO controlid_logs (id, device_id, event_type, payload, processed, received_at) VALUES (?,?,?,?,?,?)')
    .run(genId(), targetDeviceId, 'config_push_queued', JSON.stringify({ queued_config: fullConfig }), 0, now());
  res.json({ data: { ok: true, message: 'Configuration queued for push. Device will receive it on next poll.' }, error: null });
});

app.post('/api/functions/:name', authMiddleware, (req, res) => {
  const { name } = req.params;
  const body = req.body || {};
  try {
    if (name === 'send-push-notification') {
      const { action } = body;
      if (action === 'get-vapid-key') {
        return res.json({ data: { publicKey: null }, error: null });
      }
      if (action === 'send') {
        notifyUser(body.user_id, body.title || 'Notificação', body.body || '', 'push', body.tag);
        return res.json({ data: { ok: true }, error: null });
      }
      if (action === 'send-to-staff') {
        notifyStaff(body.title || 'Notificação', body.body || '', 'push', body.tag);
        return res.json({ data: { ok: true }, error: null });
      }
      return res.json({ data: { ok: false }, error: null });
    }

    if (name === 'register-resident') {
      const { email, password } = body || {};
      if (!email || !password) return res.status(400).json({ data: { error: 'Email e senha são obrigatórios' }, error: null });
      const resident = db.prepare('SELECT * FROM residents WHERE email = ?').get(String(email).trim().toLowerCase());
      if (!resident) {
        return res.status(200).json({ data: { error: 'Nenhum morador cadastrado com este e-mail na portaria. Fale com o porteiro.' }, error: null });
      }
      if (resident.auth_user_id) {
        return res.status(200).json({ data: { error: 'Já existe uma conta vinculada a este morador.' }, error: null });
      }
      if (getUserByEmail(String(email))) {
        return res.status(200).json({ data: { error: 'Este e-mail já está em uso.' }, error: null });
      }
      const user = createUser({ email, password, fullName: resident.name });
      db.prepare('INSERT INTO user_roles (id, user_id, role, granted_at) VALUES (?,?,?,?)').run(genId(), user.id, 'resident', now());
      db.prepare('UPDATE residents SET auth_user_id = ? WHERE id = ?').run(user.id, resident.id);
      notifyStaff(`Novo morador cadastrado`, `${resident.name} criou sua conta no Portal do Morador.`, 'resident');
      return res.json({ data: { ok: true }, error: null });
    }

    if (name === 'notify-mail-received') {
      const { resident_id, mail_id, sender } = body || {};
      const resident = resident_id ? db.prepare('SELECT * FROM residents WHERE id = ?').get(resident_id) : null;
      if (resident?.auth_user_id) {
        notifyUser(resident.auth_user_id, 'Correspondência recebida', `Você recebeu uma correspondência${sender ? ` de ${sender}` : ''}.`, 'mail', mail_id);
      }
      db.prepare('INSERT INTO realtime_events (id, type, description, timestamp, priority, related_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(genId(), 'mail', `Correspondência registrada para ${resident?.name || 'morador'}`, now(), 'medium', mail_id || null, now());
      return res.json({ data: { ok: true }, error: null });
    }

    res.status(404).json({ data: null, error: { message: `Unknown function: ${name}` } });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  }
});

// ---------- Admin (local) ----------
app.post('/api/admin/clear', authMiddleware, (req, res) => {
  const tables = [...KNOWN_TABLES].filter(t => !['profiles', 'user_roles'].includes(t));
  for (const t of tables) {
    db.prepare(`DELETE FROM \`${t}\``).run();
  }
  res.json({ data: { ok: true }, error: null });
});

// ---------- Static (build do frontend) ----------
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/|_vite|@vite|src\/|node_modules).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[portalguard-local] Servidor rodando em http://127.0.0.1:${PORT}`);
  console.log(`[portalguard-local] Login padrão: ${admin.email} / ${process.env.ADMIN_PASSWORD || 'portaguard@2024'}`);
});

export default app;
