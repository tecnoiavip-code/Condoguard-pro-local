import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  computeExecutiveMetrics,
  formatHoursToBR,
  formatMinutesToBR,
  formatNumber,
  formatPercent,
  type AccessEntryRow,
  type ExecutivePeriod,
  type IncidentRow,
  type MailRow,
  type ResidentRow,
} from '@/lib/executive-metrics';

const AXIS_STYLE = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } as const;
const GRID_COLOR = 'hsl(var(--border))';

const CHART_COLORS = {
  visitor: 'hsl(var(--primary))',
  delivery: '#f59e0b',
  service: '#8b5cf6',
  incoming: '#3b82f6',
  outgoing: '#10b981',
  previous: 'hsl(var(--muted-foreground))',
};

interface ExecutiveDashboardProps {
  entries: AccessEntryRow[];
  mails: MailRow[];
  incidents: IncidentRow[];
  residents: ResidentRow[];
  period: ExecutivePeriod;
  customFrom?: string;
  customTo?: string;
  now?: Date;
}

const KpiCard = ({
  title,
  value,
  delta,
  caption,
  icon,
  accent = 'text-primary',
  deltaLabel = 'vs. período anterior',
}: {
  title: string;
  value: string;
  delta?: number | null;
  caption?: string;
  icon?: React.ReactNode;
  accent?: string;
  deltaLabel?: string;
}) => (
  <Card className="overflow-hidden">
    <CardContent className="p-5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        {icon && <span className={cn('shrink-0', accent)}>{icon}</span>}
      </div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta !== undefined && delta !== null && (
          <span
            className={cn(
              'font-semibold tabular-nums',
              delta > 0 && 'text-emerald-600 dark:text-emerald-400',
              delta < 0 && 'text-rose-600 dark:text-rose-400',
              delta === 0 && 'text-muted-foreground'
            )}
          >
            {formatPercent(delta)}
          </span>
        )}
        {delta !== undefined && <span className="text-muted-foreground">{deltaLabel}</span>}
        {caption && <span className="text-muted-foreground">{caption}</span>}
      </div>
    </CardContent>
  </Card>
);

const ChartCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </CardHeader>
    <CardContent className="pt-2">{children}</CardContent>
  </Card>
);

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
};

