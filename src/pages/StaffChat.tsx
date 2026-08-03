import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sendPushToUser } from '@/lib/push-subscription';
import { playNotificationSound } from '@/lib/notification-sound';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Send, MessageSquare, ArrowLeft, Plus, Search, CheckCheck, Check } from 'lucide-react';
import StandardPagination from '@/components/StandardPagination';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatThread {
  resident_id: string;
  resident_name: string;
  apartment: string;
  unread_count: number;
  last_message: string;
  last_time: string;
}

interface ChatMsg {
  id: string;
  sender_type: string;
  message: string;
  created_at: string;
  read: boolean;
}

interface ResidentOption {
  id: string;
  name: string;
  apartment: string;
}

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

const StaffChat = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [allResidents, setAllResidents] = useState<ResidentOption[]>([]);
  const [residentSearch, setResidentSearch] = useState('');
  const [threadPage, setThreadPage] = useState(1);
  const THREAD_PAGE_SIZE = 10;
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    const { data: chatResidents } = await supabase
      .from('chat_messages')
      .select('resident_id')
      .order('created_at', { ascending: false });

    if (!chatResidents) return;

    const uniqueIds = [...new Set(chatResidents.map((c: any) => String(c.resident_id)).filter(Boolean))];
    if (uniqueIds.length === 0) { setThreads([]); return; }

    const threadList: ChatThread[] = [];
    for (const rid of uniqueIds) {
      const { data: res } = await supabase
        .from('residents')
        .select('name, apartment')
        .eq('id', rid)
        .maybeSingle();
      const residentData = res as { name?: string; apartment?: string } | null;
      if (!residentData) continue;

      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('resident_id', rid)
        .eq('sender_type', 'resident')
        .eq('read', false);

      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('message, created_at')
        .eq('resident_id', rid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMessageData = lastMsg as { message?: string; created_at?: string } | null;

      threadList.push({
        resident_id: String(rid),
        resident_name: String(residentData.name || ''),
        apartment: String(residentData.apartment || ''),
        unread_count: count || 0,
        last_message: String(lastMessageData?.message || ''),
        last_time: String(lastMessageData?.created_at || ''),
      });
    }

    setThreads(threadList);
  };

  const loadMessages = async (rid: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender_type, message, created_at, read')
      .eq('resident_id', rid)
      .order('created_at', { ascending: true });
    setMessages((data as any) || []);

    await supabase
      .from('chat_messages')
      .update({ read: true })
      .eq('resident_id', rid)
      .eq('sender_type', 'resident')
      .eq('read', false);
  };

  const loadResidents = async () => {
    const { data } = await supabase
      .from('residents')
      .select('id, name, apartment')
      .order('name');
    if (data) setAllResidents(data as ResidentOption[]);
  };

  useEffect(() => { loadThreads(); }, []);

  // Global listener: play sound when any resident sends a message (even if not viewing that thread)
  useEffect(() => {
    const channel = supabase
      .channel('staff-chat-global-sound')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload: any) => {
        const msg = payload.new as any;
        if (msg.sender_type === 'resident') {
          playNotificationSound();
          if (!selectedThread) loadThreads();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedThread]);

  useEffect(() => {
    if (!selectedThread) return;
    loadMessages(selectedThread.resident_id);

    const channel = supabase
      .channel(`staff-chat-${selectedThread.resident_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `resident_id=eq.${selectedThread.resident_id}`,
      }, (payload: any) => {
        setMessages(prev => [...prev, payload.new as ChatMsg]);
        if ((payload.new as ChatMsg).sender_type === 'resident') {
          supabase.from('chat_messages').update({ read: true }).eq('id', (payload.new as ChatMsg).id);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedThread || !user) return;
    const msg = newMsg.trim();
    setNewMsg('');
    await supabase.from('chat_messages').insert({
      resident_id: selectedThread.resident_id,
      sender_id: user.id,
      sender_type: 'staff',
      message: msg,
    } as any);

    const { data: res } = await (supabase.from('residents').select('auth_user_id') as any)
      .eq('id', selectedThread.resident_id)
      .maybeSingle();
    if (res?.auth_user_id) {
      await supabase.from('notifications').insert({
        user_id: res.auth_user_id,
        title: 'Nova mensagem da portaria',
        body: msg.substring(0, 100),
        type: 'chat',
        related_id: selectedThread.resident_id,
      });
      sendPushToUser(res.auth_user_id, 'Nova mensagem da portaria', msg.substring(0, 100), 'chat');
    }
  };

  const startNewChat = (resident: ResidentOption) => {
    const existingThread = threads.find(t => t.resident_id === resident.id);
    if (existingThread) {
      setSelectedThread(existingThread);
    } else {
      setSelectedThread({
        resident_id: resident.id,
        resident_name: resident.name,
        apartment: resident.apartment,
        unread_count: 0,
        last_message: '',
        last_time: '',
      });
    }
    setShowNewChatDialog(false);
    setResidentSearch('');
  };

  const filteredResidents = allResidents.filter(r =>
    r.name.toLowerCase().includes(residentSearch.toLowerCase()) ||
    r.apartment.toLowerCase().includes(residentSearch.toLowerCase())
  );

  // Thread list view
  if (!selectedThread) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Chat com Moradores</h2>
          <Button onClick={() => { loadResidents(); setShowNewChatDialog(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Conversa
          </Button>
        </div>
        {threads.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhuma conversa iniciada. Clique em "Nova Conversa" para enviar uma mensagem a um morador.</CardContent></Card>
        ) : (
          <>
            {(() => {
              const totalPages = Math.ceil(threads.length / THREAD_PAGE_SIZE);
              const paginated = threads.slice((threadPage - 1) * THREAD_PAGE_SIZE, threadPage * THREAD_PAGE_SIZE);
              return (
                <>
                  {paginated.map((t) => (
                    <Card key={t.resident_id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedThread(t)}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-lg font-bold text-primary">{t.resident_name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{t.resident_name}</p>
                            {t.last_time && (
                              <p className="text-xs text-muted-foreground shrink-0">
                                {isToday(new Date(t.last_time))
                                  ? format(new Date(t.last_time), 'HH:mm', { locale: ptBR })
                                  : format(new Date(t.last_time), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Apto {t.apartment}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-sm text-muted-foreground truncate">{t.last_message}</p>
                            {t.unread_count > 0 && (
                              <Badge className="ml-2 bg-primary text-primary-foreground rounded-full h-5 min-w-5 flex items-center justify-center text-xs shrink-0">
                                {t.unread_count}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <StandardPagination currentPage={threadPage} totalPages={totalPages} onPageChange={setThreadPage} />
                </>
              );
            })()}
          </>
        )}

        <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Selecionar Morador</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar morador ou apartamento..."
                  value={residentSearch}
                  onChange={e => setResidentSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredResidents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhum morador encontrado</p>
                ) : (
                  filteredResidents.map(r => (
                    <button
                      key={r.id}
                      onClick={() => startNewChat(r)}
                      className="w-full text-left px-4 py-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-muted-foreground">Apto {r.apartment}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Chat view - WhatsApp style
  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border mb-2">
        <Button variant="ghost" size="icon" onClick={() => { setSelectedThread(null); loadThreads(); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-base font-bold text-primary">{selectedThread.resident_name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h2 className="text-base font-bold leading-tight">{selectedThread.resident_name}</h2>
          <p className="text-xs text-muted-foreground">Apto {selectedThread.apartment}</p>
        </div>
      </div>

      {/* Messages area - WhatsApp wallpaper style */}
      <div className="flex-1 overflow-hidden rounded-xl bg-muted/30 dark:bg-muted/10">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Envie a primeira mensagem para {selectedThread.resident_name}</p>
          )}
          {messages.map((m, idx) => {
            const msgDate = new Date(m.created_at);
            const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;
            const showDateSeparator = !prevDate || !isSameDay(msgDate, prevDate);
            const isStaff = m.sender_type === 'staff';

            return (
              <div key={m.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="bg-muted/80 dark:bg-muted/60 text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
                      {formatDateLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={cn('flex mb-1.5', isStaff ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'relative max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm',
                    isStaff
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-card text-card-foreground rounded-tl-none border border-border/50'
                  )}>
                    {!isStaff && (
                      <p className="text-xs font-semibold text-primary mb-0.5">{selectedThread.resident_name}</p>
                    )}
                    <p className="text-sm leading-relaxed pr-14">{m.message}</p>
                    <span className={cn(
                      'absolute bottom-1 right-2 flex items-center gap-0.5 text-[10px]',
                      isStaff ? 'text-primary-foreground/60' : 'text-muted-foreground'
                    )}>
                      {format(msgDate, 'HH:mm', { locale: ptBR })}
                      {isStaff && (
                        m.read
                          ? <CheckCheck className="h-3.5 w-3.5 ml-0.5" />
                          : <Check className="h-3.5 w-3.5 ml-0.5" />
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Input area */}
      <div className="flex gap-2 mt-3">
        <Input
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          placeholder="Digite sua mensagem..."
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          className="rounded-full"
        />
        <Button size="icon" onClick={sendMessage} disabled={!newMsg.trim()} className="rounded-full shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StaffChat;
