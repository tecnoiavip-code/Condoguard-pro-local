import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Clock, ArrowRight, User, FileText, Car, Building, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ResidentPagination from '@/components/resident/ResidentPagination';

interface VisitorEntry {
  id: string;
  visitor_name: string;
  visitor_document: string;
  visitor_type: string | null;
  purpose: string | null;
  entry_time: string | null;
  exit_time: string | null;
  company: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  photo_url: string | null;
  badge_number: string | null;
  resident_name: string | null;
  apartment: string;
  notes: string | null;
}

const ResidentVisitors = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<VisitorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VisitorEntry | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: res } = await (supabase
        .from('residents')
        .select('apartment') as any)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!res) { setLoading(false); return; }

      const { data } = await supabase
        .from('access_entries')
        .select('*')
        .eq('apartment', res.apartment)
        .order('entry_time', { ascending: false })
        .limit(50);
      setEntries((data as any) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Clock className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  const activeVisitors = entries.filter(e => !e.exit_time);
  const pastVisitors = entries.filter(e => e.exit_time);
  const pastTotalPages = Math.ceil(pastVisitors.length / PAGE_SIZE);
  const paginatedPast = pastVisitors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-bold text-foreground">Visitas</h2>
        <p className="text-sm text-muted-foreground">Registro de visitantes do seu apartamento</p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhuma visita registrada</p>
        </div>
      ) : (
        <>
          {activeVisitors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-foreground">No local agora</span>
              </div>
              {activeVisitors.map((e) => (
                <VisitorCard key={e.id} entry={e} active onClick={() => setSelected(e)} />
              ))}
            </div>
          )}

          {pastVisitors.length > 0 && (
            <div className="space-y-3">
              {activeVisitors.length > 0 && (
                <span className="text-sm font-semibold text-muted-foreground">Anteriores</span>
              )}
              {paginatedPast.map((e) => (
                <VisitorCard key={e.id} entry={e} onClick={() => setSelected(e)} />
              ))}
              <ResidentPagination currentPage={page} totalPages={pastTotalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Visita</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selected.photo_url ? (
                  <img src={selected.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="p-3 rounded-full bg-muted">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-lg">{selected.visitor_name}</p>
                  <Badge variant={!selected.exit_time ? 'default' : 'secondary'} className={cn(
                    "text-xs",
                    !selected.exit_time && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15"
                  )}>
                    {selected.visitor_type === 'service_provider' ? 'Prestador' : 'Visitante'}
                    {!selected.exit_time ? ' • No local' : ''}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3">
                {selected.visitor_document && (
                  <DetailRow icon={FileText} label="Documento" value={selected.visitor_document} />
                )}
                {selected.badge_number && (
                  <DetailRow icon={FileText} label="Crachá" value={selected.badge_number} />
                )}
                {selected.company && (
                  <DetailRow icon={Building} label="Empresa" value={selected.company} />
                )}
                {selected.purpose && (
                  <DetailRow icon={FileText} label="Motivo" value={selected.purpose} />
                )}
                {(selected.vehicle_plate || selected.vehicle_model) && (
                  <DetailRow icon={Car} label="Veículo" value={[selected.vehicle_plate, selected.vehicle_model, selected.vehicle_color].filter(Boolean).join(' • ')} />
                )}
                {selected.entry_time && (
                  <DetailRow icon={Calendar} label="Entrada" value={format(new Date(selected.entry_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} />
                )}
                {selected.exit_time && (
                  <DetailRow icon={Calendar} label="Saída" value={format(new Date(selected.exit_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} />
                )}
                {selected.notes && (
                  <DetailRow icon={FileText} label="Observações" value={selected.notes} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DetailRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium">{value}</span>
  </div>
);

const VisitorCard = ({ entry: e, active, onClick }: { entry: VisitorEntry; active?: boolean; onClick: () => void }) => (
  <div
    onClick={onClick}
    className={cn(
      "bg-card/80 backdrop-blur-sm border rounded-2xl p-4 transition-all cursor-pointer active:scale-[0.98]",
      active ? "border-emerald-500/30 shadow-[0_0_15px_-5px] shadow-emerald-500/20 hover:shadow-emerald-500/30" : "border-border/50 hover:border-border"
    )}
  >
    <div className="flex items-start gap-3">
      <div className={cn(
        "p-2.5 rounded-xl flex-shrink-0",
        active ? "bg-emerald-500/10" : "bg-muted/80"
      )}>
        <Users className={cn("h-5 w-5", active ? "text-emerald-500" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-foreground truncate">{e.visitor_name}</p>
          <Badge
            variant={active ? 'default' : 'secondary'}
            className={cn(
              "text-xs shrink-0",
              active && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15"
            )}
          >
            {active ? 'No local' : 'Saiu'}
          </Badge>
        </div>
        {e.company && (
          <p className="text-sm text-muted-foreground mt-0.5">{e.company}</p>
        )}
        {e.purpose && (
          <p className="text-sm text-muted-foreground">{e.purpose}</p>
        )}
        {e.entry_time && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            <span>Entrada: {format(new Date(e.entry_time), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
            {e.exit_time && (
              <>
                <span className="mx-1">•</span>
                <span>Saída: {format(new Date(e.exit_time), "HH:mm", { locale: ptBR })}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default ResidentVisitors;