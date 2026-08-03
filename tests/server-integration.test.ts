// @vitest-environment node
// Teste de integração HTTP: sobe o servidor Express real (Node puro, onde
// node:sqlite funciona) num banco temporário e valida o fluxo de API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, '..', 'server', 'index.js');

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

let server: ChildProcess | null = null;
let port = 0;
let base = '';
let token = '';
let tmpDir = '';

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status >= 200) return;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Servidor de teste não subiu a tempo');
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  return res.json();
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-itest-'));
  port = await getFreePort();
  base = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(port), PGDATA_DIR: tmpDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout?.on('data', (d) => { logs += d; });
  server.stderr?.on('data', (d) => { logs += d; });

  await waitForServer(`${base}/api/table/residents`);

  const signin = await api('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@portalguard.local', password: 'portaguard@2024' }),
  });
  expect(signin.error).toBeNull();
  token = signin.data.session.access_token;
  expect(signin.data.user?.email).toBe('admin@portalguard.local');
  expect(signin.data.session.user?.email).toBe('admin@portalguard.local');
});

function killServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid) return resolve();
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    try { child.kill(); } catch { resolve(); }
  });
}

afterAll(async () => {
  if (server) await killServer(server);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('integração do backend local', () => {
  it('cria e lê um morador', async () => {
    const id = 'it_res_001';
    const ins = await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id, name: 'Integração Teste', apartment: '404', cpf: '12345678901' } }),
    });
    expect(ins.error).toBeNull();
    expect(ins.data[0].id).toBe(id);

    const sel = await api(`/api/table/residents?select=*&filters=${encodeURIComponent(JSON.stringify([{ col: 'id', op: 'eq', value: id }]))}`);
    expect(sel.data).toHaveLength(1);
    expect(sel.data[0].name).toBe('Integração Teste');
  });

  it('atualiza com PATCH aplicando filtros', async () => {
    const upd = await api('/api/table/residents', {
      method: 'PATCH',
      body: JSON.stringify({
        set: { phone: '11999998888' },
        filters: [{ col: 'id', op: 'eq', value: 'it_res_001' }],
      }),
    });
    expect(upd.error).toBeNull();
    const sel = await api('/api/table/residents?select=phone&filters=' + encodeURIComponent(JSON.stringify([{ col: 'id', op: 'eq', value: 'it_res_001' }])));
    expect(sel.data[0].phone).toBe('11999998888');
  });

  it('upsert insere e depois atualiza preservando created_at', async () => {
    const first = await api('/api/table/residents/upsert', {
      method: 'POST',
      body: JSON.stringify({ rows: [{ id: 'it_res_002', name: 'Upsert 1', apartment: '101', created_at: '2026-01-01T00:00:00.000Z' }], onConflict: 'id' }),
    });
    expect(first.error).toBeNull();
    expect(first.data[0].name).toBe('Upsert 1');

    const second = await api('/api/table/residents/upsert', {
      method: 'POST',
      body: JSON.stringify({ rows: [{ id: 'it_res_002', name: 'Upsert 2', apartment: '102' }], onConflict: 'id' }),
    });
    expect(second.error).toBeNull();
    expect(second.data[0].name).toBe('Upsert 2');
    expect(second.data[0].apartment).toBe('102');
    expect(second.data[0].created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('or() com operadores eq/ilike funciona', async () => {
    const res = await api('/api/table/residents?select=id&or=' + encodeURIComponent('name.ilike.%upsert%,id.eq.it_res_001'));
    expect(res.error).toBeNull();
    expect(res.data.length).toBe(2);
  });

  it('rejeita tabela desconhecida', async () => {
    const res = await api('/api/table/nao_existe?select=*');
    expect(res.error).toBeTruthy();
  });

  it('bloqueia acesso sem token', async () => {
    const res = await fetch(`${base}/api/table/residents?select=*`);
    expect(res.status).toBe(401);
  });

  it('access_entries sempre recebe entry_time no insert', async () => {
    const ins = await api('/api/table/access_entries', {
      method: 'POST',
      body: JSON.stringify({ row: { visitor_name: 'Prestador Sem Hora', visitor_document: '999000111', apartment: '101', visitor_type: 'service_provider' } }),
    });
    expect(ins.error).toBeNull();
    expect(ins.data[0].entry_time).toBeTruthy();

    const withTime = await api('/api/table/access_entries', {
      method: 'POST',
      body: JSON.stringify({ row: { visitor_name: 'Com Hora Fixa', visitor_document: '999000222', apartment: '102', entry_time: '2026-05-01T10:00:00.000Z' } }),
    });
    expect(withTime.error).toBeNull();
    expect(withTime.data[0].entry_time).toBe('2026-05-01T10:00:00.000Z');
  });

  it('getSession devolve user dentro da session', async () => {
    const sess = await api('/api/auth/session');
    expect(sess.error).toBeNull();
    expect(sess.data.session.access_token).toBe(token);
    expect(sess.data.session.user?.email).toBe('admin@portalguard.local');
    expect(sess.data.user?.email).toBe('admin@portalguard.local');
  });

  it('upload e listagem de storage', async () => {
    const up = await api('/api/storage/upload', {
      method: 'POST',
      body: JSON.stringify({
        bucket: 'resident-photos',
        path: 'it_res_001/foto.png',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }),
    });
    expect(up.error).toBeNull();
    const list = await api('/api/storage/list?bucket=resident-photos&path=it_res_001');
    expect(list.data).toHaveLength(1);
    expect(list.data[0].name).toBe('foto.png');
  });

  it('Control iD webhook: identificação responde abertura de porta', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 123, user_name: 'Andar - Nome', portal_id: 1, device_id: 'cid-web-1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe(7);
    expect(data.user_id).toBe(123);
    expect(Array.isArray(data.actions)).toBe(true);
    expect(data.actions[0].action).toBe('sec_box');
  });

  it('Control iD webhook: identificação negada pelo dispositivo (evento 3)', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 3, user_id: 0, portal_id: 1, device_id: 'cid-web-1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe(6);
    expect(data.actions).toBeUndefined();
  });

  it('Control iD webhook: fila push entrega comando e recebe resultado', async () => {
    const queued = await api('/api/functions/controlid-webhook/push-config', {
      method: 'POST',
      body: JSON.stringify({ device_id: 'cid-push-1' }),
    });
    expect(queued.error).toBeNull();

    const poll = await fetch(`${base}/api/controlid-webhook?deviceId=cid-push-1`);
    expect(poll.status).toBe(200);
    const cmd = await poll.json();
    expect(cmd.endpoint).toBe('set_configuration');
    expect(cmd.verb).toBe('POST');
    expect(cmd.body.push_server).toBeTruthy();

    const result = await fetch(`${base}/api/controlid-webhook?deviceId=cid-push-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    expect(result.status).toBe(200);

    const rows = await api('/api/table/push_command_queue?select=status,result&filters=' + encodeURIComponent(JSON.stringify([{ col: 'device_id', op: 'eq', value: 'cid-push-1' }])));
    expect(rows.error).toBeNull();
    const done = rows.data.find(r => r.status === 'done');
    expect(done).toBeTruthy();
    expect(done.result?.ok).toBe(true);
  });

  it('Control iD webhook: fila vazia devolve resposta vazia e heartbeat é aceito', async () => {
    const empty = await fetch(`${base}/api/controlid-webhook?deviceId=cid-none-1`);
    expect(empty.status).toBe(200);
    expect(await empty.text()).toBe('');

    const heartbeat = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'cid-heart-1', access_logs: [] }),
    });
    expect(heartbeat.status).toBe(200);
  });

  it('Control iD webhook: session_is_valid responde true', async () => {
    const res = await fetch(`${base}/api/controlid-webhook/session_is_valid.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'cid-session-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).session_is_valid).toBe(true);
  });
});
