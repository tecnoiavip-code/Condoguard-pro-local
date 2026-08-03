import { useState, useEffect, ReactNode } from 'react';
import { Menu, Building2, User, LogOut, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notification-sound';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isActive = true;
    let pollTimeout: ReturnType<typeof setTimeout>;
    let lastCount = 0;

    const loadNotifs = async () => {
      const { data, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(10);
      const newCount = count || 0;
      // Play sound if count increased (new notification arrived)
      if (newCount > lastCount && lastCount >= 0) {
        playNotificationSound();
      }
      lastCount = newCount;
      setNotifications(data || []);
      setNotifCount(newCount);
    };
    loadNotifs();

    const channel = supabase
      .channel('staff-header-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        playNotificationSound();
        loadNotifs();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        loadNotifs();
      })
      .subscribe();

    // Polling fallback (realtime already covers inserts/updates). Long interval to save DB quota.
    const poll = () => {
      if (!isActive) return;
      loadNotifs();
      pollTimeout = setTimeout(poll, 120000);
    };
    pollTimeout = setTimeout(poll, 120000);

    return () => {
      isActive = false;
      clearTimeout(pollTimeout);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    setNotifications([]);
    setNotifCount(0);
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  };

  const markOneRead = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setNotifCount(prev => Math.max(0, prev - 1));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-elegant sticky top-0 z-30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-white hover:bg-white/20"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <div className="flex items-center space-x-3">
                <Building2 className="h-12 w-12" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold">CondoGuard Pro</h1>
                  <p className="text-primary-foreground/80 text-sm hidden md:block">
                    Sistema Profissional de Controle de Acesso
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              
              {/* Notification Bell */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-primary-foreground hover:bg-primary-foreground/10">
                    <Bell className="h-5 w-5" />
                    {notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold animate-pulse">
                        {notifCount > 99 ? '99+' : notifCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notificações</span>
                    {notifCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline font-normal">
                        Marcar todas como lidas
                      </button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <ScrollArea className="max-h-64">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Nenhuma notificação
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3 cursor-pointer" onClick={() => markOneRead(n.id)}>
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          <p className="text-xs text-muted-foreground leading-tight">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </DropdownMenuItem>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center space-x-2 bg-primary-foreground/10 px-4 py-2 rounded-full backdrop-blur-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
                <span className="text-sm font-medium">Sistema Online</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-primary-foreground hover:bg-primary-foreground/10">
                    <User className="h-4 w-4" />
                    <span className="text-sm hidden md:inline">{user?.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex">
        {children}
      </div>
    </div>
  );
};
