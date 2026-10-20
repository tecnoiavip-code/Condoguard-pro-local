import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  Fingerprint,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Package,
  QrCode,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MockupFrame = ({
  children,
  label,
  className,
  tone = 'dark',
}: {
  children: ReactNode;
  label: string;
  className?: string;
  tone?: 'dark' | 'light';
}) => (
  <div
    aria-hidden="true"
    className={cn(
      'relative overflow-hidden rounded-2xl border shadow-2xl shadow-black/40',
      tone === 'dark'
        ? 'border-white/10 bg-[#0b1220] text-slate-100'
        : 'border-slate-200 bg-white text-slate-900 shadow-slate-900/10',
      className
    )}
  >
    <div
      className={cn(
        'flex items-center gap-2 border-b px-4 py-2.5',
        tone === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
      )}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      <span
        className={cn(
          'ml-3 text-[11px] font-medium',
          tone === 'dark' ? 'text-slate-400' : 'text-slate-500'
        )}
      >
        {label}
      </span>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

const Kpi = ({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <Icon className="h-3.5 w-3.5 text-sky-400" />
    </div>
    <p className="mt-1 text-lg font-bold text-white">{value}</p>
    <p className="text-[10px] text-slate-500">{hint}</p>
  </div>
);

const accessFeed = [
  { name: 'Maria Souza', detail: 'Apto 302 · Facial', time: 'agora', ok: true },
  { name: 'Carlos Lima', detail: 'Apto 1104 · TAG', time: '1 min', ok: true },
  { name: 'João Pereira', detail: 'Visitante · Autorização #4821', time: '3 min', ok: true },
  { name: 'Não cadastrado', detail: 'Facial · Bloco B', time: '5 min', ok: false },
  { name: 'Ana Ribeiro', detail: 'Apto 705 · Cartão', time: '7 min', ok: true },
];

export const DashboardMockup = ({ className }: { className?: string }) => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const id = window.setInterval(() => setTick((value) => value + 1), 3200);
    return () => window.clearInterval(id);
  }, []);

  const start = tick % accessFeed.length;
  const ordered = [...accessFeed.slice(start), ...accessFeed.slice(0, start)];

  return (
    <MockupFrame label="PortalGuard · Dashboard" className={className}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Visão geral</p>
          <p className="text-[11px] text-slate-500">Terça-feira, 20 de outubro</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pg-blink" />
            6 dispositivos online
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-[10px] font-bold text-white">
            PG
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label="Acessos hoje" value="128" hint="+12% vs. ontem" icon={Fingerprint} />
        <Kpi label="Encomendas" value="14" hint="4 aguardando retirada" icon={Package} />
        <Kpi label="Moradores" value="342" hint="12 unidades ativas" icon={Users} />
        <Kpi label="Ocorrências" value="2" hint="1 em aberto" icon={ShieldCheck} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1.25fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-300">Acessos nos últimos 7 dias</p>
            <span className="text-[10px] text-slate-500">facial · TAG · cartão</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-1.5">
            {[38, 52, 44, 66, 58, 72, 64, 80, 70, 88, 76, 92].map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t bg-gradient-to-t from-sky-500/20 to-sky-400"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-slate-600">
            <span>seg</span>
            <span>ter</span>
            <span>qua</span>
            <span>qui</span>
            <span>sex</span>
            <span>sáb</span>
            <span>dom</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-300">Acessos em tempo real</p>
            <span className="text-[10px] text-slate-500">ao vivo</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {ordered.map((item, index) => (
              <div
                key={index === 0 ? `${item.name}-${tick}` : item.name}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5',
                  index === 0 ? 'bg-white/[0.06] pg-slide-in' : 'bg-transparent',
                  !item.ok && 'bg-red-500/5'
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 place-items-center rounded-full',
                    item.ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
                  )}
                >
                  {item.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-slate-200">{item.name}</p>
                  <p className="truncate text-[9px] text-slate-500">{item.detail}</p>
                </div>
                <span className="text-[9px] text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockupFrame>
  );
};

export const FloatingCard = ({
  children,
  className,
  tone = 'dark',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'dark' | 'light';
}) => (
  <div
    aria-hidden="true"
    className={cn(
      'rounded-xl border px-3 py-2 shadow-xl backdrop-blur',
      tone === 'dark'
        ? 'border-white/10 bg-[#0b1220]/90 text-slate-100 shadow-black/40'
        : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-900/10',
      className
    )}
  >
    {children}
  </div>
);

export const FaceDeviceMockup = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn('relative mx-auto w-full max-w-sm', className)}>
    <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#0d1626] to-[#070b13] p-5 shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">
        <span>Control iD</span>
        <span className="flex items-center gap-1.5 normal-case tracking-normal">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pg-blink" />
          online
        </span>
      </div>

      <div className="relative mx-auto mt-4 grid h-44 w-44 place-items-center overflow-hidden rounded-[1.75rem] border border-sky-400/25 bg-sky-400/[0.04]">
        <span className="absolute inset-0 grid place-items-center">
          <span className="h-28 w-28 rounded-full border border-sky-400/20" />
          <span className="absolute h-20 w-20 rounded-full border border-sky-400/30" />
        </span>
        <span className="absolute inset-x-6 h-px bg-gradient-to-r from-transparent via-sky-400 to-transparent pg-scan" />
        <span className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900">
          <User className="h-10 w-10 text-slate-400" />
        </span>
        <span className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-200">Acesso liberado</p>
            <p className="truncate text-[10px] text-emerald-300/70">Maria Souza · Apto 302</p>
          </div>
          <span className="ml-auto rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
            relé acionado
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <p className="text-slate-500">Reconhecimento</p>
          <p className="font-semibold text-slate-200">facial · 0,8s</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <p className="text-slate-500">Credencial</p>
          <p className="font-semibold text-slate-200">biometria ativa</p>
        </div>
      </div>
    </div>

    <FloatingCard className="absolute -left-4 bottom-16 hidden w-40 pg-float sm:block">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-400/10 text-sky-300">
          <Car className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[9px] text-slate-500">TAG veicular</p>
          <p className="text-[11px] font-semibold text-white">ABC-1D23</p>
        </div>
      </div>
    </FloatingCard>

    <FloatingCard className="absolute -right-3 top-10 hidden w-36 pg-float-soft sm:block">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/10 text-amber-300">
          <WifiOff className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[9px] text-slate-500">Sem internet</p>
          <p className="text-[11px] font-semibold text-white">operação local</p>
        </div>
      </div>
    </FloatingCard>
  </div>
);