export const ExecutiveDashboard = ({
  entries,
  mails,
  incidents,
  residents,
  period,
  customFrom,
  customTo,
  now,
}: ExecutiveDashboardProps) => {
  const metrics = useMemo(() => {
    const periodRange = buildPeriod(period, customFrom, customTo, now);
    return computeExecutiveMetrics({
      entries,
      mails,
      incidents,
      residents,
      period: periodRange,
      previousPeriod: buildPrevious(periodRange),
      now,
    });
  }, [entries, mails, incidents, residents, period, customFrom, customTo, now]);

  const comparison = useMemo(() => {
    const current = metrics.hourly.map((row, index) => ({
      hour: row.hour,
      Atual: row.Visitantes + row.Entregadores + row.Prestadores,
      Anterior: metrics.hourlyPrevious[index]
        ? metrics.hourlyPrevious[index].Visitantes +
          metrics.hourlyPrevious[index].Entregadores +
          metrics.hourlyPrevious[index].Prestadores
        : 0,
    }));
    return comparison;
  }, [metrics.hourly, metrics.hourlyPrevious]);

  const peak = useMemo(() => {
    let best = { hour: '—', count: -1 };
    for (const row of metrics.hourly) {
      const total = row.Visitantes + row.Entregadores + row.Prestadores;
      if (total > best.count) best = { hour: row.hour, count: total };
    }
    return best;
  }, [metrics.hourly]);

  const topDay = useMemo(() => {
    let best = { day: '—', total: -1 };
    for (const row of metrics.weekday) {
      if (row.total > best.total) best = { day: row.day, total: row.total };
    }
    return best;
  }, [metrics.weekday]);

  return (
    <div className="space-y-6">
      {/* Resumo do período */}
      <Card className="bg-muted/40">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Período apurado</p>
            <p className="text-xs text-muted-foreground">
              {metrics.periodLabel} ({metrics.daysInPeriod} dias)
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              Horário de pico: <strong className="text-foreground">{peak.hour}</strong> ({peak.count} acessos)
            </span>
            <span>
              Dia mais movimentado: <strong className="text-foreground">{topDay.day}</strong> ({topDay.total} acessos)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total de Acessos"
          value={formatNumber(metrics.totalAccess)}
          delta={metrics.totalAccessDelta}
          caption={`Média de ${metrics.externalDailyAvg.toFixed(1).replace('.', ',')} externos/dia`}
        />
        <KpiCard
          title="Tempo Médio de Permanência"
          value={formatMinutesToBR(metrics.stay.avgServiceProviderMinutes || metrics.stay.avgDeliveryMinutes)}
          caption={`Entregadores: ${formatMinutesToBR(metrics.stay.avgDeliveryMinutes)} · Prestadores: ${formatMinutesToBR(metrics.stay.avgServiceProviderMinutes)}`}
        />
        <KpiCard
          title="Retirada de Encomendas"
          value={formatHoursToBR(metrics.mails.avgRetentionHours)}
          caption={`${metrics.mails.pendingOver48h} pendente(s) há mais de 48h`}
          accent="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          title="Resolução de Ocorrências"
          value={`${metrics.incidents.resolutionRate.toFixed(0)}%`}
          caption={`${metrics.incidents.resolved}/${metrics.incidents.total} encerradas`}
          accent="text-rose-600 dark:text-rose-400"
        />
      </div>

      {/* Fluxo e horários de pico */}
      <ChartCard
        title="Curva de Fluxo e Horários de Pico"
        description="Distribuição das entradas por hora, comparada ao período anterior. Use para dimensionar a escala de porteiros."
      >
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={comparison} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="execAtual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.visitor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_COLORS.visitor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={AXIS_STYLE} interval={2} stroke={GRID_COLOR} />
              <YAxis tick={AXIS_STYLE} stroke={GRID_COLOR} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Area
                type="monotone"
                dataKey="Atual"
                stroke={CHART_COLORS.visitor}
                strokeWidth={2}
                fill="url(#execAtual)"
              />
              <Line
                type="monotone"
                dataKey="Anterior"
                stroke={CHART_COLORS.previous}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Fluxo por Dia da Semana"
          description="Identifica os dias de maior movimento para programar reforço de portaria."
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.weekday} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={AXIS_STYLE} stroke={GRID_COLOR} />
                <YAxis tick={AXIS_STYLE} stroke={GRID_COLOR} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Bar dataKey="Visitantes" stackId="a" fill={CHART_COLORS.visitor} />
                <Bar dataKey="Entregadores" stackId="a" fill={CHART_COLORS.delivery} />
                <Bar dataKey="Prestadores" stackId="a" fill={CHART_COLORS.service} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Ciclo de Encomendas"
          description="Pacotes recebidos x retirados por dia — mede a ocupação da área de correspondência."
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={AXIS_STYLE} stroke={GRID_COLOR} interval="preserveStartEnd" />
                <YAxis tick={AXIS_STYLE} stroke={GRID_COLOR} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Bar dataKey="recebidas" name="Recebidas" fill={CHART_COLORS.incoming} radius={[4, 4, 0, 0]} />
                <Bar dataKey="retiradas" name="Retiradas" fill={CHART_COLORS.outgoing} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Ocorrências por Categoria e Gravidade"
          description="Causas dos incidentes registrados no período."
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Pie
                  data={metrics.incidents.byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {metrics.incidents.byCategory.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#64748b', '#06b6d4'][index % 7]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          {metrics.incidents.bySeverity.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {metrics.incidents.bySeverity.map((item) => (
                <Badge key={item.name} variant="secondary" className="gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}: {item.value}
                </Badge>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Gestão de Encomendas e Risco"
          description="Indicadores de eficiência, retenção e permanências fora do padrão."
        >
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="text-muted-foreground">Encomendas recebidas</dt>
              <dd className="font-semibold tabular-nums">
                {formatNumber(metrics.mails.received)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (anterior: {formatNumber(metrics.mailsPrevious.received)})
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="text-muted-foreground">Tempo médio até a retirada</dt>
              <dd className="font-semibold tabular-nums">{formatHoursToBR(metrics.mails.avgRetentionHours)}</dd>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="text-muted-foreground">Pendentes há mais de 48h</dt>
              <dd
                className={cn(
                  'font-semibold tabular-nums',
                  metrics.mails.pendingOver48h > 0 && 'text-amber-600 dark:text-amber-400'
                )}
              >
                {formatNumber(metrics.mails.pendingOver48h)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="text-muted-foreground">Acessos fora do padrão</dt>
              <dd
                className={cn(
                  'font-semibold tabular-nums',
                  metrics.stay.violations > 0 && 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatNumber(metrics.stay.violations)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({metrics.stay.violationRate.toFixed(1).replace('.', ',')}% dos externos)
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Distribuição das violações</dt>
              <dd className="text-xs text-muted-foreground">
                {metrics.stay.deliveryOver45} entregadores &gt;45min · {metrics.stay.serviceProviderOver4h} prestadores &gt;4h ·{' '}
                {metrics.stay.after18h} após 18h
              </dd>
            </div>
          </dl>

          {metrics.mails.topCarriers.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Principais transportadoras
              </p>
              <ul className="space-y-1.5 text-sm">
                {metrics.mails.topCarriers.map((carrier) => {
                  const pct = metrics.mails.received ? (carrier.count / metrics.mails.received) * 100 : 0;
                  return (
                    <li key={carrier.name} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 truncate">{carrier.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {carrier.count} · {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Top Unidades com Maior Fluxo"
        description="Ranking dos apartamentos com mais movimentação no período, incluindo o uso do convite QR Code."
      >
        {metrics.topUnits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem movimentações no período selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Morador</TableHead>
                  <TableHead className="text-right">Acessos</TableHead>
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">Encomendas</TableHead>
                  <TableHead className="text-right">Convites QR</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.topUnits.map((unit, index) => (
                  <TableRow key={unit.apartment}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{unit.apartment}</TableCell>
                    <TableCell className="text-muted-foreground">{unit.residentName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(unit.entries)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(unit.deliveries)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(unit.mails)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(unit.qrPasses)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatNumber(unit.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ChartCard>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Helpers locais                                                     */
/* ------------------------------------------------------------------ */

function buildPeriod(
  period: ExecutivePeriod,
  customFrom?: string,
  customTo?: string,
  now?: Date
) {
  const reference = now || new Date();
  if (period === 'custom' && customFrom && customTo) {
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }
  if (period === 'month') {
    return {
      from: new Date(reference.getFullYear(), reference.getMonth(), 1),
      to: new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 23, 59, 59, 999),
    };
  }
  const days = period === '7d' ? 7 : 30;
  return {
    from: new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - (days - 1)),
    to: new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 23, 59, 59, 999),
  };
}

function buildPrevious(range: { from: Date; to: Date }) {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };
}

export default ExecutiveDashboard;
