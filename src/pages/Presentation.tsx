import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Car,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  DatabaseBackup,
  Fingerprint,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Minus,
  Package,
  Phone,
  ScanFace,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Reveal } from '@/components/presentation/Reveal';
import {
  DashboardMockup,
  FaceDeviceMockup,
  FloatingCard,
  MailMockup,
  OpsMockup,
  PhoneMockup,
  SecurityMockup,
} from '@/components/presentation/Mockups';
import '@/components/presentation/presentation.css';

const SUPPORT_EMAIL = 'tecno.iavip@gmail.com';
const SUPPORT_PHONE_DISPLAY = '(11) 97694-9949';
const SUPPORT_WHATSAPP = `https://wa.me/5511976949949?text=${encodeURIComponent(
  'Olá! Quero conhecer o PortalGuard e agendar uma demonstração.'
)}`;

const Brand = ({ className }: { className?: string }) => (
  <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
    <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/30">
      <ShieldCheck className="h-5 w-5 text-white" />
      <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
    </span>
    <span className="text-[17px] font-bold tracking-tight text-white">
      Portal<span className="text-sky-400">Guard</span>
    </span>
  </span>
);

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
    {children}
  </span>
);

const SectionHeading = ({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  align?: 'center' | 'left';
}) => (
  <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
      {title}
    </h2>
    {description && <p className="mt-4 text-base leading-relaxed text-slate-400">{description}</p>}
  </div>
);

const FeatureCard = ({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) => (
  <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:bg-white/[0.05]">
    <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-400/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0" />
    <span className="grid h-11 w-11 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
      <Icon className="h-5 w-5" />
    </span>
    <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
  </div>
);

const Bullet = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-400/10 text-sky-300">
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
    <span className="text-sm leading-relaxed text-slate-300">{children}</span>
  </li>
);

const DeepDive = ({
  id,
  eyebrow,
  title,
  description,
  bullets,
  mockup,
  reverse = false,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  mockup: ReactNode;
  reverse?: boolean;
}) => (
  <section id={id} className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={reverse ? 'lg:order-2' : undefined}>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">{description}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((bullet) => (
              <Bullet key={bullet}>{bullet}</Bullet>
            ))}
          </ul>
        </div>
      </Reveal>
      <Reveal delay={120} className={reverse ? 'lg:order-1' : undefined}>
        {mockup}
      </Reveal>
    </div>
  </section>
);

const features = [
  {
    icon: ScanFace,
    title: 'Reconhecimento facial',
    description: 'Identificação em tempo real nos leitores Control iD, com liberação automática do relé.',
  },
  {
    icon: Car,
    title: 'TAG veicular',
    description: 'Abertura para veículos cadastrados, com histórico por morador e por unidade.',
  },
  {
    icon: CreditCard,
    title: 'Cartão e PIN',
    description: 'Credenciais físicas continuam válidas, integradas ao mesmo cadastro do morador.',
  },
  {
    icon: Package,
    title: 'Encomendas com foto',
    description: 'Registro fotográfico no recebimento e comprovante de retirada, sem caderno.',
  },
  {
    icon: Bell,
    title: 'WhatsApp e push',
    description: 'Aviso de encomenda com foto, sem digitação e sem depender de grupo de mensagens.',
  },
  {
    icon: ShieldCheck,
    title: 'Autorizações',
    description: 'Visitantes, prestadores e entregadores autorizados pelo próprio morador, com validade.',
  },
  {
    icon: Smartphone,
    title: 'Portal do morador',
    description: 'Cada morador acompanha encomendas, autorizações e comunicados no celular.',
  },
  {
    icon: MessagesSquare,
    title: 'Chat portaria ↔ morador',
    description: 'Canal direto e registrado, sem expor o telefone pessoal da equipe.',
  },
  {
    icon: Megaphone,
    title: 'Comunicados',
    description: 'Avisos segmentados por bloco, torre ou condomínio inteiro, com confirmação de leitura.',
  },
  {
    icon: ClipboardList,
    title: 'Plantão e ocorrências',
    description: 'Livro digital de ocorrências com evidências e passagem de turno registrada.',
  },
  {
    icon: BarChart3,
    title: 'Logs e relatórios',
    description: 'Quem entrou, quando, por qual dispositivo e com qual resultado. Exportável.',
  },
  {
    icon: DatabaseBackup,
    title: 'Backup e restauração',
    description: 'Exportação completa dos dados, com restauração assistida e sem retrabalho.',
  },
];