export const MailMockup = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn('grid items-center gap-4 sm:grid-cols-[1.1fr_0.9fr]', className)}>
    <MockupFrame label="Correspondências · recebimento">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex gap-3">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/30 via-indigo-500/20 to-slate-800">
            <Package className="h-8 w-8 text-sky-200" />
            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-slate-300">
              foto
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Pacote médio · Shopee</p>
            <p className="text-[11px] text-slate-400">Maria Souza · Apto 302</p>
            <p className="mt-1 text-[10px] text-slate-500">Rastreio BR123456789</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-300">
                Aguardando retirada
              </span>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
                Notificado
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {['Recebido', 'Notificado', 'Retirado'].map((step, index) => (
          <div
            key={step}
            className={cn(
              'rounded-lg border px-2 py-2 text-center text-[9px]',
              index < 2
                ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
                : 'border-white/10 bg-white/[0.02] text-slate-500'
            )}
          >
            {step}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] text-slate-400">
          Registrar retirada por foto
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white">
          <Send className="h-3.5 w-3.5" />
        </span>
      </div>
    </MockupFrame>

    <div className="relative mx-auto w-full max-w-[230px]">
      <div className="rounded-[2rem] border border-white/10 bg-[#0b1220] p-2 shadow-2xl shadow-black/50">
        <div className="overflow-hidden rounded-[1.6rem] bg-[#070c15]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#0f172a] px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
              <MessageSquare className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-white">Portaria</p>
              <p className="flex items-center gap-1 text-[9px] text-emerald-300">
                <span className="h-1 w-1 rounded-full bg-emerald-400" /> online
              </p>
            </div>
          </div>
          <div className="space-y-2 p-3">
            <div className="max-w-[92%] rounded-xl rounded-tl-sm bg-white/[0.06] p-2">
              <p className="text-[10px] text-slate-200">Olá, Maria! Chegou uma encomenda para você.</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
                <div className="grid h-20 place-items-center bg-gradient-to-br from-sky-500/30 to-indigo-500/20">
                  <Package className="h-7 w-7 text-sky-200" />
                </div>
                <p className="bg-black/40 px-2 py-1 text-[9px] text-slate-300">Pacote · Shopee</p>
              </div>
              <p className="mt-1 text-right text-[8px] text-slate-500">19:42</p>
            </div>
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-sky-500/20 p-2">
              <p className="text-[10px] text-sky-50">Obrigada! Retiro ainda hoje.</p>
              <p className="mt-1 text-right text-[8px] text-sky-200/60">19:43</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
              <span className="text-[9px] text-slate-500">Mensagem</span>
              <span className="ml-auto grid h-5 w-5 place-items-center rounded-full bg-sky-500 text-white">
                <Send className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <FloatingCard className="absolute -left-6 -bottom-4 hidden w-36 sm:block" tone="light">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[9px] text-slate-500">Notificação</p>
            <p className="text-[10px] font-semibold">enviada com foto</p>
          </div>
        </div>
      </FloatingCard>
    </div>
  </div>
);

export const PhoneMockup = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn('relative mx-auto w-full max-w-[270px]', className)}>
    <div className="rounded-[2.4rem] border border-white/10 bg-[#0b1220] p-2.5 shadow-2xl shadow-black/50">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#070c15]">
        <div className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/60" />
        <div className="border-b border-white/10 px-3 pb-3 pt-6">
          <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Portal do morador</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-[10px] font-bold text-white">
              MS
            </span>
            <div>
              <p className="text-[11px] font-semibold text-white">Maria Souza</p>
              <p className="text-[9px] text-slate-500">Apto 302 · Bloco A</p>
            </div>
            <span className="ml-auto grid h-6 w-6 place-items-center rounded-full bg-white/5 text-slate-400">
              <Settings className="h-3 w-3" />
            </span>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-400/10 text-sky-300">
                <QrCode className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-white">Autorização ativa</p>
                <p className="text-[8px] text-slate-500">João Pereira · 19:30</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] text-emerald-300">
                válida
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-400/10 text-amber-300">
                <Package className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-white">1 encomenda</p>
                <p className="text-[8px] text-slate-500">aguardando retirada</p>
              </div>
              <span className="ml-auto text-[8px] text-sky-300">ver</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-400/10 text-indigo-300">
                <MessageSquare className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-white">Chat com a portaria</p>
                <p className="text-[8px] text-slate-500">2 mensagens não lidas</p>
              </div>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-400" />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-white">Comunicado</p>
                <p className="text-[8px] text-slate-500">Manutenção do elevador</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const OpsMockup = ({ className }: { className?: string }) => (
  <MockupFrame label="Plantão & Ocorrências" className={className}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-white">Plantão noturno</p>
        <p className="text-[10px] text-slate-500">Turno 19:00 – 07:00 · Portaria principal</p>
      </div>
      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
        em andamento
      </span>
    </div>

    <div className="mt-4 space-y-3">
      {[
        { time: '19:02', title: 'Ronda concluída', detail: 'Blocos A e B · sem alterações', tone: 'emerald' },
        { time: '19:40', title: 'Ocorrência registrada', detail: 'Barulho excessivo · Apto 1104', tone: 'amber' },
        { time: '20:15', title: 'Encomenda retirada', detail: 'Maria Souza · Apto 302', tone: 'sky' },
        { time: '21:00', title: 'Passagem de turno', detail: 'Checklist assinado por 2 colaboradores', tone: 'indigo' },
      ].map((item, index) => (
        <div key={item.time} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                item.tone === 'emerald' && 'bg-emerald-400',
                item.tone === 'amber' && 'bg-amber-400',
                item.tone === 'sky' && 'bg-sky-400',
                item.tone === 'indigo' && 'bg-indigo-400'
              )}
            />
            {index < 3 && <span className="mt-1 h-8 w-px bg-white/10" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-200">{item.title}</p>
              <span className="text-[9px] text-slate-500">{item.time}</span>
            </div>
            <p className="truncate text-[9px] text-slate-500">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-400/10 text-sky-300">
        <Clock className="h-3.5 w-3.5" />
      </span>
      <p className="text-[10px] text-slate-400">Ocorrência #128 aberta há 42 minutos</p>
      <span className="ml-auto rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-300">
        atenção
      </span>
    </div>
  </MockupFrame>
);

export const SecurityMockup = ({ className }: { className?: string }) => (  <MockupFrame label="Logs de acesso · auditoria" className={className}>
    <div className="flex flex-wrap items-center gap-1.5">
      {['Todos', 'Liberados', 'Negados', 'Facial', 'TAG'].map((filter, index) => (
        <span
          key={filter}
          className={cn(
            'rounded-full px-2 py-0.5 text-[9px]',
            index === 0
              ? 'bg-sky-400/15 text-sky-200'
              : 'border border-white/10 bg-white/[0.02] text-slate-400'
          )}
        >
          {filter}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1 text-[9px] text-slate-500">
        <Lock className="h-3 w-3" /> registro imutável
      </span>
    </div>

    <div className="mt-3 divide-y divide-white/5">
      {[
        { time: '21:04', who: 'Maria Souza', type: 'Facial', result: 'Liberado', ok: true },
        { time: '20:58', who: 'ABC-1D23', type: 'TAG', result: 'Liberado', ok: true },
        { time: '20:51', who: 'Visitante João', type: 'Autorização', result: 'Liberado', ok: true },
        { time: '20:47', who: 'Não cadastrado', type: 'Facial', result: 'Negado', ok: false },
        { time: '20:39', who: 'Ana Ribeiro', type: 'Cartão', result: 'Liberado', ok: true },
      ].map((row) => (
        <div key={row.time} className="flex items-center gap-2 py-2">
          <span className="w-9 text-[9px] text-slate-500">{row.time}</span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-200">{row.who}</span>
          <span className="hidden w-20 text-[9px] text-slate-500 sm:block">{row.type}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[9px]',
              row.ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
            )}
          >
            {row.result}
          </span>
        </div>
      ))}
    </div>

    <div className="mt-2 flex items-center gap-3 border-t border-white/10 pt-2 text-[9px] text-slate-500">
      <span className="flex items-center gap-1">
        <Smartphone className="h-3 w-3" /> 4 dispositivos
      </span>
      <span className="flex items-center gap-1">
        <Building2 className="h-3 w-3" /> 12 unidades
      </span>
      <span className="flex items-center gap-1">
        <LayoutDashboard className="h-3 w-3" /> exportar
      </span>
    </div>
  </MockupFrame>
);
