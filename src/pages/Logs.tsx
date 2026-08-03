import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollText, Search, LogIn, LogOut, Download, ShieldBan, FileSpreadsheet, User, Building, Car, Clock, FileText, Hash, Camera } from 'lucide-react';
import { useAccessEntries } from '@/hooks/useAccessEntries';
import { AccessEntry } from '@/types';
import StandardPagination from '@/components/StandardPagination';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToCSV } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';

export const Logs = () => {
  const { entries: allEntries } = useAccessEntries();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [blockDialog, setBlockDialog] = useState<{ open: boolean; name: string; document: string }>({ open: false, name: '', document: '' });
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AccessEntry | null>(null);
  const itemsPerPage = 10;

  const entries = allEntries.sort(
    (a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime()
  );

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.visitorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.residentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.apartment.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.visitorDocument.toLowerCase().includes(searchTerm.toLowerCase());

    const entryDate = new Date(entry.entryTime);
    const matchesDateFrom = dateFrom ? entryDate >= new Date(dateFrom + 'T00:00:00') : true;
    const matchesDateTo = dateTo ? entryDate <= new Date(dateTo + 'T23:59:59') : true;

    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleBlockVisitor = async () => {
    if (!blockDialog.name || !blockDialog.document) return;
    setBlocking(true);
    try {
      const { error } = await supabase.from('blocked_visitors').insert({
        visitor_name: blockDialog.name,
        visitor_document: blockDialog.document,
        reason: blockReason || null,
        blocked_by: user?.id || null,
      });
      if (error) throw error;
      toast.success(`Visitante "${blockDialog.name}" bloqueado com sucesso`);
      setBlockDialog({ open: false, name: '', document: '' });
      setBlockReason('');
    } catch (err: any) {
      console.error('Error blocking visitor:', err);
      toast.error('Erro ao bloquear visitante');
    } finally {
      setBlocking(false);
    }
  };

  const exportLogsToPDF = () => {
    const doc = new jsPDF();
    doc.text('Logs de Acesso', 14, 15);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 22);

    const tableData = filteredEntries.map(entry => [
      entry.visitorName,
      entry.visitorDocument,
      entry.residentName,
      entry.apartment,
      format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      entry.exitTime ? format(new Date(entry.exitTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Ativo',
    ]);

    autoTable(doc, {
      head: [['Visitante', 'Documento', 'Morador', 'Apt', 'Entrada', 'Saída']],
      body: tableData,
      startY: 28,
    });

    doc.save(`logs-acesso-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('PDF gerado com sucesso');
  };

  const exportLogsToCSV = () => {
    const headers = ['Visitante', 'Documento', 'Morador', 'Apt', 'Entrada', 'Saída'];
    const rows = filteredEntries.map(entry => [
      entry.visitorName, entry.visitorDocument, entry.residentName, entry.apartment,
      format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      entry.exitTime ? format(new Date(entry.exitTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Ativo',
    ]);
    exportToCSV(`logs-acesso-${format(new Date(), 'dd-MM-yyyy')}`, headers, rows);
    toast.success('CSV gerado com sucesso');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Logs de Acesso</h2>
        <p className="text-muted-foreground">Histórico completo de entradas e saídas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <span>Histórico de Acessos</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{entries.length} registros</Badge>
              <Button variant="outline" size="sm" onClick={exportLogsToPDF}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportLogsToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por visitante, morador, apartamento ou documento..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">De:</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Até:</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="w-auto"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}>
                  Limpar datas
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {paginatedEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {searchTerm ? 'Nenhum registro encontrado' : 'Nenhum acesso registrado ainda'}
              </p>
            ) : (
              paginatedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 bg-card rounded-lg border border-border hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {entry.photo ? (
                        <img src={entry.photo} alt={entry.visitorName} className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-3xl">
                          {entry.visitorType === 'delivery' ? '📦' : entry.visitorType === 'service_provider' ? '🔧' : '👤'}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-lg">
                          {entry.visitorName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Doc: {entry.visitorDocument}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setBlockDialog({ open: true, name: entry.visitorName, document: entry.visitorDocument }); }}
                      >
                        <ShieldBan className="h-4 w-4 mr-1" />
                        Bloquear
                      </Button>
                      <Badge
                        variant={entry.exitTime ? 'secondary' : 'default'}
                        className={entry.exitTime ? '' : 'bg-success'}
                      >
                        {entry.exitTime ? 'Finalizado' : 'Ativo'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Visitando:</span> {entry.residentName}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Apartamento:</span> {entry.apartment}
                      </p>
                      {entry.vehiclePlate && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Veículo:</span> {entry.vehiclePlate}
                        </p>
                      )}
                      {entry.purpose && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Motivo:</span> {entry.purpose}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-success">
                        <LogIn className="h-4 w-4" />
                        <div>
                          <p className="font-medium">Entrada</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.entryTime).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      {entry.exitTime && (
                        <div className="flex items-center space-x-2 text-muted-foreground">
                          <LogOut className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Saída</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.exitTime).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <StandardPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="mt-4" />
        </CardContent>
      </Card>

      {/* Dialog de bloqueio */}
      <Dialog open={blockDialog.open} onOpenChange={(open) => { if (!open) setBlockDialog({ open: false, name: '', document: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldBan className="h-5 w-5 text-destructive" />
              Bloquear Visitante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deseja bloquear o visitante <strong>{blockDialog.name}</strong> (Doc: {blockDialog.document})?
            </p>
            <div>
              <label className="text-sm font-medium">Motivo do bloqueio (opcional)</label>
              <Textarea
                placeholder="Informe o motivo do bloqueio..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialog({ open: false, name: '', document: '' })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBlockVisitor} disabled={blocking}>
              {blocking ? 'Bloqueando...' : 'Confirmar Bloqueio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => { if (!open) setSelectedEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Detalhes do Acesso
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-5">
              {/* Photo + Name header */}
              <div className="flex items-center gap-4">
                {selectedEntry.photo ? (
                  <img src={selectedEntry.photo} alt={selectedEntry.visitorName} className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-3xl">
                    {selectedEntry.visitorType === 'delivery' ? '📦' : selectedEntry.visitorType === 'service_provider' ? '🔧' : '👤'}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-foreground">{selectedEntry.visitorName}</h3>
                  <Badge variant={selectedEntry.visitorType === 'delivery' ? 'default' : selectedEntry.visitorType === 'service_provider' ? 'outline' : 'secondary'}>
                    {selectedEntry.visitorType === 'delivery' ? 'Entregador' : selectedEntry.visitorType === 'service_provider' ? 'Prestador de Serviço' : 'Visitante'}
                  </Badge>
                  <Badge variant={selectedEntry.exitTime ? 'secondary' : 'default'} className={`ml-2 ${selectedEntry.exitTime ? '' : 'bg-success'}`}>
                    {selectedEntry.exitTime ? 'Finalizado' : 'Ativo'}
                  </Badge>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Documento</p>
                    <p className="font-medium">{selectedEntry.visitorDocument}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Visitando</p>
                      <p className="font-medium">{selectedEntry.residentName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Apartamento</p>
                      <p className="font-medium">{selectedEntry.apartment}</p>
                    </div>
                  </div>
                </div>

                {selectedEntry.company && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Empresa</p>
                      <p className="font-medium">{selectedEntry.company}</p>
                    </div>
                  </div>
                )}

                {selectedEntry.badgeNumber && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Nº Crachá</p>
                      <p className="font-medium">{selectedEntry.badgeNumber}</p>
                    </div>
                  </div>
                )}

                {selectedEntry.purpose && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Motivo</p>
                      <p className="font-medium">{selectedEntry.purpose}</p>
                    </div>
                  </div>
                )}

                {(selectedEntry.vehiclePlate || selectedEntry.vehicleModel || selectedEntry.vehicleColor) && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Veículo</p>
                      <p className="font-medium">
                        {[selectedEntry.vehiclePlate, selectedEntry.vehicleModel, selectedEntry.vehicleColor].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                    <LogIn className="h-4 w-4 text-success shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Entrada</p>
                      <p className="font-medium text-success">
                        {format(new Date(selectedEntry.entryTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${selectedEntry.exitTime ? 'bg-muted/50' : 'bg-warning/10 border border-warning/20'}`}>
                    <LogOut className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Saída</p>
                      <p className="font-medium">
                        {selectedEntry.exitTime
                          ? format(new Date(selectedEntry.exitTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : 'Ainda no local'}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedEntry.autoRecognized && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Camera className="h-3 w-3" />
                    Reconhecido automaticamente
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};