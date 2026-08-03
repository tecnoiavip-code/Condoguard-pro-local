import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Mail, Users, Shield, MessageSquare, Megaphone, ChevronRight, Package, Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Counts } from './ResidentLayout';

interface ResidentInfo {
  id: string;
  name: string;
  apartment: string;
}

interface PreviewMail {
  id: string;
  sender: string;
  package_type: string | null;
  received_at: string | null;
}

interface PreviewVisitor {
  id: string;
  visitor_name: string;
  entry_time: string | null;
  exit_time: string | null;
}

interface PreviewAuth {
  id: string;
  visitor_name: string;
  status: string | null;
  authorized_date: string;
}

interface PreviewMsg {
  id: string;
  message: string;
  sender_type: string;
  created_at: string;
}

interface PreviewAnnouncement {
  id: string;
  title: string;
  priority: string;
  created_at: string;
}

interface Props {
  onNavigate: (tab: string) => void;
  counts: Counts;
}

const ResidentDashboard = ({ onNavigate, counts }: Props) => {
  const { user } = useAuth();
  const [resident, setResident] = useState<ResidentInfo | null>(null);
  const [previewMails, setPreviewMails] = useState<PreviewMail[]>([]);
  const [previewVisitors, setPreviewVisitors] = useState<PreviewVisitor[]>([]);
  const [previewAuths, setPreviewAuths] = useState<PreviewAuth[]>([]);
  const [previewMsgs, setPreviewMsgs] = useState<PreviewMsg[]>([]);
  const [previewAnnouncements, setPreviewAnnouncements] = useState<PreviewAnnouncement[]>([]);

  useEffect(() => {
    if (!user) return;
    
    const load = async () => {
      const { data: res } = await (supabase
        .from('residents')
        .select('id, name, apartment') as any)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (!res) return;
      setResident(res);

      const [mailsRes, visitorsRes, authsRes, msgsRes, annsRes] = await Promise.all([
        supabase.from('mails').select('id, sender, package_type, received_at').eq('resident_id', res.id).order('received_at', { ascending: false }).limit(3),
        supabase.from('access_entries').select('id, visitor_name, entry_time, exit_time').eq('apartment', res.apartment).order('entry_time', { ascending: false }).limit(3),
        supabase.from('visitor_authorizations').select('id, visitor_name, status, authorized_date').eq('resident_id', res.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('chat_messages').select('id, message, sender_type, created_at').eq('resident_id', res.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('announcements').select('id, title, priority, created_at').order('created_at', { ascending: false }).limit(3),
      ]);

      setPreviewMails(mailsRes.data || []);
      setPreviewVisitors(visitorsRes.data || []);
      setPreviewAuths((authsRes.data as any) || []);
      setPreviewMsgs((msgsRes.data as any) || []);
      setPreviewAnnouncements((annsRes.data as any) || []);
    };

    load();
  }, [user]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const statusLabel: Record<string, string> = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', expired: 'Expirada' };

  const sections = [
    {
      id: 'mails',
      title: 'Correspondências',
      icon: Mail,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-500/20',
      cardBg: 'bg-blue-50/60 dark:bg-blue-950/20',
      badge: counts.mails,
      badgeLabel: 'pendente',
      items: previewMails.length > 0 ? [{
        primary: previewMails[0].sender,
        secondary: previewMails[0].package_type || 'Carta',
        time: previewMails[0].received_at ? format(new Date(previewMails[0].received_at), "dd/MM HH:mm", { locale: ptBR }) : '',
      }] : [],
    },
    {
      id: 'visitors',
      title: 'Visitas',
      icon: Users,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-500/20',
      cardBg: 'bg-emerald-50/60 dark:bg-emerald-950/20',
      badge: previewVisitors.filter(v => !v.exit_time).length,
      badgeLabel: 'no local',
      items: previewVisitors.length > 0 ? [{
        primary: previewVisitors[0].visitor_name,
        secondary: previewVisitors[0].exit_time ? 'Saiu' : 'No local',
        time: previewVisitors[0].entry_time ? format(new Date(previewVisitors[0].entry_time), "dd/MM HH:mm", { locale: ptBR }) : '',
        active: !previewVisitors[0].exit_time,
      }] : [],
    },
    {
      id: 'announcements',
      title: 'Comunicados',
      icon: Megaphone,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-500/20',
      cardBg: 'bg-amber-50/60 dark:bg-amber-950/20',
      badge: counts.announcements,
      badgeLabel: 'novo',
      items: previewAnnouncements.length > 0 ? [{
        primary: previewAnnouncements[0].title,
        secondary: previewAnnouncements[0].priority === 'urgent' ? '🔴 Urgente' : previewAnnouncements[0].priority === 'important' ? '🟡 Importante' : 'Normal',
        time: format(new Date(previewAnnouncements[0].created_at), "dd/MM HH:mm", { locale: ptBR }),
      }] : [],
    },
    {
      id: 'authorizations',
      title: 'Autorizações',
      icon: Shield,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
      borderColor: 'border-violet-500/20',
      cardBg: 'bg-violet-50/60 dark:bg-violet-950/20',
      badge: 0,
      badgeLabel: '',
      items: previewAuths.length > 0 ? [{
        primary: previewAuths[0].visitor_name,
        secondary: statusLabel[previewAuths[0].status || 'pending'] || previewAuths[0].status,
        time: format(new Date(previewAuths[0].authorized_date), "dd/MM/yyyy", { locale: ptBR }),
      }] : [],
    },
    {
      id: 'chat',
      title: 'Chat com Portaria',
      icon: MessageSquare,
      iconBg: 'bg-rose-500/10',
      iconColor: 'text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-500/20',
      cardBg: 'bg-rose-50/60 dark:bg-rose-950/20',
      badge: counts.chat,
      badgeLabel: 'não lida',
      items: previewMsgs.length > 0 ? [{
        primary: previewMsgs[0].sender_type === 'resident' ? 'Você' : 'Portaria',
        secondary: previewMsgs[0].message.length > 60 ? previewMsgs[0].message.substring(0, 60) + '…' : previewMsgs[0].message,
        time: format(new Date(previewMsgs[0].created_at), "HH:mm", { locale: ptBR }),
      }] : [],
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Welcome */}
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground relative overflow-hidden"
        style={{ boxShadow: 'var(--shadow-elegant)' }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
        <div className="relative z-10">
          <p className="text-base opacity-80">{greeting()}</p>
          <h2 className="text-2xl font-bold mt-1">{resident?.name || 'Morador'}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm font-medium">
              Apto {resident?.apartment}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Access Cards */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.id}
            className={cn(
              "backdrop-blur-sm border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200",
              "hover:shadow-lg active:scale-[0.98]",
              section.borderColor,
              section.cardBg
            )}
            onClick={() => onNavigate(section.id)}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <div className={cn("p-3 rounded-xl shadow-sm", section.iconBg)}>
                  <section.icon className={cn("h-7 w-7", section.iconColor)} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">{section.title}</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {section.badge > 0 && (
                  <Badge variant="destructive" className="text-xs px-2 py-0.5 h-6 rounded-full animate-pulse font-bold">
                    {section.badge} {section.badgeLabel}{section.badge > 1 ? 's' : ''}
                  </Badge>
                )}
                <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </div>

            {/* Preview Items */}
            <div className="px-4 pb-4">
              {section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum registro</p>
              ) : (
                <div className="space-y-1">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-t border-border/30 first:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {'active' in item && (item as any).active && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <span className="text-base font-semibold text-foreground truncate">{item.primary}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{item.secondary}</p>
                      </div>
                      <span className="text-xs text-muted-foreground/70 shrink-0 ml-2 font-medium">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResidentDashboard;