const comparisonRows: Array<{
  label: string;
  portalguard: 'yes' | 'partial' | 'no';
  apps: 'yes' | 'partial' | 'no';
  sheets: 'yes' | 'partial' | 'no';
}> = [
  { label: 'Funciona sem internet', portalguard: 'yes', apps: 'no', sheets: 'partial' },
  { label: 'Reconhecimento facial integrado', portalguard: 'yes', apps: 'partial', sheets: 'no' },
  { label: 'TAG veicular no mesmo cadastro', portalguard: 'yes', apps: 'partial', sheets: 'no' },
  { label: 'Encomendas com foto e aviso automático', portalguard: 'yes', apps: 'partial', sheets: 'no' },
  { label: 'Portal do morador com login próprio', portalguard: 'yes', apps: 'yes', sheets: 'no' },
  { label: 'Auditoria completa de acessos', portalguard: 'yes', apps: 'partial', sheets: 'no' },
  { label: 'Dados sob controle do condomínio', portalguard: 'yes', apps: 'no', sheets: 'yes' },
  { label: 'Implantação e suporte em português', portalguard: 'yes', apps: 'partial', sheets: 'no' },
];

const ComparisonValue = ({ value }: { value: 'yes' | 'partial' | 'no' }) => {
  if (value === 'yes') {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-300">
        <CheckCircle2 className="h-4 w-4" /> Sim
      </span>
    );
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-300">
        <Minus className="h-4 w-4" /> Parcial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500">
      <X className="h-4 w-4" /> Não
    </span>
  );
};

const steps = [
  {
    title: 'Diagnóstico',
    description: 'Entendemos a operação, os dispositivos instalados e o fluxo de encomendas da portaria.',
  },
  {
    title: 'Configuração',
    description: 'Cadastro do condomínio, moradores, unidades, dispositivos e permissões de acesso.',
  },
  {
    title: 'Treinamento',
    description: 'Equipe treinada no fluxo real, com simulações de acesso, encomenda e ocorrência.',
  },
  {
    title: 'Operação assistida',
    description: 'Acompanhamento nos primeiros dias, ajustes finos e suporte contínuo em português.',
  },
];

const faqs = [
  {
    q: 'Preciso de internet para o controle de acesso funcionar?',
    a: 'Não. O motor de reconhecimento facial roda no servidor local do condomínio. A nuvem é usada para portal do morador, notificações, relatórios e sincronização. Se a conexão cair, a portaria continua operando.',
  },
  {
    q: 'Quais dispositivos são compatíveis?',
    a: 'A integração é nativa com os equipamentos Control iD usados para reconhecimento facial, TAG veicular e cartão. A arquitetura também permite evoluir para novos modelos e fabricantes.',
  },
  {
    q: 'Onde ficam os dados do condomínio?',
    a: 'Você escolhe: no seu próprio servidor local ou em um projeto em nuvem dedicado. Em ambos os casos, o acesso é validado no servidor, controlado por papel e registrado para auditoria.',
  },
  {
    q: 'Quanto tempo leva a implantação?',
    a: 'Depende do tamanho do condomínio e da quantidade de dispositivos. O fluxo típico é configurar em poucos dias e operar com acompanhamento na primeira semana.',
  },
  {
    q: 'Existe aplicativo para o morador?',
    a: 'Sim. O morador acessa um portal web responsivo com login próprio, direto do celular, para ver encomendas, autorizar visitantes, conversar com a portaria e receber comunicados.',
  },
  {
    q: 'Dá para importar os cadastros que já temos?',
    a: 'Sim. A implantação inclui importação assistida de moradores, unidades, veículos e TAGs, reduzindo o retrabalho da equipe.',
  },
  {
    q: 'O sistema substitui a portaria física?',
    a: 'Não. Ele dá à equipe uma operação digital e auditável. A decisão continua humana, mas com informação em tempo real e registro de cada evento.',
  },
  {
    q: 'Como funciona o suporte?',
    a: 'Suporte em português por e-mail e WhatsApp, com acompanhamento na implantação e orientação para a equipe da portaria.',
  },
];

const marqueeItems = [
  { icon: ScanFace, label: 'Reconhecimento facial' },
  { icon: Car, label: 'TAG veicular' },
  { icon: CreditCard, label: 'Cartão e PIN' },
  { icon: Package, label: 'Encomendas com foto' },
  { icon: MessageSquare, label: 'Portal do morador' },
  { icon: WifiOff, label: 'Operação offline' },
  { icon: ShieldCheck, label: 'Auditoria completa' },
  { icon: Server, label: 'Servidor local' },
  { icon: Lock, label: 'Adequação à LGPD' },
  { icon: Fingerprint, label: 'Biometria' },
];

