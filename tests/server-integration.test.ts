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

// Mesmo algoritmo usado no cadastro (src/lib/device-capture.ts) e no webhook.
function hardwareIdFor(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-itest-'));
  port = await getFreePort();
  const httpsPort = await getFreePort();
  base = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      // O servidor também sobe HTTPS; usar uma porta livre evita conflito com
      // uma instalação real do PortalGuard rodando na máquina de testes.
      PORTALGUARD_HTTPS_PORT: String(httpsPort),
      PGDATA_DIR: tmpDir,
      PORTALGUARD_DEVICE_MIN_CONFIDENCE: '50',
    },
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

  it('Control iD webhook: identificação de morador responde abertura de porta', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_web_res',
          name: 'Morador Web',
          apartment: '801',
          contract_end_date: '2099-12-31',
        },
      }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: hardwareIdFor('it_web_res'),
        portal_id: 1,
        device_id: 'cid-web-1',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe(7);
    expect(data.user_id).toBe(hardwareIdFor('it_web_res'));
    expect(Array.isArray(data.actions)).toBe(true);
    expect(data.actions[0].action).toBe('sec_box');
  });

  it('Control iD webhook: usuário só cadastrado no equipamento é negado pelo motor', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 123, user_name: 'Andar - Nome', portal_id: 1, device_id: 'cid-web-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe(6);
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

  it('Control iD webhook: decisão central libera morador ativo', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_dec_ativo',
          name: 'Carlos Decisao',
          apartment: '701',
          vehicle_tag: '778899',
          contract_end_date: '2099-12-31',
        },
      }),
    });

    const byTag = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 55, user_name: '701 - Carlos Decisao', card_value: '000778899', portal_id: 1, device_id: 'cid-dec-1' }),
    });
    expect((await byTag.json()).event).toBe(7);

    const byName = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 56, user_name: '701 - Carlos Decisao', portal_id: 1, device_id: 'cid-dec-1' }),
    });
    const named = await byName.json();
    expect(named.event).toBe(7);
    expect(named.actions[0].action).toBe('sec_box');
  });

  it('Control iD webhook: reconhece morador de apartamento com nome', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_dec_salinas',
          name: 'Carlos Salinas',
          apartment: 'SALINAS 97',
          contract_end_date: '2099-12-31',
        },
      }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 57, user_name: 'SALINAS 97 - Carlos Salinas', portal_id: 1, device_id: 'cid-dec-1' }),
    });
    const data = await res.json();
    expect(data.event).toBe(7);
    expect(data.actions[0].action).toBe('sec_box');
  });

  it('Control iD webhook: mapeia user_id do iDFace direto para o morador (sem depender do nome)', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: hardwareIdFor('it_dec_ativo'),
        portal_id: 1,
        device_id: 'cid-dec-1',
      }),
    });
    const data = await res.json();
    expect(data.event).toBe(7);
    expect(data.actions[0].action).toBe('sec_box');
  });

  it('Control iD webhook: confiança abaixo do mínimo nega a liberação', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: hardwareIdFor('it_dec_ativo'),
        confidence: 10,
        portal_id: 1,
        device_id: 'cid-dec-1',
      }),
    });
    expect((await res.json()).event).toBe(6);
  });

  it('Control iD webhook: confiança acima do mínimo libera o morador', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: hardwareIdFor('it_dec_ativo'),
        confidence: 80,
        portal_id: 1,
        device_id: 'cid-dec-1',
      }),
    });
    expect((await res.json()).event).toBe(7);
  });

  it('Control iD webhook: cadastro do Novo Cadastro tem prioridade sobre nome parecido de morador', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_dec_colisao',
          name: 'Joao Colisao',
          apartment: '703',
          contract_end_date: '2099-12-31',
        },
      }),
    });
    await api('/api/table/access_entries', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          visitor_name: 'Joao Col',
          visitor_document: 'VIS-COLL-1',
          apartment: '999',
          visitor_type: 'visitor',
          entry_time: '2026-01-01T10:00:00.000Z',
          exit_time: '2026-01-01T11:00:00.000Z',
        },
      }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: 58,
        user_name: '703 - Joao Col',
        registration: 'VIS-COLL-1',
        portal_id: 1,
        device_id: 'cid-dec-1',
      }),
    });
    const data = await res.json();
    expect(data.event).toBe(6);
  });

  it('Control iD webhook: decisão central nega contrato vencido', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_dec_vencido',
          name: 'Inquilino Vencido',
          apartment: '702',
          contract_end_date: '2020-01-01',
        },
      }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 57, user_name: '702 - Inquilino Vencido', portal_id: 1, device_id: 'cid-dec-1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe(6);
    expect(data.actions).toBeUndefined();
  });

  it('Control iD webhook: nega contrato vencido também pelo user_id do iDFace', async () => {
    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 1,
        user_id: hardwareIdFor('it_dec_vencido'),
        portal_id: 1,
        device_id: 'cid-dec-1',
      }),
    });
    expect((await res.json()).event).toBe(6);
  });

  it('Control iD webhook: decisão central nega pessoa bloqueada', async () => {
    await api('/api/table/blocked_visitors', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_blocked_1',
          visitor_name: 'Invasor Teste',
          visitor_document: '99988877766',
          is_active: true,
        },
      }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 58, user_name: 'InvASOR Teste', portal_id: 1, device_id: 'cid-dec-1' }),
    });
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

  it('doméstico reconhecido registra entrada e saída no log de acesso', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_colab_1', name: 'Domestico Fixo', apartment: '801', person_type: 'empregado' } }),
    });

    const scan = () => fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 900, user_name: '801 - Domestico Fixo', portal_id: 1, device_id: 'cid-dec-1' }),
    });

    // Primeira leitura: entrada registrada e aberta.
    expect((await (await scan()).json()).event).toBe(7);

    const rows = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'resident_id', op: 'eq', value: 'it_colab_1' }])));
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    const entry = rows.data[0];
    expect(entry.visitor_type).toBe('service_provider');
    expect(entry.visitor_name).toBe('Domestico Fixo');
    expect(entry.apartment).toBe('801');
    expect(entry.entry_time).toBeTruthy();
    expect(entry.entry_scan_at).toBeTruthy();
    expect(entry.exit_time).toBeNull();
    expect(entry.auto_recognized).toBe(true);

    // Simula a saída algum tempo depois (fora da janela anti-duplicação).
    await api('/api/table/access_entries', {
      method: 'PATCH',
      body: JSON.stringify({
        set: {
          entry_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          entry_scan_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
        filters: [{ col: 'id', op: 'eq', value: entry.id }],
      }),
    });
    expect((await (await scan()).json()).event).toBe(7);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const afterExit = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'resident_id', op: 'eq', value: 'it_colab_1' }])));
    expect(afterExit.data).toHaveLength(1);
    expect(afterExit.data[0].exit_time).toBeTruthy();
    expect(afterExit.data[0].exit_time).not.toBe(afterExit.data[0].entry_time);
  });

  it('prestador fixo do cadastro de moradores registra entrada e saída no log de acesso', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_prest_1', name: 'Prestador Fixo', apartment: '901', person_type: 'prestador', cpf: '11122233344' } }),
    });

    const scan = () => fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 7,
        user_id: hardwareIdFor('it_prest_1'),
        user_name: '901 - Prestador Fixo',
        portal_id: 1,
        device_id: 'cid-dec-2',
      }),
    });

    expect((await (await scan()).json()).event).toBe(7);

    const rows = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'resident_id', op: 'eq', value: 'it_prest_1' }])));
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    const entry = rows.data[0];
    expect(entry.visitor_type).toBe('service_provider');
    expect(entry.visitor_name).toBe('Prestador Fixo');
    expect(entry.apartment).toBe('901');
    expect(entry.visitor_document).toBe('11122233344');
    expect(entry.entry_time).toBeTruthy();
    expect(entry.entry_scan_at).toBeTruthy();
    expect(entry.exit_time).toBeNull();
    expect(entry.auto_recognized).toBe(true);

    // Saída registrada na leitura seguinte, fora da janela anti-duplicação.
    await api('/api/table/access_entries', {
      method: 'PATCH',
      body: JSON.stringify({
        set: {
          entry_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          entry_scan_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
        filters: [{ col: 'id', op: 'eq', value: entry.id }],
      }),
    });
    expect((await (await scan()).json()).event).toBe(7);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const afterExit = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'resident_id', op: 'eq', value: 'it_prest_1' }])));
    expect(afterExit.data).toHaveLength(1);
    expect(afterExit.data[0].exit_time).toBeTruthy();
  });

  it('prestador do Novo Cadastro exige confirmação da portaria e endereço de destino', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_dest_1', name: 'Morador Destino', apartment: '902', person_type: 'morador' } }),
    });
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_dest_2', name: 'Morador Destino Dois', apartment: '904', person_type: 'morador' } }),
    });
    // Cadastro feito no formulário do Novo Cadastro (entrada ainda não confirmada).
    const preRegistro = await api('/api/table/access_entries', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_novo_prest_1',
          visitor_name: 'Prestador Novo Cadastro',
          visitor_document: 'PREST-NOVO-1',
          visitor_type: 'service_provider',
          apartment: '902',
          resident_id: 'it_dest_1',
          resident_name: 'Morador Destino',
          entry_time: new Date().toISOString(),
          exit_time: null,
        },
      }),
    });
    expect(preRegistro.error).toBeNull();

    const scan = () => fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 7,
        registration: 'PREST-NOVO-1',
        user_name: '902 - Prestador Novo Cadastro',
        portal_id: 1,
        device_id: 'cid-dec-2',
      }),
    });

    // O portão NÃO abre sozinho: a portaria precisa confirmar.
    expect((await (await scan()).json()).event).toBe(6);

    const requests = await api('/api/table/facial_release_requests?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'visitor_document', op: 'eq', value: 'PREST-NOVO-1' }])));
    expect(requests.error).toBeNull();
    expect(requests.data).toHaveLength(1);
    const request = requests.data[0];
    expect(request.status).toBe('pending');
    expect(request.visitor_type).toBe('service_provider');
    expect(request.visitor_name).toBe('Prestador Novo Cadastro');

    // A portaria confirma e escolhe o endereço de destino.
    const approve = await fetch(`${base}/api/functions/facial-release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve', request_id: request.id, resident_id: 'it_dest_2' }),
    });
    expect(approve.status).toBe(200);
    expect((await approve.json()).ok).toBe(true);

    const entries = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'visitor_document', op: 'eq', value: 'PREST-NOVO-1' }])));
    expect(entries.data).toHaveLength(1);
    const entry = entries.data[0];
    expect(entry.id).toBe('it_novo_prest_1');
    expect(entry.apartment).toBe('904');
    expect(entry.resident_id).toBe('it_dest_2');
    expect(entry.resident_name).toBe('Morador Destino Dois');
    expect(entry.entry_scan_at).toBeTruthy();
    expect(entry.exit_time).toBeNull();

    // Simula a saída algum tempo depois (fora da janela anti-duplicação).
    await api('/api/table/access_entries', {
      method: 'PATCH',
      body: JSON.stringify({
        set: {
          entry_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          entry_scan_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
        filters: [{ col: 'id', op: 'eq', value: 'it_novo_prest_1' }],
      }),
    });

    // A leitura seguinte registra a saída, sem nova confirmação.
    expect((await (await scan()).json()).event).toBe(7);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterExit = await api('/api/table/access_entries?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'id', op: 'eq', value: 'it_novo_prest_1' }])));
    expect(afterExit.data[0].exit_time).toBeTruthy();
  });

  it('desativar o dispositivo suspende o motor imediatamente', async () => {
    const deviceId = 'cid-off-1';
    await api('/api/table/devices', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_dev_off',
          name: 'Leitor Teste',
          type: 'facial_recognition',
          location: 'Teste',
          status: 'online',
          ip_address: '127.0.0.10',
          serial_number: deviceId,
          is_active: true,
        },
      }),
    });
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_morador_off', name: 'Morador Ativo Off', apartment: '903', person_type: 'morador' } }),
    });

    const identify = () => fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 7,
        user_id: hardwareIdFor('it_morador_off'),
        user_name: '903 - Morador Ativo Off',
        portal_id: 1,
        device_id: deviceId,
      }),
    });

    expect((await (await identify()).json()).event).toBe(7);

    await api('/api/table/facial_release_requests', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_fr_off',
          subject_key: 'doc:OFF',
          visitor_name: 'Visitante Off',
          visitor_type: 'visitor',
          status: 'pending',
          requested_at: new Date().toISOString(),
          device_id: deviceId,
        },
      }),
    });
    await api('/api/table/push_command_queue', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_push_off',
          command: { verb: 'POST', endpoint: 'execute_actions', body: {} },
          created_at: new Date().toISOString(),
          device_id: deviceId,
          status: 'pending',
        },
      }),
    });

    const off = await api('/api/table/devices', {
      method: 'PATCH',
      body: JSON.stringify({
        set: { is_active: false },
        filters: [{ col: 'id', op: 'eq', value: 'it_dev_off' }],
      }),
    });
    expect(off.error).toBeNull();

    // Cache invalidado na hora: a próxima identificação é negada.
    expect((await (await identify()).json()).event).toBe(6);

    // Comandos (abertura remota/config) não são entregues ao leitor desativado.
    const push = await fetch(`${base}/api/controlid-webhook?deviceId=${deviceId}`);
    expect(push.status).toBe(200);
    expect((await push.text()).trim()).toBe('');

    const fr = await api('/api/table/facial_release_requests?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'id', op: 'eq', value: 'it_fr_off' }])));
    expect(fr.data[0].status).toBe('expired');

    const cmd = await api('/api/table/push_command_queue?select=*&filters=' + encodeURIComponent(JSON.stringify([{ col: 'id', op: 'eq', value: 'it_push_off' }])));
    expect(cmd.data[0].status).toBe('error');
  });

  it('morador reconhecido NÃO gera registro no log de acesso', async () => {
    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_morador_1', name: 'Morador Sem Log', apartment: '802', person_type: 'morador' } }),
    });

    const res = await fetch(`${base}/api/controlid-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 1, user_id: 901, user_name: '802 - Morador Sem Log', portal_id: 1, device_id: 'cid-dec-1' }),
    });
    expect((await res.json()).event).toBe(7);

    const rows = await api('/api/table/access_entries?select=id&filters=' + encodeURIComponent(JSON.stringify([{ col: 'resident_id', op: 'eq', value: 'it_morador_1' }])));
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(0);
  });

  it('libera��o facial: aprova��o exige apartamento e morador', async () => {
    const semApto = await api('/api/table/facial_release_requests', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_fr_sem_apto',
          subject_key: 'doc:SEMAPTO',
          visitor_name: 'Sem Apartamento',
          visitor_type: 'visitor',
          status: 'pending',
          requested_at: new Date().toISOString(),
        },
      }),
    });
    expect(semApto.error).toBeNull();

    const semAptoRes = await fetch(`${base}/api/functions/facial-release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve', request_id: 'it_fr_sem_apto' }),
    });
    expect(semAptoRes.status).toBe(400);

    await api('/api/table/residents', {
      method: 'POST',
      body: JSON.stringify({ row: { id: 'it_fr_colab', name: 'Colaborador Facial', apartment: '803', person_type: 'colaborador' } }),
    });
    const comColab = await api('/api/table/facial_release_requests', {
      method: 'POST',
      body: JSON.stringify({
        row: {
          id: 'it_fr_colab',
          subject_key: 'doc:COLABFACIAL',
          visitor_name: 'Visitante Colab',
          visitor_type: 'visitor',
          apartment: '803',
          status: 'pending',
          requested_at: new Date().toISOString(),
        },
      }),
    });
    expect(comColab.error).toBeNull();

    const colabRes = await fetch(`${base}/api/functions/facial-release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve', request_id: 'it_fr_colab', resident_id: 'it_fr_colab' }),
    });
    expect(colabRes.status).toBe(400);
  });
});

