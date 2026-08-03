import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Mail, Package, Clock, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ResidentPagination from '@/components/resident/ResidentPagination';

interface MailItem {
  id: string;
  sender: string;
  package_type: string | null;
  status: string | null;
  received_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  tracking_code: string | null;
  photo_url: string | null;
}

const ResidentMails = () => {
  const { user } = useAuth();
  const [mails, setMails] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPage, setPendingPage] = useState(1);
  const [deliveredPage, setDeliveredPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: res } = await (supabase
        .from('residents')
        .select('id') as any)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!res) { setLoading(false); return; }

      const { data } = await supabase
        .from('mails')
        .select('id, sender, package_type, status, received_at, delivered_at, notes, tracking_code, photo_url')
        .eq('resident_id', res.id)
        .order('received_at', { ascending: false })
        .limit(50);
      setMails(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Clock className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  const pending = mails.filter(m => m.status === 'pending');
  const delivered = mails.filter(m => m.status !== 'pending');
  const pendingTotalPages = Math.ceil(pending.length / PAGE_SIZE);
  const deliveredTotalPages = Math.ceil(delivered.length / PAGE_SIZE);
  const paginatedPending = pending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);
  const paginatedDelivered = delivered.slice((deliveredPage - 1) * PAGE_SIZE, deliveredPage * PAGE_SIZE);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-bold text-foreground">Correspondências</h2>
        <p className="text-sm text-muted-foreground">Encomendas e cartas recebidas</p>
      </div>

      {mails.length === 0 ? (
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center">
          <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhuma correspondência registrada</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm font-semibold text-foreground">Aguardando retirada</span>
                <Badge variant="secondary" className="text-xs">{pending.length}</Badge>
              </div>
              {paginatedPending.map((m) => (
                <MailCard key={m.id} mail={m} isPending />
              ))}
              <ResidentPagination currentPage={pendingPage} totalPages={pendingTotalPages} onPageChange={setPendingPage} />
            </div>
          )}

          {delivered.length > 0 && (
            <div className="space-y-3">
              {pending.length > 0 && (
                <span className="text-sm font-semibold text-muted-foreground">Entregues</span>
              )}
              {paginatedDelivered.map((m) => (
                <MailCard key={m.id} mail={m} />
              ))}
              <ResidentPagination currentPage={deliveredPage} totalPages={deliveredTotalPages} onPageChange={setDeliveredPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const MailCard = ({ mail: m, isPending }: { mail: MailItem; isPending?: boolean }) => {
  const isPackage = m.package_type?.includes('Pacote');
  
  return (
    <div className={cn(
      "bg-card/80 backdrop-blur-sm border rounded-2xl p-4 transition-all",
      isPending ? "border-amber-500/30 shadow-[0_0_15px_-5px] shadow-amber-500/20" : "border-border/50"
    )}>
      <div className="flex items-start gap-3">
        {m.photo_url ? (
          <img src={m.photo_url} alt="Foto" className="w-14 h-14 rounded-xl object-cover border border-border/50 flex-shrink-0" />
        ) : (
          <div className={cn(
            "p-2.5 rounded-xl flex-shrink-0",
            isPending ? "bg-amber-500/10" : "bg-muted/80"
          )}>
            {isPackage
              ? <Package className={cn("h-5 w-5", isPending ? "text-amber-500" : "text-muted-foreground")} />
              : <Mail className={cn("h-5 w-5", isPending ? "text-amber-500" : "text-muted-foreground")} />
            }
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground truncate">{m.sender}</p>
            <Badge
              variant={isPending ? 'destructive' : 'secondary'}
              className={cn(
                "text-xs shrink-0",
                isPending && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15"
              )}
            >
              {isPending ? 'Pendente' : 'Entregue'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{m.package_type || 'Carta'}</p>
          {m.tracking_code && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-mono bg-muted/80 px-2 py-0.5 rounded-lg">{m.tracking_code}</span>
            </div>
          )}
          {m.received_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Recebido: {format(new Date(m.received_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
          {m.notes && <p className="text-xs text-muted-foreground mt-1">{m.notes}</p>}
        </div>
      </div>
    </div>
  );
};

export default ResidentMails;
