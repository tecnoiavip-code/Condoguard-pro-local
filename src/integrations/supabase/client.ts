// PortalGuard Local - Facade de compatibilidade com a API Supabase.
// Implementa a mesma interface do cliente Supabase (@supabase/supabase-js),
// mas fala com o backend local (Express + SQLite) via fetch/SSE.
// Nenhuma página precisa mudar os imports: `@/integrations/supabase/client`.
import type { Database } from './types';

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) || '';
const TOKEN_KEY = 'pg_access_token';

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    return { data: null, error: { message: 'Falha de conexão com o servidor local.', code: 'NETWORK' } };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    return { data: null, error: body?.error || { message: `Erro ${res.status}` } };
  }
  return body || { data: null, error: null };
}

// ---------- Event emitter (auth + realtime) ----------
type AuthListener = (event: string, session: any) => void;
const authListeners = new Set<AuthListener>();

function emitAuth(event: string, session: any) {
  authListeners.forEach(cb => {
    try {
      cb(event, session);
    } catch {
      /* ignore */
    }
  });
}

// ---------- Filtros ----------
interface Filter {
  col: string;
  op: string;
  value: any;
  not?: boolean;
}

function normalizeFilterValue(value: any): any {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) return value.map(normalizeFilterValue);
  return value;
}

function serializeFilters(filters: Filter[]): string {
  return JSON.stringify(filters.map(f => ({
    col: f.col,
    op: f.op,
    value: normalizeFilterValue(f.value),
    not: !!f.not,
  })));
}

// ---------- QueryBuilder ----------
class QueryBuilder {
  private table: string;
  private filters: Filter[] = [];
  private orExpr: string | null = null;
  private selectCols: string = '*';
  private orderCol: string | null = null;
  private ascending: boolean = true;
  private limitN: number | null = null;
  private offsetN: number = 0;
  private countMode: string | null = null;
  private head = false;
  private singleMode = false;
  private maybeSingleMode = false;
  private method: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private onConflict: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', opts?: { count?: string; head?: boolean }): this {
    this.selectCols = columns || '*';
    this.countMode = opts?.count || null;
    this.head = !!opts?.head;
    return this;
  }

  insert(values: any): this {
    this.method = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any): this {
    this.method = 'update';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.method = 'delete';
    return this;
  }

  upsert(values: any, opts?: { onConflict?: string }): this {
    this.method = 'upsert';
    this.payload = values;
    this.onConflict = opts?.onConflict || 'id';
    return this;
  }

  eq(col: string, value: any): this { this.filters.push({ col, op: 'eq', value }); return this; }
  neq(col: string, value: any): this { this.filters.push({ col, op: 'neq', value }); return this; }
  gt(col: string, value: any): this { this.filters.push({ col, op: 'gt', value }); return this; }
  gte(col: string, value: any): this { this.filters.push({ col, op: 'gte', value }); return this; }
  lt(col: string, value: any): this { this.filters.push({ col, op: 'lt', value }); return this; }
  lte(col: string, value: any): this { this.filters.push({ col, op: 'lte', value }); return this; }
  is(col: string, value: any): this { this.filters.push({ col, op: 'is', value }); return this; }
  in(col: string, value: any[]): this { this.filters.push({ col, op: 'in', value }); return this; }
  like(col: string, value: any): this { this.filters.push({ col, op: 'like', value }); return this; }
  ilike(col: string, value: any): this { this.filters.push({ col, op: 'ilike', value }); return this; }
  not(col: string, op: string, value: any): this { this.filters.push({ col, op, value, not: true }); return this; }
  or(expr: string): this { this.orExpr = expr; return this; }
  order(col: string, opts?: { ascending?: boolean }): this { this.orderCol = col; this.ascending = opts?.ascending !== false; return this; }
  limit(n: number): this { this.limitN = n; return this; }
  offset(n: number): this { this.offsetN = n; return this; }
  range(from: number, to: number): this { this.limitN = to - from + 1; this.offsetN = from; return this; }

  single(): this { this.singleMode = true; return this; }
  maybeSingle(): this { this.maybeSingleMode = true; return this; }

  then(resolve: (value: any) => any, reject?: (reason?: any) => any): Promise<any> {
    return this.execute().then(resolve, reject);
  }

  catch(reject?: (reason?: any) => any): Promise<any> {
    return this.execute().catch(reject);
  }
  finally(onFinally?: () => void): Promise<any> {
    return this.execute().finally(onFinally);
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    const t = this.table;
    let res: { data: any; error: any; count?: number | null };
    try {
      if (this.method === 'select') {
        const params = new URLSearchParams();
        params.set('select', this.selectCols);
        if (this.filters.length > 0) params.set('filters', serializeFilters(this.filters));
        if (this.orExpr) params.set('or', this.orExpr);
        if (this.orderCol) { params.set('order', this.orderCol); params.set('ascending', this.ascending ? 'true' : 'false'); }
        if (this.limitN !== null) params.set('limit', String(this.limitN));
        if (this.offsetN) params.set('offset', String(this.offsetN));
        if (this.countMode) params.set('count', this.countMode);
        if (this.head) params.set('head', 'true');
        res = await request(`/api/table/${t}?${params.toString()}`);
      } else if (this.method === 'insert') {
        res = await request(`/api/table/${t}`, { method: 'POST', body: JSON.stringify({ row: this.payload }) });
      } else if (this.method === 'update') {
        res = await request(`/api/table/${t}`, { method: 'PATCH', body: JSON.stringify({ set: this.payload, filters: this.filters, or: this.orExpr }) });
      } else if (this.method === 'delete') {
        res = await request(`/api/table/${t}`, { method: 'DELETE', body: JSON.stringify({ filters: this.filters, or: this.orExpr }) });
      } else {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        res = await request(`/api/table/${t}/upsert`, { method: 'POST', body: JSON.stringify({ rows, onConflict: this.onConflict }) });
      }
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Erro interno' } };
    }

    if (res.error) return res;

    let data = res.data;
    if (data && this.selectCols !== '*') {
      const cols = this.selectCols.split(',').map(c => c.trim());
      const projectOne = (row: any) => {
        const out: Record<string, any> = {};
        for (const c of cols) if (row && c in row) out[c] = row[c];
        return out;
      };
      data = Array.isArray(data) ? data.map(projectOne) : projectOne(data);
    }

    if (Array.isArray(data) && this.maybeSingleMode) data = data[0] ?? null;
    if (Array.isArray(data) && this.singleMode) {
      if (data.length === 0) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      if (data.length > 1) return { data: null, error: { message: 'JSON object requested, multiple rows returned' } };
      data = data[0];
    }

    return { data, error: null, count: res.count ?? null };
  }
}

