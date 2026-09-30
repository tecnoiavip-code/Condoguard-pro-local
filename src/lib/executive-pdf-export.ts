/**
 * Gerador do Relatório Executivo Mensal para Assembleia.
 * Layout corporativo em A4, tabelas zebradas via jspdf-autotable e
 * blocos estatísticos com comparativo ao período anterior.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  formatHoursToBR,
  formatMinutesToBR,
  formatNumber,
  formatPercent,
  type ExecutiveMetrics,
} from '@/lib/executive-metrics';
import { DELIVERY_MAX_MINUTES, SERVICE_PROVIDER_MAX_HOURS } from '@/lib/utils';

const BRAND = { r: 30, g: 64, b: 175 } as const; // azul institucional
const INK = { r: 15, g: 23, b: 42 } as const;
const MUTED = { r: 100, g: 116, b: 139 } as const;
const ZEBRA = { r: 248, g: 250, b: 252 } as const;

export interface EquipmentCheckRow {
  shift_date: string;
  shift_type: string;
  equipment_name: string;
  status: string;
  notes?: string | null;
}

export interface ExecutivePdfInput {
  metrics: ExecutiveMetrics;
  condominiumName?: string;
  equipmentChecks?: EquipmentCheckRow[];
  preparedBy?: string;
}

const CHECK_STATUS_LABELS: Record<string, string> = {
  functional: 'Funcional',
  maintenance: 'Manutenção',
  defective: 'Defeituoso',
};

const CHECK_STATUS_COLORS: Record<string, [number, number, number]> = {
  functional: [34, 197, 94],
  maintenance: [234, 179, 8],
  defective: [239, 68, 68],
};

const severityText = (severity: string) =>
  severity === 'critical' ? 'CRÍTICA' : severity === 'high' ? 'ALTA' : severity === 'medium' ? 'MÉDIA' : 'LEVE';

export function exportExecutiveReport({
  metrics,
  condominiumName = 'Condomínio',
  equipmentChecks = [],
  preparedBy,
}: ExecutivePdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let cursor = 0;

  /* ---------------------------------------------------------------- */
  /* Helpers de layout                                                 */
  /* ---------------------------------------------------------------- */

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };

  const drawHeader = () => {
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setTextColor(255, 255, 255);
    setFont(15, 'bold');
    doc.text(condominiumName, margin, 12);
    setFont(9);
    doc.text('Relatório Executivo de Gestão — Indicadores para Assembleia', margin, 19);
    doc.setTextColor(INK.r, INK.g, INK.b);
  };

  const drawFooter = (pageNumber: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    setFont(8);
    doc.text(
      `Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}${preparedBy ? ` por ${preparedBy}` : ''}`,
      margin,
      pageHeight - 7
    );
    doc.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    doc.setTextColor(INK.r, INK.g, INK.b);
  };

  const ensureSpace = (needed: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (cursor + needed > pageHeight - 20) {
      doc.addPage();
      drawHeader();
      cursor = 36;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(16);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, cursor - 4, 2.5, 6, 'F');
    setFont(12, 'bold');
    doc.text(title, margin + 5, cursor);
    cursor += 8;
  };

  const kpiBox = (
    label: string,
    value: string,
    delta: number | null,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(252, 253, 254);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');

    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    setFont(7.5, 'bold');
    doc.text(label.toUpperCase(), x + 3, y + 6);

    doc.setTextColor(INK.r, INK.g, INK.b);
    setFont(15, 'bold');
    doc.text(value, x + 3, y + 15);

    if (delta !== null && Number.isFinite(delta)) {
      const positive = delta >= 0;
      doc.setTextColor(positive ? 22 : 190, positive ? 130 : 40, positive ? 90 : 60);
      setFont(8, 'bold');
      doc.text(`${formatPercent(delta)} vs. período anterior`, x + 3, y + h - 3);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Capa / cabeçalho                                                  */
  /* ---------------------------------------------------------------- */

  drawHeader();

  cursor = 36;
  setFont(18, 'bold');
  doc.text('Painel Executivo & BI do Condomínio', margin, cursor);
  cursor += 7;
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  setFont(10);
  doc.text(`Período de apuração: ${metrics.periodLabel} (${metrics.daysInPeriod} dias)`, margin, cursor);
  cursor += 6;
  doc.text(
    `Comparativo com o período anterior: ${metrics.previousRange.from.toLocaleDateString('pt-BR')} a ${metrics.previousRange.to.toLocaleDateString('pt-BR')}`,
    margin,
    cursor
  );
  cursor += 12;

  /* ---------------------------------------------------------------- */
  /* 1. Sumário executivo                                              */
  /* ---------------------------------------------------------------- */

  sectionTitle('1. Sumário Executivo');

  const boxW = (contentWidth - 6) / 2;
  const boxH = 24;
  kpiBox('Total de acessos', formatNumber(metrics.totalAccess), metrics.totalAccessDelta, margin, cursor, boxW, boxH);
  kpiBox(
    'Média diária de externos',
    metrics.externalDailyAvg.toFixed(1).replace('.', ','),
    metrics.externalDailyAvgDelta,
    margin + boxW + 6,
    cursor,
    boxW,
    boxH
  );
  cursor += boxH + 6;
  kpiBox(
    'Tempo médio de permanência',
    formatMinutesToBR(metrics.stay.avgServiceProviderMinutes || metrics.stay.avgDeliveryMinutes),
    null,
    margin,
    cursor,
    boxW,
    boxH
  );
  kpiBox('Taxa de resolução de ocorrências', `${metrics.incidents.resolutionRate.toFixed(0)}%`, null, margin + boxW + 6, cursor, boxW, boxH);
  cursor += boxH + 10;

  autoTable(doc, {
    startY: cursor,
    head: [['Indicador', 'Período atual', 'Período anterior', 'Variação']],
    body: [
      [
        'Acessos totais registrados',
        formatNumber(metrics.totalAccess),
        formatNumber(metrics.compositionPrevious.total),
        formatPercent(metrics.totalAccessDelta),
      ],
      [
        'Visitantes',
        formatNumber(metrics.composition.visitor),
        formatNumber(metrics.compositionPrevious.visitor),
        formatPercent(
          metrics.compositionPrevious.visitor
            ? ((metrics.composition.visitor - metrics.compositionPrevious.visitor) / metrics.compositionPrevious.visitor) * 100
            : null
        ),
      ],
      [
        'Entregadores',
        formatNumber(metrics.composition.delivery),
        formatNumber(metrics.compositionPrevious.delivery),
        formatPercent(
          metrics.compositionPrevious.delivery
            ? ((metrics.composition.delivery - metrics.compositionPrevious.delivery) / metrics.compositionPrevious.delivery) * 100
            : null
        ),
      ],
      [
        'Prestadores de serviço',
        formatNumber(metrics.composition.service_provider),
        formatNumber(metrics.compositionPrevious.service_provider),
        formatPercent(
          metrics.compositionPrevious.service_provider
            ? ((metrics.composition.service_provider - metrics.compositionPrevious.service_provider) /
                metrics.compositionPrevious.service_provider) *
                100
            : null
        ),
      ],
      [
        'Tempo médio de retenção de encomendas',
        formatHoursToBR(metrics.mails.avgRetentionHours),
        formatHoursToBR(metrics.mailsPrevious.avgRetentionHours),
        metrics.mailsPrevious.avgRetentionHours
          ? formatPercent(((metrics.mails.avgRetentionHours - metrics.mailsPrevious.avgRetentionHours) / metrics.mailsPrevious.avgRetentionHours) * 100)
          : '—',
      ],
      [
        'Acessos fora do padrão de segurança',
        formatNumber(metrics.stay.violations),
        formatNumber(metrics.stayPrevious.violations),
        metrics.stayPrevious.violations
          ? formatPercent(((metrics.stay.violations - metrics.stayPrevious.violations) / metrics.stayPrevious.violations) * 100)
          : '—',
      ],
      [
        'Ocorrências registradas',
        formatNumber(metrics.incidents.total),
        formatNumber(metrics.incidentsPrevious.total),
        metrics.incidentsPrevious.total
          ? formatPercent(((metrics.incidents.total - metrics.incidentsPrevious.total) / metrics.incidentsPrevious.total) * 100)
          : '—',
      ],
      [
        'Ocorrências resolvidas / fechadas',
        formatNumber(metrics.incidents.resolved),
        formatNumber(metrics.incidentsPrevious.resolved),
        '—',
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: margin, right: margin },
  });

  cursor = (doc as any).lastAutoTable.finalY + 10;

  /* ---------------------------------------------------------------- */
  /* 2. Fluxo e dimensionamento                                        */
  /* ---------------------------------------------------------------- */

  sectionTitle('2. Curva de Fluxo e Dimensionamento de Equipe');

  const hourlyTotals = metrics.hourly.map((row) => row.Visitantes + row.Entregadores + row.Prestadores);
  const maxFlow = Math.max(...hourlyTotals, 0);
  const peakHour = metrics.hourly[hourlyTotals.indexOf(maxFlow)]?.hour ?? '—';

  const windowTotals = (fromHour: number, toHour: number) => {
    let total = 0;
    for (let h = fromHour; h <= toHour; h++) total += hourlyTotals[h] || 0;
    return total;
  };
  const morning = windowTotals(6, 13);
  const evening = windowTotals(14, 22);

  ensureSpace(46);
  autoTable(doc, {
    startY: cursor,
    head: [['Faixa horária', 'Acessos no período', 'Participação']],
    body: [
      ['06h – 13h (pico matinal)', formatNumber(morning), `${metrics.totalAccess ? ((morning / metrics.totalAccess) * 100).toFixed(1).replace('.', ',') : '0,0'}%`],
      ['14h – 22h (pico vespertino)', formatNumber(evening), `${metrics.totalAccess ? ((evening / metrics.totalAccess) * 100).toFixed(1).replace('.', ',') : '0,0'}%`],
      ['Horário de maior movimento', peakHour, `${formatNumber(maxFlow)} acesso(s)`],
    ],
    styles: { fontSize: 9, cellPadding: 2.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: margin, right: margin },
  });
  cursor = (doc as any).lastAutoTable.finalY + 5;

  const peak = hourlyTotals.indexOf(maxFlow);
  setFont(8.5);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  const recommendation =
    maxFlow > 0
      ? `Leitura para assembleia: o maior movimento concentra-se às ${peakHour} (${formatNumber(maxFlow)} acessos no período). Recomenda-se avaliar reforço de portário nessa faixa e nas ${Math.max(0, peak - 1)}h–${peak + 1}h.`
      : 'Sem acessos registrados no período selecionado.';
  const lines = doc.splitTextToSize(recommendation, contentWidth);
  doc.text(lines, margin, cursor);
  cursor += lines.length * 4.5 + 8;
  doc.setTextColor(INK.r, INK.g, INK.b);

  /* ---------------------------------------------------------------- */
  /* 3. Encomendas                                                     */
  /* ---------------------------------------------------------------- */

  sectionTitle('3. Gestão de Encomendas');

  ensureSpace(40);
  autoTable(doc, {
    startY: cursor,
    head: [['Indicador', 'Valor']],
    body: [
      ['Pacotes recebidos no período', formatNumber(metrics.mails.received)],
      ['Pacotes já entregues', formatNumber(metrics.mails.delivered)],
      ['Pacotes pendentes', formatNumber(metrics.mails.pending)],
      ['Pendentes há mais de 48h (alerta de ocupação)', formatNumber(metrics.mails.pendingOver48h)],
      ['Tempo médio até a retirada', formatHoursToBR(metrics.mails.avgRetentionHours)],
    ],
    styles: { fontSize: 9, cellPadding: 2.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: margin, right: margin },
  });
  cursor = (doc as any).lastAutoTable.finalY + 8;

  if (metrics.mails.topCarriers.length > 0) {
    ensureSpace(20 + metrics.mails.topCarriers.length * 5);
    setFont(9, 'bold');
    doc.text('Principais transportadoras', margin, cursor);
    cursor += 5;
    autoTable(doc, {
      startY: cursor,
      head: [['Transportadora', 'Volumes', 'Participação']],
      body: metrics.mails.topCarriers.map((carrier) => [
        carrier.name,
        formatNumber(carrier.count),
        `${metrics.mails.received ? ((carrier.count / metrics.mails.received) * 100).toFixed(1).replace('.', ',') : '0,0'}%`,
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ---------------------------------------------------------------- */
  /* 4. Segurança e permanências                                      */
  /* ---------------------------------------------------------------- */

  sectionTitle('4. Controle de Risco e Permanências');

  ensureSpace(40);
  autoTable(doc, {
    startY: cursor,
    head: [['Indicador', 'Valor', 'Critério de alerta']],
    body: [
      [
        'Tempo médio de permanência — entregadores',
        formatMinutesToBR(metrics.stay.avgDeliveryMinutes),
        `> ${DELIVERY_MAX_MINUTES} min`,
      ],
      [
        'Tempo médio de permanência — prestadores',
        formatMinutesToBR(metrics.stay.avgServiceProviderMinutes),
        `> ${SERVICE_PROVIDER_MAX_HOURS} h`,
      ],
      ['Entregadores acima do limite', formatNumber(metrics.stay.deliveryOver45), `> ${DELIVERY_MAX_MINUTES} min`],
      [
        'Prestadores acima do limite',
        formatNumber(metrics.stay.serviceProviderOver4h),
        `> ${SERVICE_PROVIDER_MAX_HOURS} h`,
      ],
      ['Acessos que cruzaram o horário das 18h', formatNumber(metrics.stay.after18h), 'Após 18h'],
      [
        'Total de acessos fora do padrão',
        `${formatNumber(metrics.stay.violations)} (${metrics.stay.violationRate.toFixed(1).replace('.', ',')}% dos externos)`,
        'Regra de segurança',
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: margin, right: margin },
  });
  cursor = (doc as any).lastAutoTable.finalY + 8;

  /* ---------------------------------------------------------------- */
  /* 5. Ocorrências e providências                                     */
  /* ---------------------------------------------------------------- */

  sectionTitle('5. Ocorrências e Providências Adotadas');

  ensureSpace(38);
  autoTable(doc, {
    startY: cursor,
    head: [['Indicador de SLA', 'Valor']],
    body: [
      ['Total de ocorrências no período', formatNumber(metrics.incidents.total)],
      ['Ocorrências resolvidas ou fechadas', formatNumber(metrics.incidents.resolved)],
      ['Índice de resolução (SLA)', `${metrics.incidents.resolutionRate.toFixed(1).replace('.', ',')}%`],
      ['Ocorrências ainda em aberto', formatNumber(metrics.incidents.open)],
    ],
    styles: { fontSize: 9, cellPadding: 2.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    margin: { left: margin, right: margin },
  });
  cursor = (doc as any).lastAutoTable.finalY + 8;

  if (metrics.incidents.bySeverity.length > 0) {
    ensureSpace(16 + metrics.incidents.bySeverity.length * 5);
    setFont(9, 'bold');
    doc.text('Distribuição por gravidade', margin, cursor);
    cursor += 5;
    autoTable(doc, {
      startY: cursor,
      head: [['Gravidade', 'Quantidade']],
      body: metrics.incidents.bySeverity.map((item) => [item.name, formatNumber(item.value)]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 8;
  }

  if (metrics.incidents.byCategory.length > 0) {
    ensureSpace(16 + metrics.incidents.byCategory.length * 5);
    setFont(9, 'bold');
    doc.text('Distribuição por categoria', margin, cursor);
    cursor += 5;
    autoTable(doc, {
      startY: cursor,
      head: [['Categoria', 'Ocorrências']],
      body: metrics.incidents.byCategory.map((item) => [item.name, formatNumber(item.value)]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 8;
  }

  if (metrics.incidents.criticalList.length > 0) {
    ensureSpace(24 + metrics.incidents.criticalList.length * 7);
    setFont(9, 'bold');
    doc.text('Incidentes críticos e de alta gravidade em aberto', margin, cursor);
    cursor += 5;
    autoTable(doc, {
      startY: cursor,
      head: [['Data', 'Gravidade', 'Ocorrência', 'Unidade']],
      body: metrics.incidents.criticalList.map((incident) => [
        incident.created_at ? format(new Date(incident.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—',
        severityText((incident.severity || 'low').toLowerCase()),
        (incident.title || '').slice(0, 70),
        incident.apartment || incident.resident_name || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [190, 40, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ---------------------------------------------------------------- */
  /* 6. Equipamentos checados na passagem de plantão                    */
  /* ---------------------------------------------------------------- */

  sectionTitle('6. Equipamentos Verificados na Passagem de Plantão');

  if (equipmentChecks.length === 0) {
    ensureSpace(14);
    setFont(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('Nenhum registro de checagem de equipamentos no período selecionado.', margin, cursor);
    cursor += 8;
    doc.setTextColor(INK.r, INK.g, INK.b);
  } else {
    doc.addPage();
    drawHeader();
    cursor = 36;
    autoTable(doc, {
      startY: cursor,
      head: [['Data', 'Plantão', 'Equipamento', 'Situação', 'Observações']],
      body: equipmentChecks.map((check) => [
        check.shift_date,
        check.shift_type === 'noturno' ? 'Noturno' : 'Diurno',
        check.equipment_name,
        CHECK_STATUS_LABELS[check.status] || check.status,
        (check.notes || '—').slice(0, 60),
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const status = equipmentChecks[data.row.index]?.status || '';
          const color = CHECK_STATUS_COLORS[status];
          if (color) {
            doc.setTextColor(color[0], color[1], color[2]);
            doc.setFont('helvetica', 'bold');
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ---------------------------------------------------------------- */
  /* 7. Top unidades                                                  */
  /* ---------------------------------------------------------------- */

  sectionTitle('7. Ranking de Unidades com Maior Movimentação');

  if (metrics.topUnits.length === 0) {
    ensureSpace(14);
    setFont(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('Sem movimentações no período selecionado.', margin, cursor);
    cursor += 8;
    doc.setTextColor(INK.r, INK.g, INK.b);
  } else {
    autoTable(doc, {
      startY: cursor,
      head: [['#', 'Unidade', 'Morador', 'Acessos', 'Entregas', 'Encomendas', 'Convites QR', 'Total']],
      body: metrics.topUnits.map((unit, index) => [
        String(index + 1),
        unit.apartment,
        unit.residentName,
        formatNumber(unit.entries),
        formatNumber(unit.deliveries),
        formatNumber(unit.mails),
        formatNumber(unit.qrPasses),
        formatNumber(unit.total),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ---------------------------------------------------------------- */
  /* 8. Assinaturas                                                    */
  /* ---------------------------------------------------------------- */

  const pageHeight = doc.internal.pageSize.getHeight();
  const signatureTop = Math.max(cursor + 6, pageHeight - 48);
  doc.setDrawColor(203, 213, 225);
  setFont(9, 'bold');
  doc.text('Assinaturas', margin, signatureTop);
  cursor = signatureTop + 6;

  const colWidth = (contentWidth - 10) / 2;
  const lineY = cursor + 16;
  setFont(9);
  for (let i = 0; i < 2; i++) {
    const x = margin + i * (colWidth + 10);
    doc.setDrawColor(148, 163, 184);
    doc.line(x, lineY, x + colWidth, lineY);
    setFont(9);
    doc.text(i === 0 ? 'Síndico(a) Geral' : 'Administradora', x + colWidth / 2, lineY + 5, { align: 'center' });
  }
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(
    `Documento gerado automaticamente pelo PortalGuard Pro em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.`,
    margin,
    lineY + 12
  );

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawFooter(page);
  }

  doc.save(`relatorio-executivo-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
}
