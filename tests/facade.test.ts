// Testa o facade de compatibilidade sem depender de jsdom (polyfill de localStorage).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase } from '../src/integrations/supabase/client';

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: () => null,
    get length() { return store.size; },
  };
}

describe('facade supabase (QueryBuilder)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    installLocalStoragePolyfill();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('serializa select com filtros eq + or', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: '1' }], error: null }), { status: 200 })
    );
    const { data, error } = await supabase
      .from('residents')
      .select('id,name')
      .eq('apartment', '101')
      .or('name.eq.Maria,name.eq.Joao');

    expect(error).toBeNull();
    expect(data).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/table/residents');
    expect(url).toContain('select=id%2Cname');
    expect(url).toContain('or=');
  });

  it('filtros booleanos são normalizados para 0/1', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], error: null }), { status: 200 })
    );
    await supabase.from('residents').select('*').eq('is_active', true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('filters=');
    expect(decodeURIComponent(url)).toContain('"value":1');
  });

  it('single() devolve objeto único', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'x1' }], error: null }), { status: 200 })
    );
    const { data } = await supabase.from('residents').select('*').eq('id', 'x1').single();
    expect(Array.isArray(data)).toBe(false);
    expect(data?.id).toBe('x1');
  });

  it('single() com zero linhas retorna PGRST116', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], error: null }), { status: 200 })
    );
    const { data, error } = await supabase.from('residents').select('*').single();
    expect(data).toBeNull();
    expect(error?.code).toBe('PGRST116');
  });

  it('insert usa POST e envia row no corpo', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'new1' }], error: null }), { status: 201 })
    );
    const { data } = await supabase.from('residents').insert({ id: 'new1', name: 'X' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).row.id).toBe('new1');
    expect(data?.[0].id).toBe('new1');
  });

  it('update envia set + filtros via PATCH', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], error: null }), { status: 200 })
    );
    await supabase.from('residents').update({ phone: '9999' }).eq('id', 'x1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(String(init.body));
    expect(body.set.phone).toBe('9999');
    expect(body.filters[0]).toMatchObject({ col: 'id', op: 'eq', value: 'x1' });
  });

  it('auth.signInWithPassword guarda token, emite evento e propaga user na session', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            session: { access_token: 'tok123', token_type: 'bearer' },
            user: { id: 'u1', email: 'a@b.c' },
          },
          error: null,
        }),
        { status: 200 }
      )
    );
    let emitted: any = null;
    const onEvent = vi.fn((_event: string, session: any) => { emitted = session; });
    const sub = supabase.auth.onAuthStateChange(onEvent);

    const res = await supabase.auth.signInWithPassword({ email: 'a@b.c', password: 'x' });
    expect(res.error).toBeNull();
    expect(localStorage.getItem('pg_access_token')).toBe('tok123');
    expect(onEvent.mock.calls[0][0]).toBe('SIGNED_IN');
    expect(emitted.access_token).toBe('tok123');
    expect(emitted.user?.id).toBe('u1');
    expect(res.data.session.user?.id).toBe('u1');

    sub.data.subscription.unsubscribe();
  });
});
