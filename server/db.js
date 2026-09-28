import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.PGDATA_DIR || path.join(__dirname, '..', 'data');
export const DB_PATH = path.join(DATA_DIR, 'portalguard.db');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

fs.mkdirSync(PHOTOS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export const now = () => new Date().toISOString();
export const genId = () => randomUUID();

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  granted_at TEXT,
  granted_by TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS residents (
  id TEXT PRIMARY KEY,
  apartment TEXT NOT NULL,
  auth_user_id TEXT,
  contract_end_date TEXT,
  contract_type TEXT,
  cpf TEXT,
  created_at TEXT,
  created_by TEXT,
  email TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  updated_at TEXT,
  vehicle_color TEXT,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  vehicle_tag TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_residents_cpf ON residents(cpf) WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  color TEXT,
  created_at TEXT,
  model TEXT,
  plate TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  tag TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS mails (
  id TEXT PRIMARY KEY,
  delivered_at TEXT,
  notes TEXT,
  package_type TEXT,
  photo_url TEXT,
  received_at TEXT,
  registered_by TEXT,
  resident_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT,
  tracking_code TEXT,
  withdrawn_by TEXT
);

CREATE TABLE IF NOT EXISTS access_entries (
  id TEXT PRIMARY KEY,
  apartment TEXT NOT NULL,
  auto_recognized INTEGER,
  badge_number TEXT,
  company TEXT,
  entry_time TEXT,
  exit_time TEXT,
  notes TEXT,
  photo_url TEXT,
  purpose TEXT,
  registered_by TEXT,
  resident_id TEXT,
  resident_name TEXT,
  vehicle_color TEXT,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  visitor_document TEXT NOT NULL,
  visitor_name TEXT NOT NULL,
  visitor_type TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  ip_address TEXT,
  last_sync TEXT,
  location TEXT NOT NULL,
  name TEXT NOT NULL,
  serial_number TEXT,
  status TEXT,
  type TEXT
);

CREATE TABLE IF NOT EXISTS controlid_config (
  id TEXT PRIMARY KEY,
  api_path TEXT,
  created_at TEXT,
  device_id TEXT,
  device_ip TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_port TEXT,
  is_active INTEGER,
  last_sync TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS controlid_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  processed INTEGER,
  received_at TEXT
);

CREATE TABLE IF NOT EXISTS blocked_visitors (
  id TEXT PRIMARY KEY,
  blocked_at TEXT,
  blocked_by TEXT,
  is_active INTEGER,
  reason TEXT,
  visitor_document TEXT NOT NULL,
  visitor_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  priority TEXT,
  title TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS announcement_attachments (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  content_type TEXT,
  created_at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  message TEXT NOT NULL,
  read INTEGER,
  resident_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  description TEXT NOT NULL,
  reported_by TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  severity TEXT NOT NULL,
  shift_id TEXT,
  status TEXT,
  title TEXT NOT NULL,
  updated_at TEXT,
  apartment TEXT,
  resident_id TEXT,
  resident_name TEXT,
  photo_url TEXT
);

CREATE TABLE IF NOT EXISTS shift_acknowledgments (
  id TEXT PRIMARY KEY,
  shift_id TEXT,
  received_by TEXT NOT NULL,
  notes TEXT,
  acknowledged_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TEXT,
  read INTEGER,
  related_id TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portaria_equipment (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_command_queue (
  id TEXT PRIMARY KEY,
  command TEXT,
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  executed_at TEXT,
  result TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  related_id TEXT,
  timestamp TEXT,
  type TEXT NOT NULL,
  user_id TEXT
);

CREATE TABLE IF NOT EXISTS shift_equipment_checks (
  id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  checked_by TEXT,
  equipment_id TEXT NOT NULL,
  notes TEXT,
  shift_id TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  created_by TEXT,
  notes TEXT,
  shift_end TEXT,
  shift_start TEXT NOT NULL,
  shift_type TEXT,
  team_members TEXT
);

CREATE TABLE IF NOT EXISTS visitor_authorizations (
  id TEXT PRIMARY KEY,
  authorized_date TEXT NOT NULL,
  authorized_until TEXT,
  created_at TEXT,
  entry_count INTEGER DEFAULT 0,
  purpose TEXT,
  qr_code_token TEXT,
  resident_id TEXT NOT NULL,
  reviewed_by TEXT,
  single_use INTEGER DEFAULT 1,
  staff_notes TEXT,
  status TEXT,
  updated_at TEXT,
  used_at TEXT,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  visitor_document TEXT,
  visitor_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vapid_keys (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  private_key TEXT NOT NULL,
  public_key TEXT NOT NULL
);
`;

db.exec(SCHEMA);

// Migração assistida: adiciona colunas que podem faltar em bancos criados antes
// da versão atual do schema (ALTER TABLE ADD COLUMN não tem IF NOT EXISTS em todas
// as versões do SQLite, então verificamos via PRAGMA table_info).
const residentCols = new Set(db.prepare('PRAGMA table_info(residents)').all().map(c => c.name));
if (!residentCols.has('contract_type')) db.exec('ALTER TABLE residents ADD COLUMN contract_type TEXT');
if (!residentCols.has('contract_end_date')) db.exec('ALTER TABLE residents ADD COLUMN contract_end_date TEXT');

// Migração assistida: novas colunas de ocorrências (Livro de Ocorrências).
const incidentCols = new Set(db.prepare('PRAGMA table_info(incidents)').all().map(c => c.name));
if (!incidentCols.has('apartment')) db.exec('ALTER TABLE incidents ADD COLUMN apartment TEXT');
if (!incidentCols.has('resident_id')) db.exec('ALTER TABLE incidents ADD COLUMN resident_id TEXT');
if (!incidentCols.has('resident_name')) db.exec('ALTER TABLE incidents ADD COLUMN resident_name TEXT');
if (!incidentCols.has('photo_url')) db.exec('ALTER TABLE incidents ADD COLUMN photo_url TEXT');

// Migração: entradas antigas podem ter entry_time NULL (o frontend não enviava a coluna).
// Preenche com o horário da saída (ou agora) para manter os logs consistentes.
db.prepare('UPDATE access_entries SET entry_time = COALESCE(exit_time, ?) WHERE entry_time IS NULL').run(now());

// Migração assistida: convite virtual com QR Code (colunas novas em visitor_authorizations).
const visitorAuthCols = new Set(db.prepare('PRAGMA table_info(visitor_authorizations)').all().map(c => c.name));
if (!visitorAuthCols.has('qr_code_token')) db.exec('ALTER TABLE visitor_authorizations ADD COLUMN qr_code_token TEXT');
if (!visitorAuthCols.has('entry_count')) db.exec('ALTER TABLE visitor_authorizations ADD COLUMN entry_count INTEGER DEFAULT 0');
if (!visitorAuthCols.has('single_use')) db.exec('ALTER TABLE visitor_authorizations ADD COLUMN single_use INTEGER DEFAULT 1');
if (!visitorAuthCols.has('used_at')) db.exec('ALTER TABLE visitor_authorizations ADD COLUMN used_at TEXT');
if (!visitorAuthCols.has('vehicle_model')) db.exec('ALTER TABLE visitor_authorizations ADD COLUMN vehicle_model TEXT');
// Gera o token para registros existentes (e normaliza vazios).
db.prepare("UPDATE visitor_authorizations SET qr_code_token = ? WHERE qr_code_token IS NULL OR qr_code_token = ''").run(genId());
// Garante default em todos (CREATE TABLE não reaplica em bancos antigos).
db.prepare('UPDATE visitor_authorizations SET single_use = 1 WHERE single_use IS NULL').run();
db.prepare('UPDATE visitor_authorizations SET entry_count = 0 WHERE entry_count IS NULL').run();

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createUser({ email, password, fullName = '' }) {
  const id = genId();
  const ts = now();
  db.prepare('INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, email.trim().toLowerCase(), hashPassword(password), fullName, ts, ts);
  db.prepare('INSERT INTO profiles (id, full_name, created_at) VALUES (?, ?, ?)').run(id, fullName, ts);
  return { id, email: email.trim().toLowerCase(), full_name: fullName, created_at: ts };
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserRoles(userId) {
  return db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(userId).map(r => r.role);
}

export function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@portalguard.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'portaguard@2024';
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  const existing = getUserByEmail(adminEmail);
  if (existing) return existing;

  const user = createUser({ email: adminEmail, password: adminPassword, fullName: adminName });
  db.prepare('INSERT INTO user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)')
    .run(genId(), user.id, 'admin', now());
  return user;
}

export function parseSeedFile() {
  const seedPath = path.join(__dirname, '..', '.env.local.seed');
  if (!fs.existsSync(seedPath)) return;
  const content = fs.readFileSync(seedPath, 'utf8');
  const match = (key) => {
    const m = content.match(new RegExp(`${key}=["']?([^"'\\n\\r]+)["']?`));
    return m ? m[1].trim() : null;
  };
  const email = match('ADMIN_EMAIL');
  const password = match('ADMIN_PASSWORD');
  const name = match('ADMIN_NAME');
  if (email) process.env.ADMIN_EMAIL = email;
  if (password) process.env.ADMIN_PASSWORD = password;
  if (name) process.env.ADMIN_NAME = name;
}
