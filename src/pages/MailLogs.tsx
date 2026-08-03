import { useState } from 'react';
import { exportToCSV } from '@/lib/export-csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Download, ScrollText, FileSpreadsheet, Package, User, Calendar, FileText, Hash } from 'lucide-react';
import StandardPagination from '@/components/StandardPagination';
import { useMails } from '@/hooks/useMails';
import { useResidents } from '@/hooks/useResidents';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Mail, Resident } from '@/types';

export const MailLogs = () => {
  const { mails } = useMails();
  const { residents } = useResidents();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMail, setSelectedMail] = useState<{ mail: Mail; resident?: Resident } | null>(null);
  const itemsPerPage = 10;

  const filtered = mails.filter((mail) => {
    const resident = residents.find((r) => r.id === mail.residentId);

    // Search
    const term = search.toLowerCase();
    const matchesSearch =
      !term ||
      resident?.name.toLowerCase().includes(term) ||
      resident?.apartment.toLowerCase().includes(term) ||
      mail.sender.toLowerCase().includes(term) ||
      mail.withdrawnBy?.toLowerCase().includes(term);

    // Status
    const matchesStatus = statusFilter === 'all' || mail.status === statusFilter;

    // Type
    const matchesType = typeFilter === 'all' || mail.packageType === typeFilter;

    // Date range
    const mailDate = new Date(mail.receivedAt);
    const matchesFrom = !dateFrom || mailDate >= new Date(dateFrom);
    const matchesTo = !dateTo || mailDate <= new Date(dateTo + 'T23:59:59');

    return matchesSearch && matchesStatus && matchesType && matchesFrom && matchesTo;
  });

  // Sort newest first
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Log de Correspondências', 14, 15);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 22);

    const tableData = sorted.map((mail) => {
      const resident = residents.find((r) => r.id === mail.residentId);
      return [
        resident?.name || 'Desconhecido',
        resident?.apartment || '-',
        mail.sender,
        mail.packageType,
        mail.status === 'delivered' ? 'Entregue' : 'Pendente',
        format(new Date(mail.receivedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        mail.deliveredAt
          ? format(new Date(mail.deliveredAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })
          : '-',
        mail.withdrawnBy || '-',
      ];
    });

    autoTable(doc, {
      head: [['Morador', 'Apto', 'Remetente', 'Tipo', 'Status', 'Recebido', 'Entregue', 'Retirado por']],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8 },
    });

    doc.save(`log-correspondencias-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };

  const exportLogsToCSV = () => {
    const headers = ['Morador', 'Apto', 'Remetente', 'Tipo', 'Status', 'Recebido', 'Entregue', 'Retirado por'];
    const rows = sorted.map((mail) => {
      const resident = residents.find((r) => r.id === mail.residentId);
      return [resident?.name || 'Desconhecido', resident?.apartment || '-', mail.sender, mail.packageType,
        mail.status === 'delivered' ? 'Entregue' : 'Pendente',
        format(new Date(mail.receivedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        mail.deliveredAt ? format(new Date(mail.deliveredAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-',
        mail.withdrawnBy || '-'];
    });
    exportToCSV(`log-correspondencias-${format(new Date(), 'dd-MM-yyyy')}`, headers, rows);
  };

  const statusLabel = (status: string) => {
    if (status === 'delivered') {
      return <Badge variant="default" className="bg-primary hover:bg-primary/90">Entregue</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Log de Correspondências</h2>
        <p className="text-muted-foreground">Histórico completo para consulta e rastreamento</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <span>Filtros</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpar Filtros
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF}>
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
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar morador, apto, remetente..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="Carta">Carta</SelectItem>
                  <SelectItem value="Pacote Pequeno">Pacote Pequeno</SelectItem>
                  <SelectItem value="Pacote Médio">Pacote Médio</SelectItem>
                  <SelectItem value="Pacote Grande">Pacote Grande</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:max-w-md">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {sorted.length} registro{sorted.length !== 1 ? 's' : ''} encontrado{sorted.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Morador</TableHead>
                  <TableHead>Apto</TableHead>
                  <TableHead>Remetente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Entregue em</TableHead>
                  <TableHead>Retirado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((mail) => {
                    const resident = residents.find((r) => r.id === mail.residentId);
                    return (
                      <TableRow key={mail.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMail({ mail, resident })}>
                        <TableCell className="font-medium">{resident?.name || 'Desconhecido'}</TableCell>
                        <TableCell>{resident?.apartment || '-'}</TableCell>
                        <TableCell>{mail.sender}</TableCell>
                        <TableCell>{mail.packageType}</TableCell>
                        <TableCell>{statusLabel(mail.status)}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(mail.receivedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {mail.deliveredAt
                            ? format(new Date(mail.deliveredAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                            : '-'}
                        </TableCell>
                        <TableCell>{mail.withdrawnBy || '-'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <StandardPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="mt-4" />
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMail} onOpenChange={(o) => { if (!o) setSelectedMail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Correspondência</DialogTitle>
          </DialogHeader>
          {selectedMail && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selectedMail.mail.photoUrl ? (
                  <img src={selectedMail.mail.photoUrl} alt="" className="w-16 h-16 rounded-xl object-cover border-2 border-border" />
                ) : (
                  <div className="p-3 rounded-xl bg-muted">
                    <Package className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-lg">{selectedMail.mail.packageType}</p>
                  {selectedMail.mail.status === 'delivered'
                    ? <Badge variant="default" className="bg-primary hover:bg-primary/90">Entregue</Badge>
                    : <Badge variant="secondary">Pendente</Badge>
                  }
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Morador:</span>
                  <span className="font-medium">{selectedMail.resident?.name || 'Desconhecido'} - Apto {selectedMail.resident?.apartment || '-'}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Remetente:</span>
                  <span className="font-medium">{selectedMail.mail.sender}</span>
                </div>

                {selectedMail.mail.trackingCode && (
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Rastreio:</span>
                    <span className="font-medium font-mono">{selectedMail.mail.trackingCode}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Recebido:</span>
                  <span className="font-medium">{format(new Date(selectedMail.mail.receivedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>

                {selectedMail.mail.deliveredAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Entregue:</span>
                    <span className="font-medium">{format(new Date(selectedMail.mail.deliveredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}

                {selectedMail.mail.withdrawnBy && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Retirado por:</span>
                    <span className="font-medium">{selectedMail.mail.withdrawnBy}</span>
                  </div>
                )}

                {selectedMail.mail.notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">Obs:</span>
                    <span className="font-medium">{selectedMail.mail.notes}</span>
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
