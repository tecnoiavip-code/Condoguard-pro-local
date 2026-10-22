import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { ScanFace, ShieldCheck, ShieldX, Clock, MapPin, User, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notification-sound';
import {
  FACIAL_RELEASE_POLL_MS,
  type FacialReleaseRequest,
  listFacialReleaseRequests,
  resolveFacialRelease,
} from '@/lib/facial-release';

const TYPE_LABELS: Record<string, string> = {
  visitor: 'Visitante',
  service_provider: 'Prestador de serviço',
  delivery: 'Entregador',
};

interface ResidentOption {
  id: string;
  name: string;
  apartment: string;
  person_type?: string | null;
}

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const FacialReleaseModal = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<FacialReleaseRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const lastSoundId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const list = await listFacialReleaseRequests();
        if (cancelled) return;
        setRequests(list);
        const newest = list[0];
        if (newest && newest.id !== lastSoundId.current) {
          lastSoundId.current = newest.id;
          playNotificationSound();
        }
      } catch {
        /* silencioso: tenta de novo no próximo ciclo */
      }
    };

    load();
    const timer = setInterval(load, FACIAL_RELEASE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  const pending = requests.find((request) => !dismissed.has(request.id)) || null;
  const pendingId = pending?.id;
  const pendingResidentId = pending?.resident_id;
  const pendingApartment = pending?.apartment;
  const pendingResidentName = pending?.resident_name;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('residents')
      .select('id, name, apartment, person_type')
      .order('apartment', { ascending: true })
      .then(({ data }: { data: ResidentOption[] | null }) => {
        if (!cancelled && data) {
          setResidents(data.filter((resident) => (resident.person_type ?? 'morador') === 'morador'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, pendingId]);

  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingId) {
      pendingRef.current = null;
      return;
    }
    if (pendingRef.current !== pendingId) {
      pendingRef.current = pendingId;
      setSelectedResidentId('');
    }
  }, [pendingId]);

  useEffect(() => {
    if (!pendingId || selectedResidentId) return;
    const previous = residents.find((resident) => resident.id === pendingResidentId)
      || residents.find((resident) => resident.apartment === pendingApartment
        && (!pendingResidentName || resident.name === pendingResidentName))
      || residents.find((resident) => resident.apartment === pendingApartment);
    setSelectedResidentId(previous?.id || '');
  }, [pendingId, selectedResidentId, pendingResidentId, pendingApartment, pendingResidentName, residents]);

  const handleResolve = async (approve: boolean) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const chosen = residents.find((resident) => resident.id === selectedResidentId);
      const result = await resolveFacialRelease(
        pending.id,
        approve,
        approve && chosen
          ? { resident_id: chosen.id, resident_name: chosen.name, apartment: chosen.apartment }
          : undefined,
      );
      if (approve && result.remote_open === false) {
        toast.warning('Acesso registrado, mas nenhum leitor ativo recebeu a abertura remota.');
      } else {
        toast.success(approve ? 'Acesso facial liberado' : 'Acesso facial negado');
      }
      setRequests((prev) => prev.filter((request) => request.id !== pending.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a liberação');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    if (!pending) return;
    setDismissed((prev) => new Set(prev).add(pending.id));
  };

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            Liberação de acesso facial
          </DialogTitle>
          <DialogDescription>
            Cadastro do Novo Cadastro reconhecido na volta ao condomínio.
          </DialogDescription>
        </DialogHeader>

        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
              {pending.photo_url ? (
                <img
                  src={pending.photo_url}
                  alt={pending.visitor_name}
                  className="h-20 w-20 flex-shrink-0 rounded-full border-2 border-primary/20 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-muted text-2xl">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{pending.visitor_name}</p>
                <p className="text-sm text-muted-foreground">{pending.visitor_document || 'Documento não informado'}</p>
                <Badge variant="secondary" className="mt-1">
                  {TYPE_LABELS[pending.visitor_type || ''] || 'Visitante'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Apartamento / morador desta entrada</span>
                </div>
                <Combobox
                  options={residents.map((resident) => ({
                    value: resident.id,
                    label: `${resident.apartment} — ${resident.name}`,
                  }))}
                  value={selectedResidentId}
                  onValueChange={setSelectedResidentId}
                  placeholder={residents.length === 0 ? 'Carregando moradores...' : 'Busque por apartamento ou nome'}
                  emptyText="Nenhum morador encontrado."
                  className="h-9"
                />
                {pending.apartment && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    Visita anterior: {pending.apartment}{pending.resident_name ? ` — ${pending.resident_name}` : ''}
                  </p>
                )}
              </div>
              {pending.company && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Empresa:</span>
                  <span className="font-medium">{pending.company}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Solicitado:</span>
                <span className="font-medium">{formatTime(pending.requested_at)}</span>
              </div>
              {pending.match_distance != null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ScanFace className="h-3.5 w-3.5" />
                  Confiança facial: {Math.max(0, Math.round((1 - Number(pending.match_distance)) * 100))}%
                </div>
              )}
            </div>

            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              A liberação vale para <strong>uma entrada e uma saída</strong>. O cadastro e a face permanecem no sistema/leitor.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={dismiss} disabled={busy}>
            Depois
          </Button>
          <Button variant="destructive" onClick={() => handleResolve(false)} disabled={busy}>
            <ShieldX className="mr-2 h-4 w-4" />
            Negar
          </Button>
          <Button onClick={() => handleResolve(true)} disabled={busy || !selectedResidentId}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Liberar acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