// ---------- Storage ----------
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface StorageApi {
  list(path?: string, opts?: any): Promise<any>;
  createSignedUrl(path: string, seconds?: number): Promise<any>;
  upload(path: string, file: File | string): Promise<any>;
  remove(paths: string[]): Promise<any>;
}

function storageFrom(bucket: string): StorageApi {
  return {
    async list(path = '', opts?: any) {
      const params = new URLSearchParams({ bucket, path: String(path) });
      return request(`/api/storage/list?${params.toString()}`);
    },
    async createSignedUrl(path: string) {
      const signedUrl = `/api/storage/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
      return { data: { signedUrl }, error: null };
    },
    async upload(path: string, file: File | string) {
      let data: string;
      if (typeof file === 'string') data = file;
      else data = await toBase64(file);
      return request('/api/storage/upload', {
        method: 'POST',
        body: JSON.stringify({ bucket, path, data }),
      });
    },
    async remove(paths: string[]) {
      return request('/api/storage/remove', { method: 'POST', body: JSON.stringify({ bucket, paths }) });
    },
  };
}

// ---------- Realtime (SSE) ----------
interface RealtimeListener {
  config: any;
  cb: (payload: any) => void;
}

let sseClient: EventSource | null = null;
let sseAttempts = 0;
const channels = new Map<string, Set<RealtimeListener>>();

function connectSSE() {
  if (sseClient || typeof EventSource === 'undefined') return;
  try {
    const es = new EventSource(`${API_BASE}/api/realtime`);
    es.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg || !msg.table) return;
      const listenerSet = channels.get(msg.table) || new Set();
      listenerSet.forEach(listener => {
        const cfg = listener.config || {};
        if (cfg.event && cfg.event !== '*' && cfg.event !== msg.event) return;
        if (cfg.table && cfg.table !== msg.table) return;
        if (cfg.filter && !matchesFilter(cfg.filter, msg)) return;
        try {
          listener.cb({ ...msg, eventType: msg.event, schema: 'public' });
        } catch {
          /* ignore */
        }
      });
    };
    es.onerror = () => {
      sseAttempts++;
      if (sseAttempts > 5) {
        es.close();
        sseClient = null;
      }
    };
    sseClient = es;
  } catch {
    sseClient = null;
  }
}

function matchesFilter(filter: string, msg: any): boolean {
  const m = String(filter).match(/^([\w.]+)=eq\.(.+)$/);
  if (!m) return true;
  const [, col, val] = m;
  const record = msg.new ?? msg.old;
  if (!record) return true;
  return String(record[col]) === String(val);
}

// ---------- Facade principal ----------
export const supabase: any = {
  from: (table: string) => new QueryBuilder(table),
  rpc: async (name: string, args: any) => {
    return request('/api/rpc/' + name, { method: 'POST', body: JSON.stringify({ args: args || {} }) });
  },
  channel: (name: string) => {
    const listeners = new Set<RealtimeListener>();
    const ch = {
      on: (type: string, config: any, cb: (payload: any) => void) => {
        if (type === 'postgres_changes') {
          const table = config?.table;
          if (table) {
            const set = channels.get(table) || new Set();
            set.add({ config, cb });
            channels.set(table, set);
            listeners.add({ config, cb });
          }
        }
        return ch;
      },
      subscribe: () => {
        connectSSE();
        return ch;
      },
      unsubscribe: () => {
        listeners.forEach(l => {
          const set = channels.get(l.config?.table);
          if (set) {
            set.delete(l);
            if (set.size === 0) channels.delete(l.config.table);
          }
        });
        listeners.clear();
        return ch;
      },
    };
    return ch;
  },
  removeChannel: (channel: any) => {
    if (channel && typeof channel.unsubscribe === 'function') channel.unsubscribe();
  },
  storage: {
    from: (bucket: string) => storageFrom(bucket),
  },
  functions: {
    invoke: async (name: string, opts?: { method?: string; body?: any }) => {
      return request(`/api/functions/${name}`, { method: opts?.method || 'POST', body: JSON.stringify(opts?.body || {}) });
    },
  },
  adminClear: async () => {
    return request('/api/admin/clear', { method: 'POST', body: JSON.stringify({}) });
  },
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const res = await request('/api/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (res.error) return { data: { user: null, session: null }, error: res.error };
      const session = res.data?.session || {};
      if (!session.user && res.data?.user) session.user = res.data.user;
      setAccessToken(session.access_token);
      emitAuth('SIGNED_IN', session);
      return { data: { ...res.data, session }, error: null };
    },
    async signUp({ email, password, options }: any) {
      const full_name = options?.data?.full_name || '';
      return request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, full_name }) });
    },
    async signOut() {
      await request('/api/auth/signout', { method: 'POST' });
      setAccessToken(null);
      emitAuth('SIGNED_OUT', null);
      return { error: null };
    },
    async getSession() {
      const token = getAccessToken();
      if (!token) return { data: { session: null }, error: null };
      const res = await request('/api/auth/session');
      if (res.error) {
        setAccessToken(null);
        return { data: { session: null }, error: null };
      }
      const session = res.data?.session || null;
      if (session && !session.user && res.data?.user) session.user = res.data.user;
      return { data: { session }, error: null };
    },
    async getUser() {
      const res = await request('/api/auth/user');
      if (res.error) return { data: { user: null }, error: res.error };
      return { data: { user: res.data?.user || null }, error: null };
    },
    async resetPasswordForEmail(email: string) {
      return request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) });
    },
    async updatePassword(password: string) {
      return request('/api/auth/update-password', { method: 'POST', body: JSON.stringify({ password }) });
    },
    async updateUser(attrs: any) {
      return request('/api/auth/update-user', { method: 'POST', body: JSON.stringify(attrs) });
    },
    onAuthStateChange(cb: AuthListener) {
      authListeners.add(cb);
      return {
        data: {
          subscription: {
            unsubscribe: () => authListeners.delete(cb),
          },
        },
      };
    },
  },
};

export type SupabaseClient = typeof supabase;
export { QueryBuilder };
