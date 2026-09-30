/**
 * Motor de agregação do Painel Executivo (BI do Condomínio).
 * Consolida access_entries, mails e incidents em indicadores e séries
 * comparativas (período atual x período anterior de mesmo tamanho).
 */
import { getStayDurationMinutes, staysAfter18h } from '@/lib/utils';

export type ExecutivePeriod = '7d' | '30d' | 'month' | 'custom';

export const EXECUTIVE_PERIOD_LABELS: Record<ExecutivePeriod, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  month: 'Mês atual',
  custom: 'Período personalizado',
};

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AccessEntryRow {
  id: string;
  visitor_name: string;
  visitor_type?: string | null;
  company?: string | null;
  apartment?: string | null;
  resident_id?: string | null;
  resident_name?: string | null;
  purpose?: string | null;
  entry_time?: string | null;
  exit_time?: string | null;
  registered_by?: string | null;
}

export interface MailRow {
  id: string;
  resident_id: string;
  sender: string;
  package_type?: string | null;
  status?: string | null;
  received_at?: string | null;
  delivered_at?: string | null;
  withdrawn_by?: string | null;
}

export interface IncidentRow {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  status?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  apartment?: string | null;
  resident_id?: string | null;
  resident_name?: string | null;
}

export interface ResidentRow {
  id: string;
  name: string;
  apartment: string;
}

export interface MetricsInput {
  entries: AccessEntryRow[];
  mails: MailRow[];
  incidents: IncidentRow[];
  residents: ResidentRow[];
  period: DateRange;
  previousPeriod: DateRange;
  now?: Date;
}

/* ------------------------------------------------------------------ */
/* Normalização                                                       */
/* ------------------------------------------------------------------ */

export const VISITOR_TYPE_LABELS: Record<string, string> = {
  visitor: 'Visitantes',
  delivery: 'Entregadores',
  service_provider: 'Prestadores',
  resident: 'Moradores',
  guest: 'Visitantes',
  contractor: 'Prestadores',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Leve',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const VISITOR_TYPE_FALLBACK: Record<string, string> = {
  visitor: 'visitor',
  guest: 'visitor',
  delivery: 'delivery',
  entregador: 'delivery',
  service_provider: 'service_provider',
  contractor: 'service_provider',
  prestador: 'service_provider',
  resident: 'resident',
  morador: 'resident',
};

const normalizeType = (raw?: string | null): string => {
  if (!raw) return 'visitor';
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return VISITOR_TYPE_FALLBACK[key] || key;
};

export const CATEGORY_RULES: { label: string; test: RegExp }[] = [
  { label: 'Vagas de Garagem', test: /\b(vaga|garagem|estacionamento|parking|box)\b/i },
  { label: 'Barulho / Convivência', test: /\b(barulho|sonoro|ruido|conversa|convivência|conivencia|briga|discussão|discursao|reclamação)\b/i },
  { label: 'Manutenção / Equipamentos', test: /\b(manutenção|manutencao|equipamento|quebrado|quebrada|defeito|infiltração|vazamento|elétrico|eletrico|encanamento|pragueiro)\b/i },
  { label: 'Portaria / Acesso', test: /\b(portaria|acesso|entrada|saída|saida|crachá|cracha|visitante|entregador|interfone|câmera|camera)\b/i },
  { label: 'Limpeza', test: /\b(limpeza|limo|lixo|resíduo|residuo|coleta|lavanderia)\b/i },
  { label: 'Segurança', test: /\b(segurança|seguranca|risco|roubo|aviso|intrusão|intrusao|incêndio|incendio)\b/i },
];

export const categorizeIncident = (incident: IncidentRow): string => {
  const haystack = `${incident.title || ''} ${incident.description || ''}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(haystack)) return rule.label;
  }
  return 'Outros';
};

/* ------------------------------------------------------------------ */
/* Períodos                                                            */
/* ------------------------------------------------------------------ */

export function resolveRange(period: ExecutivePeriod, custom?: { from: string; to: string }): DateRange {
  const now = new Date();
  if (period === 'custom' && custom?.from && custom?.to) {
    const from = new Date(`${custom.from}T00:00:00`);
    const to = new Date(`${custom.to}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    };
  }
  const days = period === '7d' ? 7 : 30;
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);
  return { from, to };
}

