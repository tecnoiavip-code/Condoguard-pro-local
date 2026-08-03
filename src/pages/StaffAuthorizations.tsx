import { useEffect, useState } from 'react';
import StandardPagination from '@/components/StandardPagination';
import { supabase } from '@/integrations/supabase/client';
import { sendPushToUser } from '@/lib/push-subscription';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Check, X, Clock, Users, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, User, Car, FileText, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Authorization {
  id: string;
  resident_id: string;
  visitor_name: string;
  visitor_document: string | null;
  authorized_date: string;
  authorized_until: string | null;
  purpose: string | null;
  vehicle_plate: string | null;
  status: string | null;
  staff_notes: string | null;
  created_at: string;
}

interface ResidentInfo {
  name: string;
  apartment: string;
}

interface GuestListGroup {
  key: string;
  title: string;
  authorized_date: string;
  resident?: ResidentInfo;
  resident_id: string;
  vehicle_plate: string | null;
  items: (Authorization & { resident?: ResidentInfo })[];
}

const StaffAuthorizations = () => {
  const { user } = useAuth();
  const [auths, setAuths] = useState<(Authorization & { resident?: ResidentInfo })[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [staffNotes, setStaffNotes] = useState('');
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [guestPage, setGuestPage] = useState(1);
  const [selectedAuth, setSelectedAuth] = useState<(Authorization & { resident?: ResidentInfo }) | null>(null);
  const PAGE_SIZE = 10;

  const loadAuths = async () => {
    const { data } = await supabase
      .from('visitor_authorizations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!data) { setLoading(false); return; }

    const enriched = await Promise.all(
      (data as any[]).map(async (a: Authorization) => {
        const { data: res } = await supabase
          .from('residents')
          .select('name, apartment')
          .eq('id', a.resident_id)
          .maybeSingle();
        return { ...a, resident: res || undefined };
      })
    );

    setAuths(enriched);
    setLoading(false);
  };

  useEffect(() => { loadAuths(); }, []);

  // Set up realtime subscription to auto-refresh when authorizations change
  useEffect(() => {
    const channel = supabase
      .channel('staff-auth-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_authorizations' }, () => {
        loadAuths();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    const auth = auths.find(a => a.id === id);
    await supabase
      .from('visitor_authorizations')
      .update({ status, staff_notes: staffNotes || null, reviewed_by: user?.id } as any)
      .eq('id', id);

    if (auth) {
      const { data: res } = await (supabase.from('residents').select('auth_user_id') as any)
        .eq('id', auth.resident_id)
        .maybeSingle();
      if (res?.auth_user_id) {
        const title = status === 'approved' ? '✅ Autorização aprovada' : '❌ Autorização rejeitada';
        const body = `Visitante: ${auth.visitor_name}${staffNotes ? ` — ${staffNotes}` : ''}`;
        await supabase.from('notifications').insert({
          user_id: res.auth_user_id,
          title,
          body,
          type: 'authorization',
          related_id: id,
        });
        sendPushToUser(res.auth_user_id, title, body, 'authorization');
      }
    }

    toast.success(status === 'approved' ? 'Autorização aprovada!' : 'Autorização rejeitada');
    setReviewId(null);
    setStaffNotes('');
    loadAuths();
  };

  const handleBulkReview = async (items: (Authorization & { resident?: ResidentInfo })[], status: 'approved' | 'rejected') => {
    const pendingItems = items.filter(a => a.status === 'pending');
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      await supabase
        .from('visitor_authorizations')
        .update({ status, staff_notes: staffNotes || null, reviewed_by: user?.id } as any)
        .eq('id', item.id);
    }

    // Notify resident
    const first = pendingItems[0];
    const { data: res } = await (supabase.from('residents').select('auth_user_id') as any)
      .eq('id', first.resident_id)
      .maybeSingle();
    if (res?.auth_user_id) {
      const title = status === 'approved' ? '✅ Lista de convidados aprovada' : '❌ Lista de convidados rejeitada';
      const body = `${pendingItems.length} convidado(s)${staffNotes ? ` — ${staffNotes}` : ''}`;
      await supabase.from('notifications').insert({
        user_id: res.auth_user_id,
        title,
        body,
        type: 'authorization',
      });
      sendPushToUser(res.auth_user_id, title, body, 'authorization');
    }

    toast.success(status === 'approved' ? 'Lista aprovada!' : 'Lista rejeitada');
    setStaffNotes('');
    loadAuths();
  };

  const toggleList = (key: string) => {
    setExpandedLists(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (loading) return <div className="flex justify-center p-8"><Clock className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Separate guest lists (multiple entries with same purpose+date+resident) from individual auths
  const grouped = new Map<string, (Authorization & { resident?: ResidentInfo })[]>();
  const singles: (Authorization & { resident?: ResidentInfo })[] = [];

  // Group by purpose+date+resident_id where purpose exists
  auths.forEach(a => {
    if (a.purpose) {
      const key = `${a.resident_id}|${a.authorized_date}|${a.purpose}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    } else {
      singles.push(a);
    }
  });

  // Separate actual guest lists (2+ items) from singles that happen to have purpose
  const guestLists: GuestListGroup[] = [];
  grouped.forEach((items, key) => {
    if (items.length >= 2) {
      guestLists.push({
        key,
        title: items[0].purpose!,
        authorized_date: items[0].authorized_date,
        resident: items[0].resident,
        resident_id: items[0].resident_id,
        vehicle_plate: items[0].vehicle_plate,
        items,
      });
    } else {
      singles.push(...items);
    }
  });

  // Sort singles by created_at desc
  singles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const statusLabels: Record<string, string> = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', expired: 'Expirada' };
  const statusVariant = (s: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (s === 'approved') return 'default';
    if (s === 'rejected') return 'destructive';
    if (s === 'expired') return 'secondary';
    return 'outline';
  };

  // Pagination for guest lists
  const guestTotalPages = Math.max(1, Math.ceil(guestLists.length / PAGE_SIZE));
  const safeGuestPage = Math.min(guestPage, guestTotalPages);
  if (safeGuestPage !== guestPage) setGuestPage(safeGuestPage);
  const paginatedGuests = guestLists
    .sort((a, b) => new Date(b.items[0]?.created_at || '').getTime() - new Date(a.items[0]?.created_at || '').getTime())
    .slice((safeGuestPage - 1) * PAGE_SIZE, safeGuestPage * PAGE_SIZE);

  // Pagination for singles
  const singlesTotalPages = Math.max(1, Math.ceil(singles.length / PAGE_SIZE));
  const safePage = Math.min(page, singlesTotalPages);
  if (safePage !== page) setPage(safePage);
  const paginatedSingles = singles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Autorizações de Visitantes</h2>
      </div>

      <Tabs defaultValue="individual" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="individual" className="flex-1 gap-1.5">
            <Shield className="h-4 w-4" /> Individuais
            <Badge variant="secondary" className="ml-1 text-xs">{singles.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="guests" className="flex-1 gap-1.5">
            <Users className="h-4 w-4" /> Listas de Convidados
            <Badge variant="secondary" className="ml-1 text-xs">{guestLists.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Individual Authorizations Tab */}
        <TabsContent value="individual" className="space-y-3 mt-3">
          {singles.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhuma autorização individual</CardContent></Card>
          ) : (
            <>
              {paginatedSingles.map((a) => (
                <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAuth(a)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Shield className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium">{a.visitor_name}</p>
                          <p className="text-sm text-muted-foreground">Morador: {a.resident?.name} - Apto {a.resident?.apartment}</p>
                          <p className="text-sm text-muted-foreground">
                            Data: {format(new Date(a.authorized_date), 'dd/MM/yyyy', { locale: ptBR })}
                            {a.authorized_until && ` até ${format(new Date(a.authorized_until), 'dd/MM/yyyy', { locale: ptBR })}`}
                          </p>
                          {a.purpose && <p className="text-xs text-muted-foreground">{a.purpose}</p>}
                          {a.vehicle_plate && <p className="text-xs text-muted-foreground">Placa: {a.vehicle_plate}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(a.status)}>{statusLabels[a.status || 'pending']}</Badge>
                        {a.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setReviewId(a.id); }}>Revisar</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Review dialog for pending individual */}
              {reviewId && singles.find(s => s.id === reviewId) && (() => {
                const a = singles.find(s => s.id === reviewId)!;
                return (
                  <Dialog open={!!reviewId && !!singles.find(s => s.id === reviewId)} onOpenChange={(o) => { if (!o) setReviewId(null); }}>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Revisar Autorização</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <p><strong>Visitante:</strong> {a.visitor_name}</p>
                        <p><strong>Morador:</strong> {a.resident?.name} - Apto {a.resident?.apartment}</p>
                        <Textarea placeholder="Observações (opcional)" value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} />
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => handleReview(a.id, 'approved')}><Check className="h-4 w-4 mr-1" /> Aprovar</Button>
                          <Button variant="destructive" className="flex-1" onClick={() => handleReview(a.id, 'rejected')}><X className="h-4 w-4 mr-1" /> Rejeitar</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                );
              })()}
              <StandardPagination currentPage={safePage} totalPages={singlesTotalPages} onPageChange={setPage} />
            </>
          )}
        </TabsContent>

        {/* Guest Lists Tab */}
        <TabsContent value="guests" className="space-y-3 mt-3">
          {guestLists.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhuma lista de convidados</CardContent></Card>
          ) : (
            <>
              {paginatedGuests.map((list) => {
                const isExpanded = expandedLists.has(list.key);
                const approvedCount = list.items.filter(i => i.status === 'approved').length;
                const pendingCount = list.items.filter(i => i.status === 'pending').length;
                const totalCount = list.items.length;

                return (
                  <Card key={list.key} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleList(list.key)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{list.title}</p>
                              <p className="text-sm text-muted-foreground">Morador: {list.resident?.name} - Apto {list.resident?.apartment}</p>
                              <p className="text-sm text-muted-foreground">Data: {format(new Date(list.authorized_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                              {list.vehicle_plate && <p className="text-xs text-muted-foreground">Placa: {list.vehicle_plate}</p>}
                              <div className="flex gap-2 mt-1.5 flex-wrap">
                                <Badge variant="outline" className="text-xs">{totalCount} convidado(s)</Badge>
                                {approvedCount > 0 && <Badge variant="default" className="text-xs">{approvedCount} validado(s)</Badge>}
                                {pendingCount > 0 && <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">{pendingCount} pendente(s)</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {pendingCount > 0 && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); handleBulkReview(list.items, 'approved'); }}>
                                  <Check className="h-4 w-4 mr-1" /> Aprovar
                                </Button>
                                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleBulkReview(list.items, 'rejected'); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t divide-y">
                          {list.items.map((a) => (
                            <div key={a.id} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedAuth(a)}>
                              <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${a.status === 'approved' ? 'bg-primary' : a.status === 'rejected' ? 'bg-destructive' : 'bg-amber-500'}`} />
                                <div>
                                  <p className="text-sm font-medium">{a.visitor_name}</p>
                                  {a.visitor_document && <p className="text-xs text-muted-foreground">Doc: {a.visitor_document}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={statusVariant(a.status)} className="text-xs">{statusLabels[a.status || 'pending']}</Badge>
                                {a.status === 'pending' && (
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setReviewId(a.id); }}>Revisar</Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <StandardPagination currentPage={safeGuestPage} totalPages={guestTotalPages} onPageChange={setGuestPage} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Review dialog for guest list items */}
      {reviewId && auths.find(a => a.id === reviewId) && !singles.find(s => s.id === reviewId) && (() => {
        const a = auths.find(a => a.id === reviewId)!;
        return (
          <Dialog open={true} onOpenChange={(o) => { if (!o) setReviewId(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Revisar Autorização</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p><strong>Visitante:</strong> {a.visitor_name}</p>
                <p><strong>Morador:</strong> {a.resident?.name} - Apto {a.resident?.apartment}</p>
                <Textarea placeholder="Observações (opcional)" value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} />
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => handleReview(a.id, 'approved')}><Check className="h-4 w-4 mr-1" /> Aprovar</Button>
                  <Button variant="destructive" className="flex-1" onClick={() => handleReview(a.id, 'rejected')}><X className="h-4 w-4 mr-1" /> Rejeitar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Detail dialog for any authorization */}
      <Dialog open={!!selectedAuth} onOpenChange={(o) => { if (!o) setSelectedAuth(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Autorização</DialogTitle>
          </DialogHeader>
          {selectedAuth && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-muted">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedAuth.visitor_name}</p>
                  <Badge variant={statusVariant(selectedAuth.status)}>{statusLabels[selectedAuth.status || 'pending']}</Badge>
                </div>
              </div>

              <div className="grid gap-3">
                {selectedAuth.visitor_document && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Documento:</span>
                    <span className="font-medium">{selectedAuth.visitor_document}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Morador:</span>
                  <span className="font-medium">{selectedAuth.resident?.name} - Apto {selectedAuth.resident?.apartment}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">
                    {format(new Date(selectedAuth.authorized_date), 'dd/MM/yyyy', { locale: ptBR })}
                    {selectedAuth.authorized_until && ` até ${format(new Date(selectedAuth.authorized_until), 'dd/MM/yyyy', { locale: ptBR })}`}
                  </span>
                </div>

                {selectedAuth.purpose && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Motivo:</span>
                    <span className="font-medium">{selectedAuth.purpose}</span>
                  </div>
                )}

                {selectedAuth.vehicle_plate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Placa:</span>
                    <span className="font-medium">{selectedAuth.vehicle_plate}</span>
                  </div>
                )}

                {selectedAuth.staff_notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">Obs. portaria:</span>
                    <span className="font-medium">{selectedAuth.staff_notes}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Criada em:</span>
                  <span className="font-medium">{format(new Date(selectedAuth.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffAuthorizations;
