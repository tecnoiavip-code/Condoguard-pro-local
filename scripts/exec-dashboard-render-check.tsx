import { renderToString } from 'react-dom/server';
import { ExecutiveDashboard } from '../src/components/reports/ExecutiveDashboard';
import { computeExecutiveMetrics, previousRangeOf, resolveRange } from '../src/lib/executive-metrics';

const NOW = new Date('2026-09-28T15:00:00');
const day = (offset: number, hour: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const scenarios: { label: string; entries: any[]; mails: any[]; incidents: any[]; residents: any[] }[] = [
  { label: 'TOTALMENTE VAZIO', entries: [], mails: [], incidents: [], residents: [] },
  {
    label: 'SO COM RESIDENTS',
    entries: [],
    mails: [],
    incidents: [],
    residents: [{ id: 'r1', name: 'Ana', apartment: '101' }],
  },
  {
    label: 'COM DADOS',
    entries: [
      { id: '1', visitor_name: 'A', visitor_type: 'visitor', apartment: '101', entry_time: day(0, 11), exit_time: day(0, 12) },
      { id: '2', visitor_name: 'B', visitor_type: 'delivery', apartment: '202', entry_time: day(0, 12), exit_time: day(0, 13) },
    ],
    mails: [{ id: 'm1', resident_id: 'r1', sender: 'Correios', received_at: day(0, 10), status: 'pending' }],
    incidents: [{ id: 'i1', title: 'Barulho', severity: 'high', status: 'open', created_at: day(0, 20), apartment: '101' }],
    residents: [{ id: 'r1', name: 'Ana', apartment: '101' }],
  },
  {
    label: 'APARTAMENTO VAZIO/NULL (dados sujos)',
    entries: [{ id: '1', visitor_name: 'A', visitor_type: 'visitor', entry_time: day(0, 11), exit_time: null }],
    mails: [{ id: 'm1', resident_id: null, sender: null, received_at: day(0, 10) }],
    incidents: [{ id: 'i1', title: null, description: null, severity: null, status: null, created_at: null }],
    residents: [{ id: 'r1', name: null, apartment: null }],
  },
];

let failed = 0;

for (const scenario of scenarios) {
  try {
    const html = renderToString(
      <ExecutiveDashboard
        entries={scenario.entries as any}
        mails={scenario.mails as any}
        incidents={scenario.incidents as any}
        residents={scenario.residents as any}
        period="30d"
        now={NOW}
      />
    );
    console.log(`OK    render: ${scenario.label} (${html.length} chars)`);
  } catch (err: any) {
    failed++;
    console.log(`FALHA render: ${scenario.label}`);
    console.log(`      erro: ${err?.message}`);
    console.log(`      stack: ${String(err?.stack ?? '').split('\n').slice(1, 5).join('\n            ')}`);
  }
}

const period = { from: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 29), to: NOW };
try {
  const m = computeExecutiveMetrics({
    entries: [],
    mails: [],
    incidents: [],
    residents: [],
    period,
    previousPeriod: previousRangeOf(period),
    now: NOW,
  });
  console.log(`OK    metricas vazias: dias=${m.daysInPeriod} topUnits=${m.topUnits.length} externalAvg=${m.externalDailyAvg}`);
} catch (err: any) {
  failed++;
  console.log(`FALHA metricas vazias: ${err?.message}`);
}

console.log(failed === 0 ? '\nTodos os cenários de render passaram.' : `\n${failed} cenário(s) com falha.`);
if (failed > 0) process.exitCode = 1;