export function previousRangeOf(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };
}

const within = (value: string | null | undefined, range: DateRange): boolean => {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t >= range.from.getTime() && t <= range.to.getTime();
};

/* ------------------------------------------------------------------ */
/* Série temporal                                                     */
/* ------------------------------------------------------------------ */

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ------------------------------------------------------------------ */
/* Métricas                                                           */
/* ------------------------------------------------------------------ */

export interface AccessComposition {
  visitor: number;
  delivery: number;
  service_provider: number;
  other: number;
  total: number;
}

export interface StaySummary {
  avgDeliveryMinutes: number;
  avgServiceProviderMinutes: number;
  violations: number;
  violationRate: number;
  deliveryOver45: number;
  serviceProviderOver4h: number;
  after18h: number;
}

export interface MailSummary {
  received: number;
  delivered: number;
  pending: number;
  pendingOver48h: number;
  avgRetentionHours: number;
  topCarriers: { name: string; count: number }[];
}

export interface IncidentSummary {
  total: number;
  resolved: number;
  resolutionRate: number;
  open: number;
  bySeverity: { name: string; value: number; color: string }[];
  byCategory: { name: string; value: number }[];
  criticalList: IncidentRow[];
}

export interface TopUnit {
  apartment: string;
  residentName: string;
  entries: number;
  deliveries: number;
  mails: number;
  qrPasses: number;
  total: number;
}

export interface ExecutiveMetrics {
  periodLabel: string;
  range: DateRange;
  previousRange: DateRange;
  totalAccess: number;
  totalAccessDelta: number | null;
  externalDailyAvg: number;
  externalDailyAvgDelta: number | null;
  composition: AccessComposition;
  compositionPrevious: AccessComposition;
  stay: StaySummary;
  stayPrevious: StaySummary;
  mails: MailSummary;
  mailsPrevious: MailSummary;
  incidents: IncidentSummary;
  incidentsPrevious: IncidentSummary;
  hourly: { hour: string; Visitantes: number; Entregadores: number; Prestadores: number }[];
  hourlyPrevious: { hour: string; Visitantes: number; Entregadores: number; Prestadores: number }[];
  weekday: { day: string; total: number; Visitantes: number; Entregadores: number; Prestadores: number }[];
  daily: { day: string; date: string; recebidas: number; retiradas: number }[];
  topUnits: TopUnit[];
  qrPassIssued: number;
  qrPassRedeemed: number;
  daysInPeriod: number;
}

const percentDelta = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

function compose(entries: AccessEntryRow[]): AccessComposition {
  const composition: AccessComposition = { visitor: 0, delivery: 0, service_provider: 0, other: 0, total: 0 };
  for (const entry of entries) {
    const type = normalizeType(entry.visitor_type);
    if (type === 'visitor') composition.visitor++;
    else if (type === 'delivery') composition.delivery++;
    else if (type === 'service_provider') composition.service_provider++;
    else composition.other++;
    composition.total++;
  }
  return composition;
}

