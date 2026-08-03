import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Clock, MessageCircle, CheckCheck, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sendPushToStaff } from '@/lib/push-subscription';

interface ChatMsg {
  id: string;
  sender_type: string;
  message: string;
  created_at: string;
  read: boolean;
}

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

const ResidentChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [residentId, setResidentId] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
      .eq('sender_type', 'staff')
      .eq('read', false);
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
      await loadMessages(res.id);
      setLoading(false);
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!residentId) return;
    const channel = supabase
      .channel(`chat-${residentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `resident_id=eq.${residentId}`,
      }, (payload: any) => {
        setMessages((prev) => [...prev, payload.new as ChatMsg]);
        if ((payload.new as ChatMsg).sender_type === 'staff') {
          supabase.from('chat_messages').update({ read: true }).eq('id', (payload.new as ChatMsg).id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [residentId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !residentId || !user) return;
    const msg = newMsg.trim();
    setNewMsg('');
    await supabase.from('chat_messages').insert({
      resident_id: residentId,
      sender_id: user.id,
      sender_type: 'resident',
      message: msg,
    } as any);

    sendPushToStaff('Nova mensagem de morador', msg.substring(0, 100), `chat-${residentId}`);
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Clock className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground leading-tight">Chat</h2>
          <p className="text-xs text-muted-foreground">Fale diretamente com a portaria</p>
        </div>
      </div>
      
      {/* Messages area */}
      <div className="flex-1 overflow-hidden rounded-2xl bg-muted/30 dark:bg-muted/10">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Envie uma mensagem para a portaria</p>
            </div>
          )}
          {messages.map((m, idx) => {
            const msgDate = new Date(m.created_at);
            const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;
            const showDateSeparator = !prevDate || !isSameDay(msgDate, prevDate);
            const isResident = m.sender_type === 'resident';

            return (
              <div key={m.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="bg-muted/80 dark:bg-muted/60 text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
                      {formatDateLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={cn('flex mb-1.5', isResident ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'relative max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm',
                    isResident
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-card text-card-foreground rounded-tl-none border border-border/50'
                  )}>
                    {!isResident && (
                      <p className="text-xs font-semibold text-primary mb-0.5">Portaria</p>
                    )}
                    <p className="text-sm leading-relaxed pr-14">{m.message}</p>
                    <span className={cn(
                      'absolute bottom-1 right-2 flex items-center gap-0.5 text-[10px]',
                      isResident ? 'text-primary-foreground/60' : 'text-muted-foreground'
                    )}>
                      {format(msgDate, 'HH:mm', { locale: ptBR })}
                      {isResident && (
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

export default ResidentChat;