const Presentation = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'PortalGuard — Sistema completo de portaria e controle de acesso';

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content ?? '';
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content =
      'Reconhecimento facial, TAG veicular, encomendas com foto, autorizações e portal do morador em uma única plataforma. Funciona offline e com auditoria completa.';

    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    window.scrollTo(0, 0);

    return () => {
      document.title = previousTitle;
      if (meta) meta.content = previousDescription;
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#05080f] text-slate-100 antialiased">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/10 bg-[#05080f]/85 backdrop-blur-xl'
            : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#top" aria-label="PortalGuard — início">
            <Brand />
          </a>

          <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#recursos" className="transition-colors hover:text-white">Recursos</a>
            <a href="#acesso" className="transition-colors hover:text-white">Controle de acesso</a>
            <a href="#diferenciais" className="transition-colors hover:text-white">Diferenciais</a>
            <a href="#como-funciona" className="transition-colors hover:text-white">Implantação</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white sm:inline-flex"
            >
              Falar com especialista
            </a>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-transform hover:-translate-y-0.5"
            >
              Acessar sistema <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden pt-28 sm:pt-32">
          <div className="pointer-events-none absolute inset-0 pg-grid pg-mask-fade opacity-60" />
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-[110px] pg-blob" />
          <div className="pointer-events-none absolute -right-16 top-40 h-80 w-80 rounded-full bg-indigo-500/20 blur-[120px] pg-blob" style={{ animationDelay: '-6s' }} />

          <div className="relative mx-auto max-w-7xl px-5 pb-16 lg:px-8 lg:pb-24">
            <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-10">
              <div className="pg-enter">
                <Eyebrow>
                  <Sparkles className="h-3 w-3" /> Motor facial dentro do condomínio
                </Eyebrow>
                <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl xl:text-6xl">
                  A portaria do seu condomínio,{' '}
                  <span className="bg-gradient-to-r from-sky-300 via-sky-400 to-blue-500 bg-clip-text text-transparent pg-shine">
                    finalmente no controle.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                  Reconhecimento facial, TAG veicular, encomendas com foto, autorizações, chat com
                  moradores e auditoria completa — em uma única plataforma que continua funcionando
                  mesmo sem internet.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-500/25 transition-transform hover:-translate-y-0.5"
                  >
                    Acessar o sistema <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:text-white"
                  >
                    <Phone className="h-4 w-4" /> Agendar demonstração
                  </a>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" /> Control iD integrado
                  </span>
                  <span className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-sky-400" /> Funciona offline
                  </span>
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-indigo-400" /> Dados auditáveis
                  </span>
                </div>
              </div>

              <div className="relative pg-enter" style={{ animationDelay: '120ms' }}>
                <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-sky-500/20 via-transparent to-indigo-500/20 blur-2xl" />
                <DashboardMockup className="relative pg-float" />
                <FloatingCard className="absolute -right-3 -bottom-6 hidden w-44 sm:block">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-400/10 text-sky-300">
                      <Package className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[9px] text-slate-500">Encomenda</p>
                      <p className="text-[11px] font-semibold text-white">notificada com foto</p>
                    </div>
                  </div>
                </FloatingCard>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.02] py-5">
          <div className="pg-mask-x overflow-hidden">
            <div className="pg-marquee flex w-max items-center gap-3">
              {[...marqueeItems, ...marqueeItems].map((item, index) => (
                <span
                  key={`${item.label}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-300"
                >
                  <item.icon className="h-4 w-4 text-sky-400" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <Reveal>
            <SectionHeading
              eyebrow="O dia a dia"
              title="A portaria ainda depende de três planilhas e um grupo de WhatsApp?"
              description="Quando a informação fica espalhada, o morador cobra, a equipe se desdobra e o histórico desaparece. O PortalGuard junta tudo em um fluxo só."
            />
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-red-400/15 bg-red-500/[0.04] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
                  Sem o PortalGuard
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    'Encomenda anotada no caderno, sem foto e sem comprovante de retirada.',
                    'Acesso liberado no “confia” e sem registro de quem entrou ou negou.',
                    'Morador descobre a encomenda dias depois, quando passa na portaria.',
                    'Ocorrência do turno anterior se perde na troca de equipe.',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-slate-300">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-400/10 text-red-300">
                        <X className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Com o PortalGuard
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    'Encomenda registrada com foto, aviso automático e comprovante de retirada.',
                    'Cada acesso validado no servidor, com resultado e dispositivo registrados.',
                    'Morador acompanha tudo pelo portal, no celular, em tempo real.',
                    'Ocorrências e passagem de turno ficam documentadas e pesquisáveis.',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-slate-300">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="recursos" className="relative border-y border-white/10 bg-white/[0.015] py-16 lg:py-24">
          <div className="pointer-events-none absolute inset-0 pg-grid pg-mask-fade opacity-40" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal>
              <SectionHeading
                eyebrow="Recursos"
                title="Tudo o que a portaria precisa, em um só lugar"
                description="Do reconhecimento facial ao comprovante de retirada: recursos pensados para a rotina real de quem trabalha na portaria."
              />
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <Reveal key={feature.title} delay={(index % 3) * 80}>
                  <FeatureCard {...feature} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <DeepDive
          id="acesso"
          eyebrow="Controle de acesso"
          title="Acesso que continua funcionando sem internet"
          description="O motor de reconhecimento facial roda no servidor do condomínio. A decisão de acesso é registrada no banco e o relé só é acionado quando a credencial é válida."
          bullets={[
            'Integração nativa com Control iD para facial, TAG veicular e cartão.',
            'Reconhecimento e acionamento do relé funcionando de forma local.',
            'Dispositivo desativado não libera acesso — nem por facial, nem por TAG.',
            'Cada tentativa gera log com resultado, dispositivo e horário.',
          ]}
          mockup={<FaceDeviceMockup />}
        />

        <DeepDive
          eyebrow="Encomendas"
          title="Menos fila, zero extravio"
          description="Registre a encomenda com foto em segundos. O morador é avisado automaticamente e a retirada fica comprovada — sem caderno e sem discussão."
          bullets={[
            'Foto no recebimento e na retirada, com histórico por morador.',
            'Notificação automática com a foto da encomenda.',
            'Status em tempo real: aguardando, notificada e retirada.',
            'Log de correspondências para conferência e auditoria.',
          ]}
          mockup={<MailMockup />}
          reverse
        />

        <DeepDive
          eyebrow="Morador conectado"
          title="O morador participa — sem depender da portaria"
          description="Cada morador tem seu próprio acesso para autorizar visitantes, acompanhar encomendas e falar com a portaria. A equipe ganha tempo e o morador ganha autonomia."
          bullets={[
            'Portal do morador responsivo, com login próprio e seguro.',
            'Autorização de visitantes e prestadores com antecedência e validade.',
            'Chat direto com a portaria, com histórico registrado.',
            'Comunicados e avisos segmentados por bloco ou condomínio.',
          ]}
          mockup={<PhoneMockup />}
        />

        <DeepDive
          eyebrow="Operação"
          title="Plantão, ocorrências e auditoria em um só lugar"
          description="A troca de turno deixa de ser oral. Ocorrências ficam documentadas, os acessos são auditáveis e a gestão tem relatórios prontos para reuniões e assembleias."
          bullets={[
            'Livro de ocorrências com evidências e responsáveis.',
            'Passagem de turno com checklist e registro.',
            'Logs filtráveis por pessoa, dispositivo, tipo e resultado.',
            'Relatórios e exportação para a administração do condomínio.',
          ]}
          mockup={<OpsMockup />}
          reverse
        />

        <section id="seguranca" className="relative overflow-hidden border-y border-white/10 bg-gradient-to-b from-sky-500/[0.07] via-transparent to-transparent py-16 lg:py-24">
          <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-sky-500/15 blur-[100px] pg-blob" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <div>
                  <Eyebrow>Segurança e LGPD</Eyebrow>
                  <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                    Segurança de verdade, não promessa de marketing
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-slate-400">
                    O acesso é validado no servidor e negado por padrão. Nada de atalho no
                    navegador, nada de permissão implícita. Você escolhe onde os dados ficam e
                    acompanha cada decisão.
                  </p>
                  <ul className="mt-6 space-y-3">
                    <Bullet>Permissões validadas no servidor, por papel, com negação por padrão.</Bullet>
                    <Bullet>Registro de cada decisão de acesso: liberado, negado e por quê.</Bullet>
                    <Bullet>Dados no seu servidor local ou em nuvem dedicada do condomínio.</Bullet>
                    <Bullet>Backup completo e restauração assistida, sem dependência de terceiros.</Bullet>
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <SecurityMockup />
              </Reveal>
            </div>
          </div>
        </section>

        <section id="diferenciais" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <Reveal>
            <SectionHeading
              eyebrow="Diferenciais"
              title="Por que o PortalGuard sai na frente"
              description="Uma comparação honesta com o que existe hoje no mercado: aplicativos genéricos de condomínio e controles manuais em planilha."
            />
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Recurso</th>
                    <th className="px-5 py-4 font-semibold text-sky-300">PortalGuard</th>
                    <th className="px-5 py-4 font-semibold">Apps comuns</th>
                    <th className="px-5 py-4 font-semibold">Planilhas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-slate-200">{row.label}</td>
                      <td className="px-5 py-3.5"><ComparisonValue value={row.portalguard} /></td>
                      <td className="px-5 py-3.5"><ComparisonValue value={row.apps} /></td>
                      <td className="px-5 py-3.5"><ComparisonValue value={row.sheets} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        <section id="como-funciona" className="border-y border-white/10 bg-white/[0.015] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal>
              <SectionHeading
                eyebrow="Implantação"
                title="Do primeiro contato à portaria operando"
                description="Um processo acompanhado, sem parar a operação do condomínio."
              />
            </Reveal>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <Reveal key={step.title} delay={index * 80}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-24">
          <Reveal>
            <SectionHeading
              eyebrow="Perguntas frequentes"
              title="O que costumam perguntar antes de começar"
            />
          </Reveal>

          <Reveal delay={120}>
            <Accordion
              type="single"
              collapsible
              className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] px-5"
            >
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`item-${index}`} className="border-white/10">
                  <AccordionTrigger className="text-left text-sm font-medium text-slate-100 hover:text-white hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-slate-400">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </section>

        <section id="contato" className="mx-auto max-w-7xl px-5 pb-16 lg:px-8 lg:pb-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/15 via-blue-600/10 to-transparent p-8 sm:p-12">
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sky-400/20 blur-[90px] pg-blob" />
              <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
                <div>
                  <Eyebrow>Vamos conversar</Eyebrow>
                  <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                    Veja o PortalGuard funcionando na sua portaria
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300">
                    Agende uma demonstração, tire dúvidas sobre os dispositivos que você já tem e
                    entenda o melhor caminho de implantação para o seu condomínio.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 transition-colors hover:text-white">
                      <Mail className="h-4 w-4 text-sky-300" /> {SUPPORT_EMAIL}
                    </a>
                    <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-white">
                      <Phone className="h-4 w-4 text-sky-300" /> {SUPPORT_PHONE_DISPLAY}
                    </a>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-500/25 transition-transform hover:-translate-y-0.5"
                  >
                    Agendar demonstração <ArrowRight className="h-4 w-4" />
                  </a>
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-white/35"
                  >
                    Já sou cliente: acessar
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#04070d]">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Brand />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
                Gestão de portaria e controle de acesso para condomínios que querem operar com
                segurança, rastreabilidade e menos trabalho manual.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Produto</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li><a href="#recursos" className="transition-colors hover:text-sky-300">Recursos</a></li>
                <li><a href="#acesso" className="transition-colors hover:text-sky-300">Controle de acesso</a></li>
                <li><a href="#diferenciais" className="transition-colors hover:text-sky-300">Diferenciais</a></li>
                <li><a href="#como-funciona" className="transition-colors hover:text-sky-300">Implantação</a></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Suporte</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li><a href="#faq" className="transition-colors hover:text-sky-300">Perguntas frequentes</a></li>
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-sky-300">{SUPPORT_EMAIL}</a></li>
                <li><a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="transition-colors hover:text-sky-300">{SUPPORT_PHONE_DISPLAY}</a></li>
                <li><Link to="/" className="transition-colors hover:text-sky-300">Acessar o sistema</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Confiança</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Auditoria completa</li>
                <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-sky-400" /> Adequação à LGPD</li>
                <li className="flex items-center gap-2"><Server className="h-4 w-4 text-indigo-400" /> Dados sob seu controle</li>
                <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" /> Suporte em português</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} PortalGuard. Todos os direitos reservados.</p>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Feito para condomínios</span>
              <a href="#seguranca" className="transition-colors hover:text-slate-400">Segurança e LGPD</a>
              <a href="#contato" className="transition-colors hover:text-slate-400">Contato</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Presentation;