function summarizeStays(entries: AccessEntryRow[], now: Date): StaySummary {
  const summary: StaySummary = {
    avgDeliveryMinutes: 0,
    avgServiceProviderMinutes: 0,
    violations: 0,
    violationRate: 0,
    deliveryOver45: 0,
    serviceProviderOver4h: 0,
    after18h: 0,
  };
  let deliverySum = 0;
  let deliveryCount = 0;
  let providerSum = 0;
  let providerCount = 0;
  let external = 0;

  for (const entry of entries) {
    const type = normalizeType(entry.visitor_type);
    const minutes = getStayDurationMinutes(entry.entry_time, entry.exit_time, now);
    if (minutes === null) continue;

    if (type === 'delivery') {
      deliverySum += minutes;
      deliveryCount++;
      external++;
      if (minutes > 45) summary.deliveryOver45++;
    } else if (type === 'service_provider') {
      providerSum += minutes;
      providerCount++;
      external++;
      if (minutes > 4 * 60) summary.serviceProviderOver4h++;
    } else {
      continue;
    }

    if ((type === 'delivery' && minutes > 45) || (type === 'service_provider' && minutes > 240) || staysAfter18h(entry.entry_time, entry.exit_time, now)) {
      summary.violations++;
    }
  }

  summary.avgDeliveryMinutes = deliveryCount ? Math.round(deliverySum / deliveryCount) : 0;
  summary.avgServiceProviderMinutes = providerCount ? Math.round(providerSum / providerCount) : 0;
  summary.after18h = entries.filter((e) => {
    const type = normalizeType(e.visitor_type);
    return (type === 'delivery' || type === 'service_provider') && staysAfter18h(e.entry_time, e.exit_time, now);
  }).length;
  summary.violationRate = external ? (summary.violations / external) * 100 : 0;
  return summary;
}

const CARRIER_RULES: { label: string; test: RegExp }[] = [
  { label: 'Mercado Livre', test: /mercado\s*livre|mercadolivre|ml/i },
  { label: 'Amazon', test: /amazon/i },
  { label: 'Shopee', test: /shopee/i },
  { label: 'Correios', test: /correios|correio|cte|brs|via\s*braspress|sedex/i },
  { label: 'iFood / Rappi', test: /ifood|rappi|99food|uber\s*eats/i },
  { label: 'Loggi / Jadlog / ASAP', test: /loggi|jadlog|asap|loggi transporters/i },
  { label: 'PagSeguro / PicPay', test: /pagseguro|pag\s*seguro|picpay/i },
  { label: 'DHL / FedEx', test: /dhl|fedex/i },
];

const categorizeCarrier = (sender: string): string => {
  for (const rule of CARRIER_RULES) {
    if (rule.test.test(sender)) return rule.label;
  }
  return 'Outros remetentes';
};

function summarizeMails(mails: MailRow[], now: Date): MailSummary {
  const summary: MailSummary = {
    received: mails.length,
    delivered: 0,
    pending: 0,
    pendingOver48h: 0,
    avgRetentionHours: 0,
    topCarriers: [],
  };
  const carrierCount = new Map<string, number>();
  let retentionSum = 0;
  let retentionCount = 0;

  for (const mail of mails) {
    const delivered = mail.status === 'delivered' || !!mail.delivered_at;
    if (delivered) summary.delivered++;
    else summary.pending++;

    if (!delivered && mail.received_at) {
      const hours = (now.getTime() - new Date(mail.received_at).getTime()) / 3600000;
      if (hours > 48) summary.pendingOver48h++;
    }

    if (delivered && mail.received_at && mail.delivered_at) {
      const hours = (new Date(mail.delivered_at).getTime() - new Date(mail.received_at).getTime()) / 3600000;
      if (hours >= 0) {
        retentionSum += hours;
        retentionCount++;
      }
    }

    const carrier = categorizeCarrier(mail.sender || '');
    carrierCount.set(carrier, (carrierCount.get(carrier) || 0) + 1);
  }

  summary.avgRetentionHours = retentionCount ? retentionSum / retentionCount : 0;
  summary.topCarriers = [...carrierCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return summary;
}

function summarizeIncidents(incidents: IncidentRow[]): IncidentSummary {
  const summary: IncidentSummary = {
    total: incidents.length,
    resolved: 0,
    resolutionRate: 0,
    open: 0,
    bySeverity: [],
    byCategory: [],
    criticalList: [],
  };
  const severityCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();

  for (const incident of incidents) {
    const status = incident.status || 'open';
    const resolved = status === 'resolved' || status === 'closed' || !!incident.resolved_at;
    if (resolved) summary.resolved++;
    else summary.open++;

    const severity = (incident.severity || 'low').toLowerCase();
    severityCount.set(severity, (severityCount.get(severity) || 0) + 1);
    const category = categorizeIncident(incident);
    categoryCount.set(category, (categoryCount.get(category) || 0) + 1);

    if ((severity === 'critical' || severity === 'high') && !resolved) {
      summary.criticalList.push(incident);
    }
  }

  summary.resolutionRate = summary.total ? (summary.resolved / summary.total) * 100 : 0;
  summary.bySeverity = (['critical', 'high', 'medium', 'low'] as const)
    .filter((key) => severityCount.has(key))
    .map((key) => ({
      name: SEVERITY_LABELS[key] || key,
      value: severityCount.get(key) || 0,
      color: SEVERITY_COLORS[key] || '#64748b',
    }));
  summary.byCategory = [...categoryCount.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return summary;
}

function buildHourly(entries: AccessEntryRow[]): ExecutiveMetrics['hourly'] {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    Visitantes: 0,
    Entregadores: 0,
    Prestadores: 0,
  }));
  for (const entry of entries) {
    if (!entry.entry_time) continue;
    const date = new Date(entry.entry_time);
    if (Number.isNaN(date.getTime())) continue;
    const type = normalizeType(entry.visitor_type);
    const row = rows[date.getHours()];
    if (type === 'delivery') row.Entregadores++;
    else if (type === 'service_provider') row.Prestadores++;
    else row.Visitantes++;
  }
  return rows;
}

