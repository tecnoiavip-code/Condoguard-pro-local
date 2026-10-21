import { supabase } from '@/integrations/supabase/client';

export interface FacialReleaseRequest {
  id: string;
  device_id?: string | null;
  visitor_name: string;
  visitor_document?: string | null;
  visitor_type?: string | null;
  apartment?: string | null;
  resident_name?: string | null;
  photo_url?: string | null;
  company?: string | null;
  vehicle_plate?: string | null;
  purpose?: string | null;
  match_source?: string | null;
  match_distance?: number | null;
  requested_at: string;
}

export const FACIAL_RELEASE_POLL_MS = 4000;

interface FunctionPayload {
  requests?: FacialReleaseRequest[];
  ok?: boolean;
  remote_open?: boolean;
}

const unwrap = (response: { data?: unknown; error?: { message?: string } | null }): FunctionPayload => {
  if (response?.error) throw new Error(response.error.message || 'Falha ao consultar a liberação facial');
  const data = response?.data;
  if (data && typeof data === 'object') return data as FunctionPayload;
  return (response || {}) as FunctionPayload;
};

export async function listFacialReleaseRequests(): Promise<FacialReleaseRequest[]> {
  const response = await supabase.functions.invoke('facial-release', { body: { action: 'list' } });
  const payload = unwrap(response);
  const requests = payload?.requests ?? [];
  return Array.isArray(requests) ? requests : [];
}

export interface FacialReleaseOverride {
  resident_id?: string;
  resident_name?: string;
  apartment?: string;
}

export async function resolveFacialRelease(
  requestId: string,
  approve: boolean,
  overrides?: FacialReleaseOverride,
): Promise<{ remote_open?: boolean }> {
  const response = await supabase.functions.invoke('facial-release', {
    body: { action: approve ? 'approve' : 'deny', request_id: requestId, ...(approve ? overrides : {}) },
  });
  const payload = unwrap(response);
  if (payload?.ok === false) throw new Error(payload?.error?.message || 'Não foi possível concluir a liberação');
  return { remote_open: payload?.remote_open };
}
