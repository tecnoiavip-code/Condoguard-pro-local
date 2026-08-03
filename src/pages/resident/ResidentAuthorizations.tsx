import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, Plus, Clock, CalendarDays, Car, MessageSquare, Users, Trash2, FileText, User, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ResidentPagination from '@/components/resident/ResidentPagination';

interface Authorization {
  id: string;
  visitor_name: string;
  visitor_document: string | null;
  authorized_date: string;
  authorized_until: string | null;
  purpose: string | null;
  vehicle_plate: string | null;
  status: string | null;
  staff_notes: string | null;
}

interface GuestItem {
  name: string;
  document: string;
}

const statusConfig: Record<string, { label: string; color: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', variant: 'outline' },
  approved: { label: 'Aprovada', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', variant: 'default' },
  rejected: { label: 'Rejeitada', color: 'bg-destructive/10 text-destructive border-destructive/30', variant: 'destructive' },
  expired: { label: 'Expirada', color: 'bg-muted text-muted-foreground border-border', variant: 'secondary' },
};

const ResidentAuthorizations = () => {
  const { user } = useAuth();
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [residentId, setResidentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [guestListOpen, setGuestListOpen] = useState(false);
  const [detailAuth, setDetailAuth] = useState<Authorization | null>(null);
  const [form, setForm] = useState({ visitor_name: '', visitor_document: '', authorized_date: '', authorized_until: '', purpose: '', vehicle_plate: '' });
  const [authPage, setAuthPage] = useState(1);
  const PAGE_SIZE = 10;
  // Guest list state
  const [guests, setGuests] = useState<GuestItem[]>([{ name: '', document: '' }]);
  const [guestListForm, setGuestListForm] = useState({ title: '', authorized_date: '', vehicle_plate: '' });

  const loadAuths = async (rid: string) => {
    const { data } = await supabase
      .from('visitor_authorizations')
      .select('*')
      .eq('resident_id', rid)
      .order('created_at', { ascending: false });
    setAuths((data as any) || []);
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data: res } = await (supabase
        .from('residents')
        .select('id') as any)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!res) { setLoading(false); return; }
      setResidentId(res.id);
      await loadAuths(res.id);
      setLoading(false);
    };
    init();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!residentId) return;

    const { data: existing } = await supabase
      .from('visitor_authorizations')
      .select('id')
      .eq('resident_id', residentId)
      .ilike('visitor_name', form.visitor_name.trim())
      .eq('authorized_date', form.authorized_date)
      .in('status', ['pending', 'approved'] as any)
      .limit(1);
    
    if (existing && existing.length > 0) {
      toast.error(`Já existe uma autorização ativa para ${form.visitor_name} nesta data.`);
      return;
    }

    const { error } = await supabase.from('visitor_authorizations').insert({
      resident_id: residentId,
      visitor_name: form.visitor_name,
      visitor_document: form.visitor_document || null,
      authorized_date: form.authorized_date,
      authorized_until: form.authorized_until || null,
      purpose: form.purpose || null,
      vehicle_plate: form.vehicle_plate || null,
    } as any);
    if (error) { toast.error('Erro ao enviar autorização'); return; }
    toast.success('Autorização enviada à portaria!');
    setOpen(false);
    setForm({ visitor_name: '', visitor_document: '', authorized_date: '', authorized_until: '', purpose: '', vehicle_plate: '' });
    await loadAuths(residentId);

    await supabase.rpc('notify_all_staff', {
      _title: 'Nova autorização de visitante',
      _body: `Morador autorizou a entrada de ${form.visitor_name}`,
      _type: 'authorization',
    });
  };

  const addGuest = () => {
    setGuests([...guests, { name: '', document: '' }]);
  };

  const removeGuest = (index: number) => {
    if (guests.length <= 1) return;
    setGuests(guests.filter((_, i) => i !== index));
  };

  const updateGuest = (index: number, field: keyof GuestItem, value: string) => {
    const updated = [...guests];
    updated[index] = { ...updated[index], [field]: value };
    setGuests(updated);
  };

  const handleGuestListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!residentId) return;

    const validGuests = guests.filter(g => g.name.trim());
    if (validGuests.length === 0) {
      toast.error('Adicione pelo menos um convidado com nome.');
      return;
    }

    if (!guestListForm.authorized_date) {
      toast.error('Informe a data autorizada.');
      return;
    }

    const insertData = validGuests.map(g => ({
      resident_id: residentId,
      visitor_name: g.name.trim(),
      visitor_document: g.document.trim() || null,
      authorized_date: guestListForm.authorized_date,
      authorized_until: null,
      purpose: guestListForm.title.trim() || null,
      vehicle_plate: guestListForm.vehicle_plate || null,
    }));

    const { error } = await supabase.from('visitor_authorizations').insert(insertData as any);
    if (error) { toast.error('Erro ao enviar lista de convidados'); return; }

    toast.success(`${validGuests.length} convidado(s) autorizado(s) com sucesso!`);
    setGuestListOpen(false);
    setGuests([{ name: '', document: '' }]);
    setGuestListForm({ title: '', authorized_date: '', vehicle_plate: '' });
    await loadAuths(residentId);

    // Notify staff
    const names = validGuests.map(g => g.name.trim()).join(', ');
    await supabase.rpc('notify_all_staff', {
      _title: 'Nova lista de convidados',
      _body: `Morador autorizou ${validGuests.length} convidado(s): ${names.substring(0, 80)}`,
      _type: 'authorization',
    });
  };

  const handleDelete = async (id: string) => {
    if (!residentId) return;
    const { error } = await supabase.from('visitor_authorizations').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir autorização'); return; }
    toast.success('Autorização excluída!');
    setDetailAuth(null);
    await loadAuths(residentId);
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Clock className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Autorizações</h2>
          <p className="text-sm text-muted-foreground">Gerencie acessos de visitantes</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Guest List Button */}
          <Dialog open={guestListOpen} onOpenChange={setGuestListOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 flex-1 sm:flex-initial text-xs sm:text-sm">
                <Users className="h-4 w-4 shrink-0" /><span className="truncate">Lista de Convidados</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl w-[95vw] max-w-lg max-h-[90vh] flex flex-col p-0" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <DialogTitle>Lista de Convidados</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGuestListSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Convidados</Label>
                      <Button type="button" size="sm" variant="ghost" className="rounded-xl gap-1 text-xs h-7" onClick={addGuest}>
                        <Plus className="h-3 w-3" />Adicionar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {guests.map((guest, index) => (
                        <div key={index} className="border border-border/50 rounded-xl p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              className="rounded-xl text-sm flex-1"
                              placeholder="Nome do convidado *"
                              value={guest.name}
                              onChange={(e) => updateGuest(index, 'name', e.target.value)}
                              required
                            />
                            {guests.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={() => removeGuest(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Input
                            className="rounded-xl text-sm"
                            placeholder="Documento (opcional)"
                            value={guest.document}
                            onChange={(e) => updateGuest(index, 'document', e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{guests.filter(g => g.name.trim()).length} convidado(s) adicionado(s)</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Título da lista *</Label>
                    <Input className="rounded-xl" placeholder="Ex: Aniversário, Churrasco..." value={guestListForm.title} onChange={(e) => setGuestListForm({ ...guestListForm, title: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Data autorizada *</Label>
                    <Input className="rounded-xl" type="date" value={guestListForm.authorized_date} onChange={(e) => setGuestListForm({ ...guestListForm, authorized_date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Placa do veículo (opcional)</Label>
                    <Input className="rounded-xl" value={guestListForm.vehicle_plate} onChange={(e) => setGuestListForm({ ...guestListForm, vehicle_plate: e.target.value })} />
                  </div>
                </div>
                <div className="flex space-x-2 px-6 py-4 border-t border-border/50 shrink-0">
                  <Button type="submit" className="flex-1 rounded-xl">Enviar Lista à Portaria</Button>
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => { setGuestListOpen(false); setGuests([{ name: '', document: '' }]); setGuestListForm({ title: '', authorized_date: '', vehicle_plate: '' }); }}>Cancelar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Single Authorization Button */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5 flex-1 sm:flex-initial">
                <Plus className="h-4 w-4 shrink-0" />Nova
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl w-[95vw] max-w-lg" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
              <DialogHeader><DialogTitle>Autorizar Visitante</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do visitante *</Label>
                  <Input className="rounded-xl" value={form.visitor_name} onChange={(e) => setForm({ ...form, visitor_name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Documento</Label>
                  <Input className="rounded-xl" value={form.visitor_document} onChange={(e) => setForm({ ...form, visitor_document: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Data autorizada *</Label>
                    <Input className="rounded-xl" type="date" value={form.authorized_date} onChange={(e) => setForm({ ...form, authorized_date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Válido até</Label>
                    <Input className="rounded-xl" type="date" value={form.authorized_until} onChange={(e) => setForm({ ...form, authorized_until: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Textarea className="rounded-xl" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Placa do veículo</Label>
                  <Input className="rounded-xl" value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" className="flex-1 rounded-xl">Enviar à Portaria</Button>
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => { setOpen(false); setForm({ visitor_name: '', visitor_document: '', authorized_date: '', authorized_until: '', purpose: '', vehicle_plate: '' }); }}>Cancelar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {auths.length === 0 ? (
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhuma autorização registrada</p>
        </div>
      ) : (
        (() => {
          const totalPages = Math.ceil(auths.length / PAGE_SIZE);
          const paginated = auths.slice((authPage - 1) * PAGE_SIZE, authPage * PAGE_SIZE);
          return (
            <div className="space-y-3">
              {paginated.map((a) => {
                const cfg = statusConfig[a.status || 'pending'];
                return (
                  <div
                    key={a.id}
                    className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-4 transition-all cursor-pointer hover:border-primary/30 active:scale-[0.98]"
                    onClick={() => setDetailAuth(a)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2.5 rounded-xl flex-shrink-0", cfg.color.split(' ')[0])}>
                        <Shield className={cn("h-5 w-5", cfg.color.split(' ').slice(1).join(' '))} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground truncate">{a.visitor_name}</p>
                          <Badge variant={cfg.variant} className={cn("text-xs shrink-0", cfg.color, "hover:" + cfg.color.split(' ')[0])}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>{format(new Date(a.authorized_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          {a.authorized_until && (
                            <span>até {format(new Date(a.authorized_until), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          )}
                        </div>
                        {a.purpose && <p className="text-xs text-muted-foreground mt-1.5 truncate">{a.purpose}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <ResidentPagination currentPage={authPage} totalPages={totalPages} onPageChange={setAuthPage} />
            </div>
          );
        })()
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailAuth} onOpenChange={(o) => { if (!o) setDetailAuth(null); }}>
        <DialogContent className="rounded-2xl w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Detalhes da Autorização
            </DialogTitle>
          </DialogHeader>
          {detailAuth && (() => {
            const cfg = statusConfig[detailAuth.status || 'pending'];
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={cfg.variant} className={cn("text-sm", cfg.color)}>
                    {cfg.label}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Visitante</p>
                      <p className="font-medium text-foreground">{detailAuth.visitor_name}</p>
                    </div>
                  </div>

                  {detailAuth.visitor_document && (
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Documento</p>
                        <p className="text-sm text-foreground">{detailAuth.visitor_document}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Data autorizada</p>
                      <p className="text-sm text-foreground">
                        {format(new Date(detailAuth.authorized_date), 'dd/MM/yyyy', { locale: ptBR })}
                        {detailAuth.authorized_until && ` até ${format(new Date(detailAuth.authorized_until), 'dd/MM/yyyy', { locale: ptBR })}`}
                      </p>
                    </div>
                  </div>

                  {detailAuth.vehicle_plate && (
                    <div className="flex items-center gap-2.5">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Veículo</p>
                        <p className="text-sm text-foreground">{detailAuth.vehicle_plate}</p>
                      </div>
                    </div>
                  )}

                  {detailAuth.purpose && (
                    <div className="flex items-start gap-2.5">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Motivo / Título</p>
                        <p className="text-sm text-foreground">{detailAuth.purpose}</p>
                      </div>
                    </div>
                  )}

                  {detailAuth.staff_notes && (
                    <div className="bg-muted/50 rounded-xl px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Observação da portaria</p>
                          <p className="text-sm text-foreground">{detailAuth.staff_notes}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {detailAuth.status === 'pending' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full rounded-xl gap-1.5">
                        <Trash2 className="h-4 w-4" /> Excluir Autorização
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir autorização?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A autorização de <strong>{detailAuth.visitor_name}</strong> será removida permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(detailAuth.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <Button variant="secondary" className="w-full rounded-xl" onClick={() => setDetailAuth(null)}>
                  Fechar
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResidentAuthorizations;