function buildWeekday(entries: AccessEntryRow[]): ExecutiveMetrics['weekday'] {
  const rows = WEEKDAY_LABELS.map((day) => ({ day, total: 0, Visitantes: 0, Entregadores: 0, Prestadores: 0 }));
  for (const entry of entries) {
    if (!entry.entry_time) continue;
    const date = new Date(entry.entry_time);
    if (Number.isNaN(date.getTime())) continue;
    const row = rows[date.getDay()];
    row.total++;
    const type = normalizeType(entry.visitor_type);
    if (type === 'delivery') row.Entregadores++;
    else if (type === 'service_provider') row.Prestadores++;
    else row.Visitantes++;
  }
  return rows;
}

function buildDaily(mails: MailRow[]): ExecutiveMetrics['daily'] {
  const map = new Map<string, ExecutiveMetrics['daily'][number]>();
  const ensure = (date: Date) => {
    const key = dayKey(date);
    if (!map.has(key)) {
      map.set(key, {
        day: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
        date: key,
        recebidas: 0,
        retiradas: 0,
      });
    }
    return map.get(key)!;
  };

  for (const mail of mails) {
    if (mail.received_at) {
      const date = new Date(mail.received_at);
      if (!Number.isNaN(date.getTime())) ensure(date).recebidas++;
    }
    if (mail.delivered_at) {
      const date = new Date(mail.delivered_at);
      if (!Number.isNaN(date.getTime())) ensure(date).retiradas++;
    }
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildTopUnits(
  entries: AccessEntryRow[],
  mails: MailRow[],
  residents: ResidentRow[],
  qrPasses: { apartment: string; redeemed: boolean }[]
): TopUnit[] {
  const byResident = new Map<string, ResidentRow>();
  for (const resident of residents) byResident.set(resident.id, resident);

  const units = new Map<string, TopUnit>();
  const touch = (apartment: string | null | undefined, residentId?: string | null, residentName?: string | null) => {
    const apt = (apartment || '').trim() || byResident.get(residentId || '')?.apartment || '';
    if (!apt) return null;
    if (!units.has(apt)) {
      units.set(apt, {
        apartment: apt,
        residentName: residentName || byResident.get(residentId || '')?.name || '—',
        entries: 0,
        deliveries: 0,
        mails: 0,
        qrPasses: 0,
        total: 0,
      });
    }
    return units.get(apt)!;
  };

  for (const entry of entries) {
    const unit = touch(entry.apartment, entry.resident_id, entry.resident_name);
    if (!unit) continue;
    unit.entries++;
    if (normalizeType(entry.visitor_type) === 'delivery') unit.deliveries++;
  }
  for (const mail of mails) {
    const unit = touch(null, mail.resident_id, null);
    if (!unit) continue;
    unit.mails++;
  }
  for (const pass of qrPasses) {
    const unit = units.get(pass.apartment);
    if (unit) unit.qrPasses++;
  }

  for (const unit of units.values()) unit.total = unit.entries + unit.mails;
  return [...units.values()].sort((a, b) => b.total - a.total).slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

export function computeExecutiveMetrics(input: MetricsInput): ExecutiveMetrics {
  const now = input.now || new Date();
  const { period, previousPeriod } = input;

  const entries = input.entries.filter((e) => within(e.entry_time, period));
  const entriesPrevious = input.entries.filter((e) => within(e.entry_time, previousPeriod));
  const mails = input.mails.filter((m) => within(m.received_at, period) || within(m.delivered_at, period));
  const mailsPrevious = input.mails.filter((m) => within(m.received_at, previousPeriod) || within(m.delivered_at, previousPeriod));
  const incidents = input.incidents.filter((i) => within(i.created_at, period));
  const incidentsPrevious = input.incidents.filter((i) => within(i.created_at, previousPeriod));

  const daysInPeriod = Math.max(1, Math.floor((period.to.getTime() - period.from.getTime()) / 86400000) + 1);

  const composition = compose(entries);
  const compositionPrevious = compose(entriesPrevious);
  const externalTotal = composition.visitor + composition.delivery + composition.service_provider;
  const externalPrevious = compositionPrevious.visitor + compositionPrevious.delivery + compositionPrevious.service_provider;

  const residentById = new Map(input.residents.map((r) => [r.id, r]));
  const qrPassIssued = entries.filter((e) => !!e.resident_id).length;
  const qrPassRedeemed = input.incidents.filter((i) => i.resident_id && within(i.created_at, period)).length;

  return {
    periodLabel: `${period.from.toLocaleDateString('pt-BR')} a ${period.to.toLocaleDateString('pt-BR')}`,
    range: period,
    previousRange: previousPeriod,
    totalAccess: composition.total,
    totalAccessDelta: percentDelta(composition.total, compositionPrevious.total),
    externalDailyAvg: externalTotal / daysInPeriod,
    externalDailyAvgDelta: percentDelta(externalTotal / daysInPeriod, externalPrevious / daysInPeriod),
    composition,
    compositionPrevious,
    stay: summarizeStays(entries, now),
    stayPrevious: summarizeStays(entriesPrevious, now),
    mails: summarizeMails(mails, now),
    mailsPrevious: summarizeMails(mailsPrevious, now),
    incidents: summarizeIncidents(incidents),
    incidentsPrevious: summarizeIncidents(incidentsPrevious),
    hourly: buildHourly(entries),
    hourlyPrevious: buildHourly(entriesPrevious),
    weekday: buildWeekday(entries),
    daily: buildDaily(mails),
    topUnits: buildTopUnits(
      entries,
      mails,
      input.residents,
      Array.from(residentById.keys()).map((rid) => ({
        apartment: residentById.get(rid)!.apartment,
        redeemed: false,
      }))
    ),
    qrPassIssued,
    qrPassRedeemed,
    daysInPeriod,
  };
}

/* ------------------------------------------------------------------ */
/* Formatação                                                         */
/* ------------------------------------------------------------------ */

export const formatMinutesToBR = (minutes: number): string => {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}min`;
  return `${mins}min`;
};

export const formatHoursToBR = (hours: number): string => {
  if (!hours) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  return `${hours.toFixed(1).replace('.', ',')}h`;
};

export const formatPercent = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
};

export const formatNumber = (value: number): string => new Intl.NumberFormat('pt-BR').format(Math.round(value));
