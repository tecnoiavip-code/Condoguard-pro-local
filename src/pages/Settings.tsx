import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Trash2, Download, Upload, Send, FileText, FileSpreadsheet, Lock, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseStorage } from '@/lib/supabase-storage';
import { useResidents } from '@/hooks/useResidents';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useEffect, useMemo } from 'react';
import { parseBackupPayload } from '@/lib/backup-import';
import { restoreCollections } from '@/lib/restore-collections';
import {
  csvToCollections,
  extractPdfLines,
  parsePdfBackupLines,
  parseGenericPdfLines,
  mergeCollections,
  collectionsCount,
  type ImportCollection,
} from '@/lib/import-files';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExecutiveDashboard } from '@/components/reports/ExecutiveDashboard';
import { exportExecutiveReport, type EquipmentCheckRow } from '@/lib/executive-pdf-export';
import {
  computeExecutiveMetrics,
  previousRangeOf,
  resolveRange,
  EXECUTIVE_PERIOD_LABELS,
  type ExecutivePeriod,
} from '@/lib/executive-metrics';
import { useAccessEntries } from '@/hooks/useAccessEntries';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ResidentAccessCard from '@/components/resident/ResidentAccessCard';

// Funções auxiliares para CSV
const arrayToCSV = (data: any[], headers: string[]) => {
  const csvRows = [];
  csvRows.push(headers.join(','));
  
  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + row[header]).replace(/"/g, '\\"');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
};

