import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, FileText, Mail, ScrollText, Settings, Smartphone, ClipboardList, MessageSquare, Shield, MailSearch, Megaphone, Sparkles, ArrowRight } from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isOpen: boolean;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Principal' },
  { id: 'residents', label: 'Moradores', icon: Users, group: 'Cadastros' },
  { id: 'new-registry', label: 'Novo Cadastro', icon: FileText, group: 'Cadastros' },
  { id: 'mail', label: 'Correspondências', icon: Mail, group: 'Cadastros' },
  { id: 'mail-logs', label: 'Log Correspondências', icon: MailSearch, group: 'Cadastros' },
  
  { id: 'staff-chat', label: 'Chat Moradores', icon: MessageSquare, group: 'Comunicação' },
  { id: 'authorizations', label: 'Autorizações', icon: Shield, group: 'Comunicação' },
  { id: 'announcements', label: 'Comunicados', icon: Megaphone, group: 'Comunicação' },
  { id: 'reports', label: 'Plantão & Ocorrências', icon: ClipboardList, group: 'Operações' },
  { id: 'devices', label: 'Dispositivos', icon: Smartphone, group: 'Sistema' },
  { id: 'logs', label: 'Logs de Acesso', icon: ScrollText, group: 'Sistema' },
  { id: 'settings', label: 'Configurações', icon: Settings, group: 'Sistema' },
];

const groups = ['Principal', 'Cadastros', 'Comunicação', 'Operações', 'Sistema'];

export const Sidebar = ({ activeSection, onSectionChange, isOpen }: SidebarProps) => {

  return (
    <aside
      className={cn(
        'fixed md:sticky top-[88px] z-20 w-80 h-[calc(100vh-88px)] bg-card shadow-card transition-transform duration-300 overflow-y-auto',
        'md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="p-6 space-y-6">
        {groups.map((group) => (
          <div key={group}>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              {group}
            </h3>
            <nav className="space-y-2">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSectionChange(item.id)}
                      className={cn(
                        'w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left font-medium transition-all',
                        'hover:translate-x-2',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-elegant translate-x-1'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="flex-1">{item.label}</span>
                    </button>
                  );
                })}
            </nav>
          </div>
        ))}
      </div>
      
      <div className="border-t border-border p-4 space-y-2 bg-muted/30">
        <a
          href="/apresentacao"
          className="group mb-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-transparent px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="flex-1 leading-tight">
            Conheça o PortalGuard
            <span className="block text-[11px] font-normal text-muted-foreground">
              Recursos e diferenciais
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </a>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">© {new Date().getFullYear()} PortalGuard</p>
          <p>Todos os direitos reservados</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <a href="#" className="hover:text-primary transition-colors">Política de Privacidade</a>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors">Termos de Uso</a>
          </div>
          <div className="pt-2 space-y-1">
            <p className="font-semibold text-foreground">Suporte:</p>
            <p>tecno.iavip@gmail.com</p>
            <p>(11) 97694-9949</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