const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const Settings = () => {
  const { residents } = useResidents();
  const [isIntegrationsUnlocked, setIsIntegrationsUnlocked] = useState(false);
  const [integrationPassword, setIntegrationPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // ========== PAINEL EXECUTIVO (BI) ==========
  const [settingsTab, setSettingsTab] = useState<'geral' | 'executive'>('geral');
  const [executivePeriod, setExecutivePeriod] = useState<ExecutivePeriod>('30d');
  const [executiveFrom, setExecutiveFrom] = useState('');
  const [executiveTo, setExecutiveTo] = useState('');
  const [executivePdfLoading, setExecutivePdfLoading] = useState(false);
  const [executiveMails, setExecutiveMails] = useState<any[]>([]);
  const [executiveIncidents, setExecutiveIncidents] = useState<any[]>([]);
  const [executiveEquipment, setExecutiveEquipment] = useState<EquipmentCheckRow[]>([]);
  const { entries: accessEntries } = useAccessEntries();
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email || '';

  const [detectedHost, setDetectedHost] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/network-info', { headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        const info = body?.data ?? body;
        if (!cancelled && info?.host && info.port) setDetectedHost(`${info.host}:${info.port}`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const webhookHost = detectedHost || window.location.host || '127.0.0.1:8080';
  const webhookHostname = webhookHost.replace(/:\d+$/, '');
  const webhookPort = webhookHost.includes(':') ? webhookHost.slice(webhookHost.lastIndexOf(':') + 1) : (window.location.protocol === 'https:' ? '443' : '80');
  const monitorPath = '/api/controlid-webhook';
  const pushAddress = `http://${webhookHost}${monitorPath}`;
  const acceptedPushRoutes = `${monitorPath} e ${monitorPath}/push`;

  const handleUnlockIntegrations = () => {
    if (integrationPassword === 'admin') {
      setIsIntegrationsUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };


  const handleExportData = async () => {
    toast.info('Gerando PDF...');
    const [residents, mails, entries] = await Promise.all([
      supabaseStorage.getResidents().then(r => r || []),
      supabaseStorage.getMails(),
      supabaseStorage.getEntries().then(e => e || []),
    ]);
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text('PortalGuard - Backup de Dados', 14, 20);
    doc.setFontSize(10);
    doc.text(`Data de exportação: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
    
    // Residents
    doc.setFontSize(14);
    doc.text('Moradores Cadastrados', 14, 38);
    
    if (residents.length > 0) {
      autoTable(doc, {
        startY: 42,
        head: [['Nome', 'Apartamento', 'Telefone', 'Veículo']],
        body: residents.map(r => [
          r.name,
          r.apartment,
          r.phone || '-',
          r.vehiclePlate ? `${r.vehiclePlate} (${r.vehicleModel || '-'})` : '-'
        ]),
        theme: 'grid',
        styles: { fontSize: 8 }
      });
    }
    
    // Mails
    const finalY1 = (doc as any).lastAutoTable?.finalY || 42;
    doc.setFontSize(14);
    doc.text('Correspondências', 14, finalY1 + 10);
    
    if (mails.length > 0) {
      autoTable(doc, {
        startY: finalY1 + 14,
        head: [['Morador ID', 'Remetente', 'Tipo', 'Status', 'Data']],
        body: mails.map(m => [
          m.residentId.substring(0, 12),
          m.sender,
          m.packageType,
          m.status === 'pending' ? 'Pendente' : 'Entregue',
          new Date(m.receivedAt).toLocaleDateString('pt-BR')
        ]),
        theme: 'grid',
        styles: { fontSize: 8 }
      });
    }
    
    // Entries
    const finalY2 = (doc as any).lastAutoTable?.finalY || finalY1 + 14;
    doc.setFontSize(14);
    doc.text('Registros de Acesso', 14, finalY2 + 10);
    
    if (entries.length > 0) {
      autoTable(doc, {
        startY: finalY2 + 14,
        head: [['Nome', 'Tipo', 'Apartamento', 'Entrada', 'Saída']],
        body: entries.map(e => [
          e.visitorName,
          e.visitorType === 'delivery' ? 'Entregador' : e.visitorType === 'service_provider' ? 'Prestador' : 'Visitante',
          e.apartment,
          new Date(e.entryTime).toLocaleString('pt-BR'),
          e.exitTime ? new Date(e.exitTime).toLocaleString('pt-BR') : 'Ativo'
        ]),
        theme: 'grid',
        styles: { fontSize: 8 }
      });
    }
    
    // Save PDF
    doc.save(`portalguard-backup-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Backup em PDF gerado com sucesso!');
  };

  // Todas as tabelas de dados a serem incluídas no backup completo
  const BACKUP_TABLES = [
    'residents',
    'vehicles',
    'mails',
    'access_entries',
    'devices',
    'controlid_config',
    'visitor_authorizations',
    'blocked_visitors',
    'announcements',
    'announcement_attachments',
    'announcement_reads',
    'chat_messages',
    'incidents',
    'notifications',
    'portaria_equipment',
    'profiles',
    'push_subscriptions',
    'shift_equipment_checks',
    'shifts',
    'user_roles',
    'vapid_keys',
  ] as const;

  const handleExportJSON = async () => {
    try {
      toast.info('Gerando backup completo...');
      const data: Record<string, any[]> = {};
      const counts: Record<string, number> = {};
      const failed: string[] = [];

      for (const table of BACKUP_TABLES) {
        const { data: rows, error } = await supabase.from(table as any).select('*');
        if (error) {
          console.error(`[backup] Falha ao ler ${table}:`, error.message);
          failed.push(table);
          data[table] = [];
          counts[table] = 0;
        } else {
          data[table] = rows || [];
          counts[table] = rows?.length ?? 0;
        }
      }

      const payload = {
        version: 3,
        generatedAt: new Date().toISOString(),
        source: import.meta.env.VITE_SUPABASE_URL,
        counts,
        data,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portalguard-backup-completo-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.success(`Backup gerado: ${total} registros em ${BACKUP_TABLES.length - failed.length}/${BACKUP_TABLES.length} tabelas.`);
      if (failed.length > 0) {
        toast.warning(`Tabelas sem acesso ignoradas: ${failed.join(', ')}`);
      }
    } catch (err) {
      console.error('Export JSON error:', err);
      toast.error('Erro ao gerar backup JSON.');
    }
  };

  const handleImportData = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          if (!text || text.trim() === '') {
            toast.error('Arquivo vazio ou inválido');
            return;
          }

          const parsed = JSON.parse(text);
          let rootData: Record<string, any> = {};

          if (Array.isArray(parsed)) {
            rootData = { residents: parsed };
          } else if (parsed?.data && typeof parsed.data === 'object') {
            rootData = parsed.data;
          } else if (typeof parsed === 'object' && parsed !== null) {
            rootData = parsed;
          }

          const { totalOk, totalFail, failedTables } = await restoreCollections(supabase, rootData, {
            onStatus: (msg) => toast.info(msg),
          });

          if (totalOk > 0) {
            toast.success(`Restauração concluída! ${totalOk} registros importados.`);
          }
          if (failedTables.length > 0) {
            console.warn('[restore] Tabelas com falhas em alguns registros:', failedTables);
            toast.warning(
              `Atenção: ${totalFail} registro(s) em ${failedTables.length} tabela(s) apresentaram erros (detalhes no console).`
            );
          }
          if (totalOk === 0 && totalFail === 0) {
            toast.warning('Nenhum dado reconhecido encontrado no arquivo de backup.');
          }
        } catch (error) {
          console.error('Import error:', error);
          toast.error('Erro ao processar o arquivo JSON de backup.');
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const handleExportCSV = async () => {
    const [residents, mails, entries] = await Promise.all([
      supabaseStorage.getResidents().then(r => r || []),
      supabaseStorage.getMails(),
      supabaseStorage.getEntries().then(e => e || []),
    ]);
    // Export Residents
    if (residents.length > 0) {
      const residentsData = residents.map(r => ({
        id: r.id,
        name: r.name,
        apartment: r.apartment,
        cpf: r.cpf || '',
        phone: r.phone || '',
        email: r.email || '',
        vehiclePlate: r.vehiclePlate || '',
        vehicleModel: r.vehicleModel || '',
        vehicleColor: r.vehicleColor || ''
      }));
      const csv = arrayToCSV(residentsData, ['id', 'name', 'apartment', 'cpf', 'phone', 'email', 'vehiclePlate', 'vehicleModel', 'vehicleColor']);
      downloadCSV(csv, `moradores-${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    // Export Mails
    if (mails.length > 0) {
      const mailsData = mails.map(m => ({
        id: m.id,
        residentId: m.residentId,
        sender: m.sender,
        packageType: m.packageType,
        status: m.status,
        receivedAt: m.receivedAt,
        deliveredAt: m.deliveredAt || ''
      }));
      const csv = arrayToCSV(mailsData, ['id', 'residentId', 'sender', 'packageType', 'status', 'receivedAt', 'deliveredAt']);
      downloadCSV(csv, `correspondencias-${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    // Export Entries
    if (entries.length > 0) {
      const entriesData = entries.map(e => ({
        id: e.id,
        visitorName: e.visitorName,
        visitorType: e.visitorType,
        visitorDocument: e.visitorDocument || '',
        apartment: e.apartment,
        purpose: e.purpose || '',
        entryTime: e.entryTime,
        exitTime: e.exitTime || '',
        company: e.company || '',
        vehiclePlate: e.vehiclePlate || '',
        vehicleModel: e.vehicleModel || '',
        vehicleColor: e.vehicleColor || ''
      }));
      const csv = arrayToCSV(entriesData, ['id', 'visitorName', 'visitorType', 'visitorDocument', 'apartment', 'purpose', 'entryTime', 'exitTime', 'company', 'vehiclePlate', 'vehicleModel', 'vehicleColor']);
      downloadCSV(csv, `acessos-${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    toast.success('Arquivos CSV exportados com sucesso!');
  };

  const handleImportCSV = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.multiple = true;

    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      const all: Partial<Record<ImportCollection, Record<string, any>[]>> = {};
      let recognizedFiles = 0;
      const unrecognized: string[] = [];

      for (const file of files) {
        try {
          const text = await file.text();
          if (!text || text.trim() === '') {
            toast.error(`Arquivo ${file.name} está vazio`);
            continue;
          }

          const { collections } = csvToCollections(text, file.name);
          if (collectionsCount(collections) === 0) {
            unrecognized.push(file.name);
            continue;
          }
          mergeCollections(all, collections);
          recognizedFiles++;
        } catch (error) {
          console.error('CSV import error:', error);
          toast.error(`Erro ao importar ${file.name}. Verifique o formato CSV.`);
        }
      }

      if (recognizedFiles === 0) {
        toast.warning(
          'Nenhum CSV reconhecido. Usa cabeçalhos como nome/apartamento (moradores), remetente (correspondências) ou visitante/entrada (acessos).'
        );
        return;
      }

      const { totalOk, totalFail, failedTables } = await restoreCollections(supabase, all, {
        onStatus: (msg) => toast.info(msg),
      });

      if (totalOk > 0) {
        toast.success(`CSV: ${totalOk} registros importados de ${recognizedFiles} arquivo(s).`);
      }
      if (failedTables.length > 0) {
        console.warn('[restore] Tabelas com falhas em alguns registros:', failedTables);
        toast.warning(`Atenção: ${totalFail} registro(s) apresentaram erros (detalhes no console).`);
      } else if (totalOk === 0) {
        toast.warning('Nenhum registro pôde ser importado dos arquivos CSV.');
      }
      if (unrecognized.length > 0) {
        toast.warning(`Não reconhecido(s): ${unrecognized.join(', ')}`);
      }
    };

    input.click();
  };

  const handleImportPDF = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.multiple = true;

    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      toast.info('Processando arquivos PDF...');

      const all: Partial<Record<ImportCollection, Record<string, any>[]>> = {};
      let recognizedFiles = 0;

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();

          toast.info(`Extraindo texto de ${file.name}...`);
          const { lines } = await extractPdfLines(arrayBuffer);

          const backup = parsePdfBackupLines(lines);
          const merged = collectionsCount(backup.collections) > 0
            ? backup
            : parseGenericPdfLines(lines);

          if (collectionsCount(merged.collections) === 0) {
            toast.warning(`Nenhum dado reconhecido em ${file.name}.`, { duration: 8000 });
            continue;
          }

          mergeCollections(all, merged.collections);
          recognizedFiles++;
        } catch (error) {
          console.error('PDF import error:', error);
          toast.error(`Erro ao processar ${file.name}. Tente um formato diferente.`);
        }
      }

      if (recognizedFiles === 0) {
        toast.warning(
          'Nenhum dado pôde ser lido dos PDFs. Formatos aceitos: backup do PortalGuard ou listas com nome/apartamento.'
        );
        return;
      }

      const { totalOk, totalFail, failedTables } = await restoreCollections(supabase, all, {
        onStatus: (msg) => toast.info(msg),
      });

      if (totalOk > 0) {
        toast.success(`PDF: ${totalOk} registros importados de ${recognizedFiles} arquivo(s).`);
      }
      if (failedTables.length > 0) {
        console.warn('[restore] Tabelas com falhas em alguns registros:', failedTables);
        toast.warning(`Atenção: ${totalFail} registro(s) apresentaram erros (detalhes no console).`);
      } else if (totalOk === 0) {
        toast.warning('Nenhum registro pôde ser importado dos PDFs.');
      }
    };

    input.click();
  };

  const handleClearData = async () => {
    if (!confirm('ATENÇÃO: Isso removerá TODOS os dados do sistema. Esta ação não pode ser desfeita. Deseja continuar?')) {
      return;
    }

    if (!confirm('Última confirmação: Tem certeza absoluta?')) {
      return;
    }

    const { error } = await supabase.adminClear();
    if (error) {
      toast.error('Erro ao limpar o banco de dados: ' + error.message);
      return;
    }
    toast.success('Todos os dados foram removidos. Recarregue a página.');
    setTimeout(() => window.location.reload(), 1500);
  };

  // ========== PAINEL EXECUTIVO (BI) ==========
  useEffect(() => {
    if (settingsTab !== 'executive') return;
    let cancelled = false;

    const loadExecutiveData = async () => {
      const [mailsRes, checksRes, equipmentRes, shiftsRes, incidentsRes] = await Promise.all([
        supabase.from('mails').select('*'),
        supabase.from('shift_equipment_checks').select('*'),
        supabase.from('portaria_equipment').select('id, name'),
        supabase.from('shifts').select('id, shift_start, shift_type'),
        supabase
          .from('incidents')
          .select('id, title, description, severity, status, created_at, resolved_at, apartment, resident_name'),
      ]);
      if (cancelled) return;
      if (!mailsRes.error) setExecutiveMails(mailsRes.data || []);
      if (!incidentsRes.error) setExecutiveIncidents(incidentsRes.data || []);
      if (!checksRes.error) {
        const nameById = new Map<string, string>(
          (equipmentRes.data || []).map((eq: any) => [eq.id, eq.name])
        );
        const shiftById = new Map<string, any>(
          (shiftsRes.data || []).map((shift: any) => [shift.id, shift])
        );
        setExecutiveEquipment(
          (checksRes.data || []).map((check: any) => {
            const shift = shiftById.get(check.shift_id);
            return {
              shift_date: shift?.shift_start
                ? format(new Date(shift.shift_start), 'dd/MM/yyyy', { locale: ptBR })
                : '—',
              shift_type: shift?.shift_type || 'diurno',
              equipment_name: nameById.get(check.equipment_id) || 'Equipamento',
              status: check.status || 'functional',
              notes: check.notes,
            };
          })
        );
      }
    };

    loadExecutiveData();
    return () => {
      cancelled = true;
    };
  }, [settingsTab]);

  const executiveRange = useMemo(
    () => resolveRange(executivePeriod, { from: executiveFrom, to: executiveTo }),
    [executivePeriod, executiveFrom, executiveTo]
  );

  const executiveMetrics = useMemo(
    () =>
      computeExecutiveMetrics({
        entries: accessEntries as any,
        mails: executiveMails as any,
        incidents: executiveIncidents as any,
        residents: residents as any,
        period: executiveRange,
        previousPeriod: previousRangeOf(executiveRange),
      }),
    [accessEntries, executiveMails, executiveIncidents, residents, executiveRange]
  );

  const handleExportExecutivePDF = () => {
    setExecutivePdfLoading(true);
    try {
      exportExecutiveReport({
        metrics: executiveMetrics,
        condominiumName: 'Condomínio',
        equipmentChecks: executiveEquipment,
        preparedBy: userName,
      });
      toast.success('Relatório executivo gerado com sucesso');
    } catch (err) {
      console.error('Erro ao gerar relatório executivo:', err);
      toast.error('Não foi possível gerar o relatório executivo');
    } finally {
      setExecutivePdfLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Configurações</h2>
        <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
      </div>

      <div className="flex gap-2 border-b flex-wrap">
        <Button variant={settingsTab === 'geral' ? 'default' : 'ghost'} onClick={() => setSettingsTab('geral')}>
          <SettingsIcon className="mr-2 h-4 w-4" />
          Geral
        </Button>
        <Button variant={settingsTab === 'executive' ? 'default' : 'ghost'} onClick={() => setSettingsTab('executive')}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Painel Executivo (BI)
        </Button>
      </div>

      {settingsTab === 'executive' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Período</Label>
                  <Select value={executivePeriod} onValueChange={(v) => setExecutivePeriod(v as ExecutivePeriod)}>
                    <SelectTrigger className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EXECUTIVE_PERIOD_LABELS) as ExecutivePeriod[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {EXECUTIVE_PERIOD_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {executivePeriod === 'custom' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">De</Label>
                      <Input
                        type="date"
                        value={executiveFrom}
                        onChange={(e) => setExecutiveFrom(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Até</Label>
                      <Input
                        type="date"
                        value={executiveTo}
                        onChange={(e) => setExecutiveTo(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                  </>
                )}
                <p className="text-xs text-muted-foreground pb-2">
                  Apuração: {executiveMetrics.periodLabel} · {executiveMetrics.daysInPeriod} dias
                </p>
              </div>
              <Button onClick={handleExportExecutivePDF} disabled={executivePdfLoading}>
                <Download className="mr-2 h-4 w-4" />
                {executivePdfLoading ? 'Gerando...' : 'Exportar Relatório para Assembleia (PDF)'}
              </Button>
            </CardContent>
          </Card>

          <ExecutiveDashboard
            entries={accessEntries as any}
            mails={executiveMails as any}
            incidents={executiveIncidents as any}
            residents={residents as any}
            period={executivePeriod}
            customFrom={executiveFrom}
            customTo={executiveTo}
          />
        </div>
      )}

      {settingsTab === 'geral' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResidentAccessCard />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              <span>Backup e Restauração</span>
            </CardTitle>
            <CardDescription>
              Exporte e importe dados em CSV, PDF ou JSON
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleExportData} className="w-full" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
              <Button onClick={handleExportCSV} className="w-full" variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
              <Button onClick={handleExportJSON} className="w-full col-span-2" variant="default">
                <Download className="h-4 w-4 mr-2" />
                Exportar JSON Completo (para banco local)
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleImportData} className="w-full" variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Importar JSON
              </Button>
              <Button onClick={handleImportCSV} className="w-full" variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <Button onClick={handleImportPDF} className="w-full" variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Importar PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <span>Zona de Perigo</span>
            </CardTitle>
            <CardDescription>
              Ações irreversíveis - use com cuidado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleClearData}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Todos os Dados
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Esta ação removerá permanentemente todos os moradores, correspondências e registros de acesso.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Send className="h-5 w-5 text-primary" />
              <span>Integrações</span>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>
              Configure integrações com dispositivos e notificações (Protegido por senha)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isIntegrationsUnlocked ? (
              <div className="p-6 bg-muted rounded-lg space-y-4">
                <div className="flex items-center justify-center mb-4">
                  <Lock className="h-12 w-12 text-primary" />
                </div>
                <p className="text-center text-sm text-muted-foreground mb-4">
                  Digite a senha para acessar as configurações de integrações.
                </p>
                <div className="flex gap-2 max-w-sm mx-auto">
                  <Input
                    type="password"
                    placeholder="Senha"
                    value={integrationPassword}
                    onChange={(e) => { setIntegrationPassword(e.target.value); setPasswordError(false); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockIntegrations()}
                  />
                  <Button onClick={handleUnlockIntegrations}>
                    <Lock className="h-4 w-4 mr-2" />
                    Desbloquear
                  </Button>
                </div>
                {passwordError && (
                  <p className="text-center text-sm text-destructive">Senha incorreta</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 p-3 bg-success/10 border border-success rounded-lg">
                  <span className="text-sm font-medium text-success">🔓 Acesso de administrador concedido</span>
                </div>
                
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <Label className="text-base font-semibold mb-2 block">Control iD - Webhook</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Dados atualizados para monitor, push e callbacks dos dispositivos Control iD.
                  </p>
                  <div className="p-3 bg-primary/10 rounded-lg space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Hostname:</p>
                      <code className="text-xs bg-background p-2 rounded block overflow-x-auto">{webhookHostname}</code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Porta:</p>
                      <code className="text-xs bg-background p-2 rounded block">{webhookPort}</code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Monitor path:</p>
                      <code className="text-xs bg-background p-2 rounded block overflow-x-auto">{monitorPath}</code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Push remote address:</p>
                      <code className="text-xs bg-background p-2 rounded block overflow-x-auto">{pushAddress}</code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Rotas aceitas pelo webhook:</p>
                      <code className="text-xs bg-background p-2 rounded block overflow-x-auto">{acceptedPushRoutes}</code>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Timeouts:</p>
                      <code className="text-xs bg-background p-2 rounded block overflow-x-auto">monitor.request_timeout=15000 • push_request_timeout=120000 • push_request_period=5</code>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-base font-semibold mb-2 block">WhatsApp Business API</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Envie notificações automáticas via WhatsApp quando uma correspondência for registrada.
                  </p>
                  <Input placeholder="Token da API" type="password" className="mb-2" />
                  <Input placeholder="Número de telefone (ex: 5511999999999)" className="mb-2" />
                  <Button variant="outline" className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    Conectar WhatsApp
                  </Button>
                </div>
                
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-base font-semibold mb-2 block">Email - SMTP</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Configure o servidor SMTP para enviar emails automáticos aos moradores.
                  </p>
                  <Input placeholder="Servidor SMTP (ex: smtp.gmail.com)" className="mb-2" />
                  <Input placeholder="Porta (ex: 587)" className="mb-2" />
                  <Input placeholder="Email" type="email" className="mb-2" />
                  <Input placeholder="Senha" type="password" className="mb-2" />
                  <Button variant="outline" className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    Configurar Email
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-muted-foreground mb-1">Versão</p>
                <p className="font-semibold">PortalGuard Local v2.0</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-muted-foreground mb-1">Armazenamento</p>
                <p className="font-semibold">Banco Local (SQLite)</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-muted-foreground mb-1">Status</p>
                <p className="font-semibold text-success">Operacional</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
};
