import { useState, useEffect, useMemo } from 'react';
import StandardPagination from '@/components/StandardPagination';
import { exportToCSV } from '@/lib/export-csv';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ClipboardList, Users, AlertTriangle, Plus, Wrench, Download, Search, X, FileSpreadsheet, Sun, Moon, CheckCircle, XCircle, AlertCircle, Clock, ClipboardCheck, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAccessEntries } from '@/hooks/useAccessEntries';
import { useResidents } from '@/hooks/useResidents';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseStorage } from '@/lib/supabase-storage';
import { getStayDurationMinutes, staysAfter18h, formatDuration, DELIVERY_MAX_MINUTES, SERVICE_PROVIDER_MAX_HOURS } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type StayPeriod = '24h' | '7d' | '30d' | 'all';
type StayTypeFilter = 'all' | 'delivery' | 'service_provider';
type StayStatusFilter = 'all' | 'active' | 'closed';

const STAY_PERIOD_LABELS: Record<StayPeriod, string> = {
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  'all': 'Todo o período',
};

const STAY_PERIOD_HOURS: Record<StayPeriod, number | null> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  'all': null,
};

const STAY_TYPE_LABELS: Record<StayTypeFilter, string> = {
  all: 'Todos',
  delivery: 'Entregadores',
  service_provider: 'Prestadores',
};

const STAY_TYPE_LABELS_SINGULAR: Record<string, string> = {
  delivery: 'Entregador',
  service_provider: 'Prestador',
};

const STAY_STATUS_LABELS: Record<StayStatusFilter, string> = {
  all: 'Todas',
  active: 'Ainda no local',
  closed: 'Saída registrada',
};

interface Shift {
  id: string;
  team_members: string[];
  shift_start: string;
  shift_end: string | null;
  shift_type: string;
  notes: string | null;
  created_at: string;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  shift_id: string | null;
  created_at: string;
  resolved_at: string | null;
  apartment?: string | null;
  resident_id?: string | null;
  resident_name?: string | null;
  photo_url?: string | null;
  photoUrl?: string | null;
}

interface ShiftAck {
  id: string;
  shift_id: string;
  received_by: string;
  notes: string | null;
  acknowledged_at: string;
}

interface PortariaEquipment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface EquipmentCheck {
  equipment_id: string;
  status: string;
  notes: string;
}

interface ShiftEquipmentCheck {
  id: string;
  shift_id: string;
  equipment_id: string;
  status: string;
  notes: string | null;
  checked_at: string;
}

export const Reports = () => {
  const [activeTab, setActiveTab] = useState<'shifts' | 'incidents' | 'equipment' | 'permanencias'>('shifts');

  // Relatório de permanências prolongadas
  const { entries: accessEntries } = useAccessEntries();
  const [stayPeriod, setStayPeriod] = useState<StayPeriod>('7d');
  const [stayTypeFilter, setStayTypeFilter] = useState<StayTypeFilter>('all');
  const [stayStatusFilter, setStayStatusFilter] = useState<StayStatusFilter>('all');
  const [stayPage, setStayPage] = useState(1);

  // Shifts state
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teamMembers, setTeamMembers] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftType, setShiftType] = useState<'diurno' | 'noturno'>('diurno');
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shiftSearch, setShiftSearch] = useState('');
  const [shiftPage, setShiftPage] = useState(1);

  // Equipment checklist state
  const [equipmentChecks, setEquipmentChecks] = useState<EquipmentCheck[]>([]);
  const [portariaEquipment, setPortariaEquipment] = useState<PortariaEquipment[]>([]);
  const [currentShiftChecks, setCurrentShiftChecks] = useState<ShiftEquipmentCheck[]>([]);

  // Equipment management state
  const [isEquipmentDialogOpen, setIsEquipmentDialogOpen] = useState(false);
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [equipmentFormData, setEquipmentFormData] = useState({ name: '', description: '' });
  const [equipmentPage, setEquipmentPage] = useState(1);

  // Incidents state
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [incidentPage, setIncidentPage] = useState(1);
  const [incidentSearch, setIncidentSearch] = useState('');
  // Ocorrência: apartamento/morador e foto de comprovação
  const [incidentApartment, setIncidentApartment] = useState('');
  const [incidentResidentId, setIncidentResidentId] = useState<string | null>(null);
  const [incidentResidentName, setIncidentResidentName] = useState('');
  const [incidentResidentQuery, setIncidentResidentQuery] = useState('');
  const [incidentPhoto, setIncidentPhoto] = useState<File | null>(null);
  const [incidentPhotoPreview, setIncidentPhotoPreview] = useState('');
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  // Passagem de plantão ("Ciente e Recebido")
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackName, setAckName] = useState('');
  const [ackNotes, setAckNotes] = useState('');
  const [currentShiftAck, setCurrentShiftAck] = useState<ShiftAck | null>(null);

  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email || '';
  const { residents: allResidents } = useResidents();

  // View shift details
  const [viewingShift, setViewingShift] = useState<Shift | null>(null);
  const [viewingShiftChecks, setViewingShiftChecks] = useState<(ShiftEquipmentCheck & { equipment_name?: string })[]>([]);
  const [viewingShiftIncidents, setViewingShiftIncidents] = useState<Incident[]>([]);

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    loadShifts();
    loadIncidents();
    loadPortariaEquipment();
    checkCurrentShift();
    autoDetectShiftType();
  }, []);

  const autoDetectShiftType = () => {
    const now = new Date();
    const hour = now.getHours();
    setShiftType(hour >= 6 && hour < 18 ? 'diurno' : 'noturno');
  };

  const loadPortariaEquipment = async () => {
    const { data, error } = await supabase
      .from('portaria_equipment')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) {
      console.error('Error loading equipment:', error);
    } else {
      setPortariaEquipment(data || []);
      // Initialize checks for each equipment
      setEquipmentChecks((data || []).map(eq => ({
        equipment_id: eq.id,
        status: 'functional' as const,
        notes: '',
      })));
    }
  };

  const loadAllPortariaEquipment = async () => {
    const { data, error } = await supabase
      .from('portaria_equipment')
      .select('*')
      .order('name');
    if (!error) setPortariaEquipment(data || []);
  };

  const loadShifts = async () => {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .order('shift_start', { ascending: false });
    if (!error) setShifts((data || []) as Shift[]);
  };

  const loadIncidents = async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return;
    const enriched = await Promise.all((data || []).map(async (inc: any) => ({
      ...inc,
      photoUrl: inc.photo_url ? await supabaseStorage.getIncidentPhoto(inc.id) : null,
    })));
    setIncidents(enriched);
  };

  const loadCurrentShiftAck = async (shiftId: string) => {
    const { data } = await supabase
      .from('shift_acknowledgments')
      .select('*')
      .eq('shift_id', shiftId)
      .maybeSingle();
    setCurrentShiftAck((data as ShiftAck) || null);
  };

  const checkCurrentShift = async () => {
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .is('shift_end', null)
      .order('shift_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setCurrentShift(data as Shift);
      loadCurrentShiftChecks(data.id);
      loadCurrentShiftAck(data.id);
    }
  };

  const loadCurrentShiftChecks = async (shiftId: string) => {
    const { data } = await supabase
      .from('shift_equipment_checks')
      .select('*')
      .eq('shift_id', shiftId);
    if (data) setCurrentShiftChecks(data);
  };

  const handleStartShift = async () => {
    if (!teamMembers.trim()) {
      toast.error('Informe os membros da equipe');
      return;
    }

    const members = teamMembers.split(',').map(m => m.trim()).filter(m => m);

    const { data: shiftData, error } = await supabase
      .from('shifts')
      .insert({
        team_members: members,
        shift_start: new Date().toISOString(),
        shift_type: shiftType,
        notes: shiftNotes || null,
      })
      .select()
      .single();

    if (error || !shiftData) {
      toast.error('Erro ao iniciar plantão');
      return;
    }

    // Save equipment checklist - notes contains the "situação" written by user
    const checksToInsert = equipmentChecks
      .filter(c => portariaEquipment.find(e => e.id === c.equipment_id) && c.notes.trim())
      .map(c => ({
        shift_id: shiftData.id,
        equipment_id: c.equipment_id,
        status: c.status || 'functional',
        notes: c.notes || null,
      }));

    if (checksToInsert.length > 0) {
      await supabase.from('shift_equipment_checks').insert(checksToInsert);
    }

    toast.success('Plantão iniciado com sucesso');
    setTeamMembers('');
    setShiftNotes('');
    loadShifts();
    checkCurrentShift();
    loadPortariaEquipment();

    // Passagem de plantão: se há pendências em aberto, convida o porteiro a assinar o "Ciente e Recebido"
    const openPending = incidents.filter(i => i.status === 'open' || i.status === 'in_progress');
    if (openPending.length > 0) {
      setAckName(userName);
      setAckNotes('');
      setAckDialogOpen(true);
    }
  };

  const handleEndShift = async () => {
    if (!currentShift) return;
    const { error } = await supabase
      .from('shifts')
      .update({ shift_end: new Date().toISOString() })
      .eq('id', currentShift.id);
    if (error) {
      toast.error('Erro ao encerrar plantão');
    } else {
      toast.success('Plantão encerrado com sucesso');
      setCurrentShift(null);
      setCurrentShiftChecks([]);
      loadShifts();
    }
  };

  const handleIncidentPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setIncidentPhoto(file);
    setIncidentPhotoPreview(file ? URL.createObjectURL(file) : '');
  };

  const handleCreateIncident = async () => {
    if (!incidentTitle.trim() || !incidentDescription.trim()) {
      toast.error('Preencha título e descrição');
      return;
    }
    setIncidentSaving(true);
    const { data, error } = await supabase.from('incidents').insert({
      title: incidentTitle,
      description: incidentDescription,
      severity: incidentSeverity,
      status: 'open',
      shift_id: currentShift?.id || null,
      apartment: incidentApartment.trim() || null,
      resident_id: incidentResidentId,
      resident_name: incidentResidentName.trim() || null,
      photo_url: incidentPhoto ? 'pending' : null,
    }).select().single();
    if (error || !data) {
      toast.error(error?.message || 'Erro ao registrar ocorrência');
      setIncidentSaving(false);
      return;
    }
    if (incidentPhoto) {
      const uploaded = await supabaseStorage.uploadIncidentPhoto(data.id, incidentPhoto);
      if (uploaded) {
        await supabase.from('incidents').update({ photo_url: 'photo' }).eq('id', data.id);
      }
    }
    toast.success('Ocorrência registrada');
    setIncidentTitle('');
    setIncidentDescription('');
    setIncidentSeverity('low');
    setIncidentApartment('');
    setIncidentResidentId(null);
    setIncidentResidentName('');
    setIncidentResidentQuery('');
    setIncidentPhoto(null);
    setIncidentPhotoPreview('');
    loadIncidents();
    setIncidentSaving(false);
  };

  const handleConfirmAck = async () => {
    if (!currentShift || !ackName.trim()) {
      toast.error('Informe o nome de quem recebe o turno');
      return;
    }
    const { error } = await supabase.from('shift_acknowledgments').insert({
      shift_id: currentShift.id,
      received_by: ackName.trim(),
      notes: ackNotes.trim() || null,
      acknowledged_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(error?.message || 'Erro ao confirmar recebimento');
      return;
    }
    toast.success('Turno recebido (Ciente e Recebido)');
    setAckDialogOpen(false);
    setAckNotes('');
    loadCurrentShiftAck(currentShift.id);
  };

  const handleUpdateIncidentStatus = async (id: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === 'resolved' || newStatus === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('incidents').update(updates).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar ocorrência');
    } else {
      toast.success('Ocorrência atualizada');
      loadIncidents();
    }
  };

  const handleCreateEquipment = async () => {
    if (!equipmentFormData.name.trim()) {
      toast.error('Informe o nome do equipamento');
      return;
    }
    const { error } = await supabase.from('portaria_equipment').insert({
      name: equipmentFormData.name.toUpperCase(),
      description: equipmentFormData.description || null,
    });
    if (error) {
      toast.error('Erro ao cadastrar equipamento');
    } else {
      toast.success('Equipamento cadastrado');
      setEquipmentFormData({ name: '', description: '' });
      setIsEquipmentDialogOpen(false);
      loadPortariaEquipment();
      loadAllPortariaEquipment();
    }
  };

  const handleToggleEquipment = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('portaria_equipment')
      .update({ is_active: !isActive })
      .eq('id', id);
    if (!error) {
      toast.success(isActive ? 'Equipamento desativado' : 'Equipamento ativado');
      loadPortariaEquipment();
      loadAllPortariaEquipment();
    }
  };

  const handleViewShiftDetails = async (shift: Shift) => {
    setViewingShift(shift);
    // Load checks for this shift with equipment names
    const { data: checks } = await supabase
      .from('shift_equipment_checks')
      .select('*, portaria_equipment(name, description)')
      .eq('shift_id', shift.id);

    const enrichedChecks = (checks || []).map((c: any) => ({
      ...c,
      equipment_name: c.portaria_equipment?.name || 'Equipamento removido',
      equipment_description: c.portaria_equipment?.description || '',
    }));
    setViewingShiftChecks(enrichedChecks);

    // Load incidents for this shift
    const { data: shiftIncidents } = await supabase
      .from('incidents')
      .select('*')
      .eq('shift_id', shift.id)
      .order('created_at', { ascending: false });
    setViewingShiftIncidents((shiftIncidents || []) as Incident[]);
  };

  const handleEquipmentCheckChange = (equipmentId: string, field: 'status' | 'notes', value: string) => {
    setEquipmentChecks(prev => prev.map(c =>
      c.equipment_id === equipmentId ? { ...c, [field]: value } : c
    ));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getSeverityLabel = (s: string) => {
    const map: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
    return map[s] || s;
  };

  const getStatusLabel = (s: string) => {
    const map: Record<string, string> = { open: 'Aberta', in_progress: 'Em Andamento', resolved: 'Resolvida', closed: 'Fechada' };
    return map[s] || s;
  };

  const getEquipStatusIcon = (status: string) => {
    if (status === 'functional') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === 'defective') return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  };

  const getEquipStatusLabel = (s: string) => {
    const map: Record<string, string> = { functional: 'Funcionando', defective: 'Defeituoso', maintenance: 'Manutenção' };
    return map[s] || s;
  };

  const exportShiftsToPDF = () => {
    const doc = new jsPDF();
    doc.text('Histórico de Plantões', 14, 15);
    const tableData = filteredShifts.map(shift => [
      shift.shift_type === 'diurno' ? 'Diurno' : 'Noturno',
      format(new Date(shift.shift_start), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      shift.shift_end ? format(new Date(shift.shift_end), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'Em andamento',
      shift.team_members.join(', '),
      shift.notes || '-',
    ]);
    autoTable(doc, {
      head: [['Tipo', 'Início', 'Fim', 'Equipe', 'Observações']],
      body: tableData,
      startY: 22,
    });
    doc.save('plantoes.pdf');
    toast.success('PDF gerado com sucesso');
  };

  const exportShiftsToCSV = () => {
    const headers = ['Tipo', 'Início', 'Fim', 'Equipe', 'Observações'];
    const rows = filteredShifts.map(shift => [
      shift.shift_type === 'diurno' ? 'Diurno' : 'Noturno',
      format(new Date(shift.shift_start), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      shift.shift_end ? format(new Date(shift.shift_end), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Em andamento',
      shift.team_members.join(', '),
      shift.notes || '-',
    ]);
    exportToCSV('plantoes', headers, rows);
    toast.success('CSV gerado com sucesso');
  };

  // Load all equipment for management tab
  useEffect(() => {
    if (activeTab === 'equipment') loadAllPortariaEquipment();
  }, [activeTab]);

  const filteredShifts = shifts.filter(shift =>
    shift.team_members.some(m => m.toLowerCase().includes(shiftSearch.toLowerCase())) ||
    (shift.notes && shift.notes.toLowerCase().includes(shiftSearch.toLowerCase())) ||
    (shift.shift_type && shift.shift_type.toLowerCase().includes(shiftSearch.toLowerCase()))
  );
  const totalShiftPages = Math.max(1, Math.ceil(filteredShifts.length / ITEMS_PER_PAGE));
  const correctedShiftPage = Math.min(shiftPage, totalShiftPages);
  if (correctedShiftPage !== shiftPage) setShiftPage(correctedShiftPage);
  const paginatedShifts = filteredShifts.slice((correctedShiftPage - 1) * ITEMS_PER_PAGE, correctedShiftPage * ITEMS_PER_PAGE);

const currentShiftIncidents = incidents.filter(i => currentShift && i.shift_id === currentShift.id);

  const openPendingIncidents = incidents.filter(i => i.status === 'open' || i.status === 'in_progress');

  const incidentResidentSuggestions = allResidents
    .filter(r => r.name.toLowerCase().includes(incidentResidentQuery.trim().toLowerCase()) && r.name !== incidentResidentName)
    .slice(0, 6);

  const filteredIncidents = incidents.filter(incident => {
    const q = incidentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      incident.title.toLowerCase().includes(q) ||
      incident.description.toLowerCase().includes(q) ||
      (incident.apartment || '').toLowerCase().includes(q) ||
      (incident.resident_name || '').toLowerCase().includes(q)
    );
  });

  const paginatedIncidents = filteredIncidents.slice((incidentPage - 1) * ITEMS_PER_PAGE, incidentPage * ITEMS_PER_PAGE);
  const totalIncidentPages = Math.ceil(filteredIncidents.length / ITEMS_PER_PAGE);

  const paginatedEquipment = portariaEquipment.slice((equipmentPage - 1) * ITEMS_PER_PAGE, equipmentPage * ITEMS_PER_PAGE);
  const totalEquipmentPages = Math.ceil(portariaEquipment.length / ITEMS_PER_PAGE);

  // ========== RELATÓRIO DE PERMANÊNCIAS PROLONGADAS ==========
  // Auditoria de segurança: entregadores acima de 45min e prestadores acima de
  // 4h ou que permaneceram após as 18h.
  const prolongedStays = useMemo(() => {
    const now = new Date();
    const hoursLimit = STAY_PERIOD_HOURS[stayPeriod];
    const periodStart = hoursLimit ? now.getTime() - hoursLimit * 3600000 : null;

    return accessEntries
      .filter(entry => !!entry.entryTime)
      .filter(entry => entry.visitorType === 'delivery' || entry.visitorType === 'service_provider')
      .filter(entry => stayTypeFilter === 'all' || entry.visitorType === stayTypeFilter)
      .filter(entry =>
        stayStatusFilter === 'all'
          ? true
          : stayStatusFilter === 'active' ? !entry.exitTime : !!entry.exitTime
      )
      .filter(entry => {
        if (periodStart === null) return true;
        const ts = new Date(entry.entryTime).getTime();
        return !Number.isNaN(ts) && ts >= periodStart;
      })
      .map(entry => {
        const minutes = getStayDurationMinutes(entry.entryTime, entry.exitTime, now) ?? 0;
        const after18h = staysAfter18h(entry.entryTime, entry.exitTime, now);
        const isDelivery = entry.visitorType === 'delivery';
        const reasons: string[] = [];
        if (isDelivery && minutes > DELIVERY_MAX_MINUTES) {
          reasons.push(`Entrega acima de ${DELIVERY_MAX_MINUTES}min`);
        }
        if (!isDelivery) {
          if (minutes > SERVICE_PROVIDER_MAX_HOURS * 60) {
            reasons.push(`Serviço acima de ${SERVICE_PROVIDER_MAX_HOURS}h`);
          }
          if (after18h) reasons.push('Presente após as 18h');
        }
        return { entry, minutes, after18h, isActive: !entry.exitTime, reasons };
      })
      .filter(row => row.reasons.length > 0)
      .sort((a, b) => new Date(b.entry.entryTime).getTime() - new Date(a.entry.entryTime).getTime());
  }, [accessEntries, stayPeriod, stayTypeFilter, stayStatusFilter]);

  const activeStaysCount = prolongedStays.filter(row => row.isActive).length;
  const after18hCount = prolongedStays.filter(row => row.after18h).length;
  const longestStayMinutes = prolongedStays.reduce((max, row) => Math.max(max, row.minutes), 0);
  const totalStayPages = Math.max(1, Math.ceil(prolongedStays.length / ITEMS_PER_PAGE));
  const currentStayPage = Math.min(stayPage, totalStayPages);
  const paginatedStays = prolongedStays.slice(
    (currentStayPage - 1) * ITEMS_PER_PAGE,
    currentStayPage * ITEMS_PER_PAGE
  );

  const buildStayRow = (row: (typeof prolongedStays)[number]) => [
    row.entry.visitorName,
    STAY_TYPE_LABELS_SINGULAR[row.entry.visitorType] || row.entry.visitorType,
    row.entry.apartment || '-',
    row.entry.visitorDocument || '-',
    format(new Date(row.entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    row.entry.exitTime ? format(new Date(row.entry.exitTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Em andamento',
    formatDuration(row.minutes),
    row.isActive ? 'Ainda no local' : 'Encerrada',
    row.reasons.join('; '),
  ];

  const exportProlongedStaysToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Relatório de Permanências Prolongadas', 14, 15);
    doc.text(
      `Período: ${STAY_PERIOD_LABELS[stayPeriod]} | Tipo: ${STAY_TYPE_LABELS[stayTypeFilter]} | Situação: ${STAY_STATUS_LABELS[stayStatusFilter]}`,
      14,
      22
    );
    doc.text(
      `Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} | ${prolongedStays.length} ocorrência(s) | ` +
        `Critério: entregadores > ${DELIVERY_MAX_MINUTES}min; prestadores > ${SERVICE_PROVIDER_MAX_HOURS}h ou presentes após as 18h`,
      14,
      29
    );

    autoTable(doc, {
      head: [['Nome', 'Tipo', 'Apartamento', 'Documento', 'Entrada', 'Saída', 'Duração', 'Situação', 'Motivo']],
      body: prolongedStays.map(buildStayRow),
      startY: 35,
    });

    doc.save(`permanencias-prolongadas-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('PDF gerado com sucesso');
  };

  const exportProlongedStaysToCSV = () => {
    const headers = ['Nome', 'Tipo', 'Apartamento', 'Documento', 'Entrada', 'Saída', 'Duração', 'Situação', 'Motivo'];
    exportToCSV(`permanencias-prolongadas-${format(new Date(), 'dd-MM-yyyy')}`, headers, prolongedStays.map(buildStayRow));
    toast.success('CSV gerado com sucesso');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Relatórios</h1>
      </div>

      <div className="flex gap-2 border-b flex-wrap">
        <Button variant={activeTab === 'shifts' ? 'default' : 'ghost'} onClick={() => setActiveTab('shifts')}>
          <Users className="mr-2 h-4 w-4" />
          Plantões
        </Button>
        <Button variant={activeTab === 'incidents' ? 'default' : 'ghost'} onClick={() => setActiveTab('incidents')}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          Ocorrências
        </Button>
        <Button variant={activeTab === 'equipment' ? 'default' : 'ghost'} onClick={() => setActiveTab('equipment')}>
          <Wrench className="mr-2 h-4 w-4" />
          Equipamentos
        </Button>
        <Button variant={activeTab === 'permanencias' ? 'default' : 'ghost'} onClick={() => setActiveTab('permanencias')}>
          <Clock className="mr-2 h-4 w-4" />
          Permanências Prolongadas
        </Button>
      </div>

      {/* ========== PLANTÕES ========== */}
      {activeTab === 'shifts' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gerenciar Plantão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentShift ? (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      {currentShift.shift_type === 'diurno'
                        ? <Sun className="h-5 w-5 text-yellow-500" />
                        : <Moon className="h-5 w-5 text-blue-400" />}
                      <h3 className="font-semibold">
                        Plantão {currentShift.shift_type === 'diurno' ? 'Diurno (06:00-18:00)' : 'Noturno (18:00-06:00)'}
                      </h3>
                      <Badge variant={currentShift.shift_type === 'diurno' ? 'default' : 'secondary'}>
                        Em andamento
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Iniciado: {format(new Date(currentShift.shift_start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-sm"><strong>Equipe:</strong> {currentShift.team_members.join(', ')}</p>
                    {currentShift.notes && <p className="text-sm mt-2"><strong>Observações:</strong> {currentShift.notes}</p>}
                  </div>

                  {/* Checklist do plantão atual */}
                  {currentShiftChecks.length > 0 && (
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-3">Checklist de Equipamentos</h4>
                      <div className="space-y-2">
                        {currentShiftChecks.map(check => {
                          const eq = portariaEquipment.find(e => e.id === check.equipment_id);
                          return (
                            <div key={check.id} className="text-sm border-b pb-2 last:border-b-0 last:pb-0">
                              <span className="font-medium">{eq?.name || 'Equipamento'}</span>
                              {check.notes && <p className="text-muted-foreground text-xs mt-1">Situação: {check.notes}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ocorrências do plantão atual */}
                  {currentShiftIncidents.length > 0 && (
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-3">Ocorrências deste Plantão ({currentShiftIncidents.length})</h4>
                      <div className="space-y-2">
                        {currentShiftIncidents.map(inc => (
                          <div key={inc.id} className="flex items-center justify-between text-sm border-b pb-2">
                            <div>
                              <span className="font-medium">{inc.title}</span>
                              <span className="text-muted-foreground ml-2">
                                {format(new Date(inc.created_at), "HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <Badge variant={getSeverityColor(inc.severity)} className="text-xs">
                                {getSeverityLabel(inc.severity)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {getStatusLabel(inc.status)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Passagem de Plantão — Termo "Ciente e Recebido" */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        Passagem de Plantão
                      </h4>
                      {currentShiftAck ? (
                        <Badge className="bg-success/15 text-success border-success/30">
                          Ciente e Recebido
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pendente de confirmação</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {openPendingIncidents.length === 0
                        ? 'Nenhuma pendência em aberto no momento.'
                        : `${openPendingIncidents.length} pendência(s) em aberto aguardando confirmação.`}
                    </p>
                    {openPendingIncidents.length > 0 && (
                      <ul className="space-y-1 mt-2 mb-3 max-h-32 overflow-y-auto">
                        {openPendingIncidents.slice(0, 6).map(inc => (
                          <li key={inc.id} className="text-sm flex items-center justify-between">
                            <span>
                              {inc.title}
                              {inc.apartment && <span className="text-muted-foreground"> ({inc.apartment})</span>}
                            </span>
                            <Badge variant={getSeverityColor(inc.severity)} className="text-[10px]">
                              {getSeverityLabel(inc.severity)}
                            </Badge>
                          </li>
                        ))}
                        {openPendingIncidents.length > 6 && (
                          <li className="text-xs text-muted-foreground">
                            + {openPendingIncidents.length - 6} outra(s) pendência(s) — veja a aba Ocorrências
                          </li>
                        )}
                      </ul>
                    )}
                    {currentShiftAck ? (
                      <p className="text-xs text-muted-foreground">
                        Recebido por <strong>{currentShiftAck.received_by}</strong> em{' '}
                        {format(new Date(currentShiftAck.acknowledged_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAckName(userName);
                          setAckNotes('');
                          setAckDialogOpen(true);
                        }}
                      >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Receber Turno (Ciente)
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Initialize checks from current shift checks or fresh
                        setEquipmentChecks(portariaEquipment.filter(e => e.is_active).map(eq => {
                          const existing = currentShiftChecks.find(c => c.equipment_id === eq.id);
                          return {
                            equipment_id: eq.id,
                            status: existing?.status || 'functional',
                            notes: existing?.notes || '',
                          };
                        }));
                        setIsChecklistDialogOpen(true);
                      }}
                    >
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Checklist de Equipamentos
                    </Button>
                    <Button onClick={() => setActiveTab('incidents')} variant="outline">
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Registrar Ocorrência
                    </Button>
                    <Button onClick={handleEndShift} variant="destructive">
                      Encerrar Plantão
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tipo de plantão */}
                  <div>
                    <Label>Tipo de Plantão</Label>
                    <div className="flex gap-3 mt-2">
                      <Button
                        type="button"
                        variant={shiftType === 'diurno' ? 'default' : 'outline'}
                        onClick={() => setShiftType('diurno')}
                        className="flex-1"
                      >
                        <Sun className="mr-2 h-4 w-4" />
                        Diurno (06:00 - 18:00)
                      </Button>
                      <Button
                        type="button"
                        variant={shiftType === 'noturno' ? 'default' : 'outline'}
                        onClick={() => setShiftType('noturno')}
                        className="flex-1"
                      >
                        <Moon className="mr-2 h-4 w-4" />
                        Noturno (18:00 - 06:00)
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Membros da Equipe (separados por vírgula)</Label>
                    <Input value={teamMembers} onChange={e => setTeamMembers(e.target.value)} placeholder="João Silva, Maria Santos" />
                  </div>

                  {/* Botão para abrir checklist de equipamentos */}
                  {portariaEquipment.filter(e => e.is_active).length > 0 ? (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setIsChecklistDialogOpen(true)}
                      >
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Checklist de Equipamentos
                        {equipmentChecks.some(c => c.notes.trim()) && (
                          <Badge variant="default" className="ml-2">{equipmentChecks.filter(c => c.notes.trim()).length} preenchido(s)</Badge>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 border rounded-lg text-center text-muted-foreground">
                      <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum equipamento cadastrado.</p>
                      <Button variant="link" size="sm" onClick={() => setActiveTab('equipment')}>
                        Cadastrar equipamentos
                      </Button>
                    </div>
                  )}

                  <div>
                    <Label>Observações</Label>
                    <Textarea value={shiftNotes} onChange={e => setShiftNotes(e.target.value)} placeholder="Observações sobre o plantão..." />
                  </div>

                  <Button onClick={handleStartShift}>
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Iniciar Plantão
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Histórico de Plantões</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportShiftsToPDF}>
                    <Download className="h-4 w-4 mr-2" />PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportShiftsToCSV}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por equipe, observações ou tipo..." value={shiftSearch} onChange={e => { setShiftSearch(e.target.value); setShiftPage(1); }} className="pl-10" />
                </div>
              </div>
              <div className="space-y-4">
                {paginatedShifts.map(shift => (
                  <div key={shift.id} className="border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleViewShiftDetails(shift)}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {shift.shift_type === 'diurno'
                          ? <Sun className="h-4 w-4 text-yellow-500" />
                          : <Moon className="h-4 w-4 text-blue-400" />}
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(shift.shift_start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            {shift.shift_end && <> - {format(new Date(shift.shift_end), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>}
                          </p>
                          <p className="font-medium">Equipe: {shift.team_members.join(', ')}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant={shift.shift_type === 'diurno' ? 'default' : 'secondary'}>
                          {shift.shift_type === 'diurno' ? 'Diurno' : 'Noturno'}
                        </Badge>
                        {!shift.shift_end && <Badge variant="default">Em andamento</Badge>}
                      </div>
                    </div>
                    {shift.notes && <p className="text-sm text-muted-foreground mt-2">{shift.notes}</p>}
                  </div>
                ))}
                {filteredShifts.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum plantão encontrado</p>}
              </div>
              <StandardPagination currentPage={shiftPage} totalPages={totalShiftPages} onPageChange={setShiftPage} className="mt-4" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== OCORRÊNCIAS ========== */}
      {activeTab === 'incidents' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Registrar Ocorrência</CardTitle>
              {currentShift && (
                <p className="text-sm text-muted-foreground">
                  Vinculada ao plantão {currentShift.shift_type === 'diurno' ? 'diurno' : 'noturno'} atual
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Título</Label>
                <Input value={incidentTitle} onChange={e => setIncidentTitle(e.target.value)} placeholder="Título da ocorrência" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={incidentDescription} onChange={e => setIncidentDescription(e.target.value)} placeholder="Descreva a ocorrência..." rows={4} />
              </div>
              <div>
                <Label>Gravidade</Label>
                <Select value={incidentSeverity} onValueChange={(v: any) => setIncidentSeverity(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Apartamento (opcional)</Label>
                <Input
                  value={incidentApartment}
                  onChange={e => setIncidentApartment(e.target.value)}
                  placeholder="Ex: Apto 42B"
                />
              </div>
              <div>
                <Label>Morador (opcional)</Label>
                <Input
                  value={incidentResidentName}
                  onChange={e => {
                    setIncidentResidentName(e.target.value);
                    setIncidentResidentQuery(e.target.value);
                    setIncidentResidentId(null);
                  }}
                  placeholder="Digite o nome para vincular ao cadastro..."
                />
                {incidentResidentQuery.trim() && incidentResidentSuggestions.length > 0 && (
                  <div className="mt-1 border rounded-md divide-y overflow-hidden">
                    {incidentResidentSuggestions.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setIncidentResidentName(r.name);
                          setIncidentResidentQuery('');
                          setIncidentResidentId(r.id);
                          if (!incidentApartment.trim()) setIncidentApartment(r.apartment);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      >
                        {r.name} <span className="text-muted-foreground">({r.apartment})</span>
                      </button>
                    ))}
                  </div>
                )}
                {incidentResidentName && !incidentResidentId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Morador sem vínculo com cadastro (texto livre).
                  </p>
                )}
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Foto de comprovação (opcional)
                </Label>
                <div className="flex items-center gap-3 mt-1">
                  <Input type="file" accept="image/*" onChange={handleIncidentPhotoChange} className="file:text-sm" />
                  {incidentPhotoPreview && (
                    <img src={incidentPhotoPreview} alt="Prévia" className="h-14 w-14 rounded-md border object-cover" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Portão batido, vidro quebrado, vazamento... tire a foto e anexe como prova.
                </p>
              </div>
              <Button onClick={handleCreateIncident} disabled={incidentSaving}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                {incidentSaving ? 'Registrando...' : 'Registrar Ocorrência'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Lista de Ocorrências</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {filteredIncidents.length} ocorrência(s)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, apartamento, morador ou descrição..."
                  value={incidentSearch}
                  onChange={e => {
                    setIncidentSearch(e.target.value);
                    setIncidentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <div className="space-y-4">
                {paginatedIncidents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma ocorrência encontrada{incidentSearch ? ` para "${incidentSearch}"` : ''}.
                  </p>
                ) : paginatedIncidents.map(incident => (
                  <div key={incident.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{incident.title}</h3>
                          {(incident.apartment || incident.resident_name) && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {incident.apartment && <span>{incident.apartment}</span>}
                              {incident.apartment && incident.resident_name && <span> · </span>}
                              {incident.resident_name && <span>{incident.resident_name}</span>}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
                        {incident.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoLightbox(incident.photoUrl || null)}
                            className="mt-2 block"
                            title="Ampliar foto de comprovação"
                          >
                            <img
                              src={incident.photoUrl}
                              alt="Foto da ocorrência"
                              className="h-24 w-24 rounded-md border object-cover"
                            />
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(incident.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={getSeverityColor(incident.severity)}>{getSeverityLabel(incident.severity)}</Badge>
                        <Badge variant="outline">{getStatusLabel(incident.status)}</Badge>
                      </div>
                    </div>
                    {incident.status !== 'closed' && (
                      <div className="flex gap-2 mt-3">
                        {incident.status === 'open' && <Button size="sm" variant="outline" onClick={() => handleUpdateIncidentStatus(incident.id, 'in_progress')}>Iniciar</Button>}
                        {incident.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => handleUpdateIncidentStatus(incident.id, 'resolved')}>Resolver</Button>}
                        <Button size="sm" variant="outline" onClick={() => handleUpdateIncidentStatus(incident.id, 'closed')}>Fechar</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <StandardPagination currentPage={incidentPage} totalPages={totalIncidentPages} onPageChange={setIncidentPage} className="mt-4" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== EQUIPAMENTOS ========== */}
      {activeTab === 'equipment' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Equipamentos da Portaria
                </CardTitle>
                <Button onClick={() => setIsEquipmentDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Equipamento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {paginatedEquipment.map(eq => (
                  <div key={eq.id} className="border rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">{eq.name}</h3>
                      {eq.description && <p className="text-sm text-muted-foreground">{eq.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Cadastrado em {format(new Date(eq.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={eq.is_active ? 'default' : 'secondary'}>
                        {eq.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => handleToggleEquipment(eq.id, eq.is_active)}>
                        {eq.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </div>
                ))}
                {portariaEquipment.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Nenhum equipamento cadastrado</p>
                )}
              </div>
              <StandardPagination currentPage={equipmentPage} totalPages={totalEquipmentPages} onPageChange={setEquipmentPage} className="mt-4" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== PERMANÊNCIAS PROLONGADAS ========== */}
      {activeTab === 'permanencias' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Relatório de Permanências Prolongadas</span>
                  <Badge variant="outline" className="text-xs">
                    {prolongedStays.length} ocorrência(s)
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportProlongedStaysToPDF} disabled={prolongedStays.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportProlongedStaysToCSV} disabled={prolongedStays.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Auditoria de segurança condominial: entradas em que a permanência excedeu o padrão —
                entregadores acima de {DELIVERY_MAX_MINUTES} minutos e prestadores acima de {SERVICE_PROVIDER_MAX_HOURS} horas
                ou que permaneceram após as 18h. Use o PDF como histórico formal para o síndico.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border rounded-lg p-3">
                  <span className="text-xs text-muted-foreground">Total de ocorrências</span>
                  <p className="text-2xl font-bold">{prolongedStays.length}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <span className="text-xs text-muted-foreground">Ainda no local</span>
                  <p className="text-2xl font-bold text-warning">{activeStaysCount}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <span className="text-xs text-muted-foreground">Maior permanência</span>
                  <p className="text-2xl font-bold text-destructive">
                    {longestStayMinutes > 0 ? formatDuration(longestStayMinutes) : '-'}
                  </p>
                  {after18hCount > 0 && (
                    <span className="text-xs text-muted-foreground">{after18hCount} após as 18h</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Período:</span>
                  {(Object.keys(STAY_PERIOD_LABELS) as StayPeriod[]).map(period => (
                    <Button
                      key={period}
                      size="sm"
                      variant={stayPeriod === period ? 'default' : 'outline'}
                      onClick={() => {
                        setStayPeriod(period);
                        setStayPage(1);
                      }}
                    >
                      {STAY_PERIOD_LABELS[period]}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Tipo:</span>
                  {(Object.keys(STAY_TYPE_LABELS) as StayTypeFilter[]).map(type => (
                    <Button
                      key={type}
                      size="sm"
                      variant={stayTypeFilter === type ? 'default' : 'outline'}
                      onClick={() => {
                        setStayTypeFilter(type);
                        setStayPage(1);
                      }}
                    >
                      {STAY_TYPE_LABELS[type]}
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground ml-4 mr-1">Situação:</span>
                  {(Object.keys(STAY_STATUS_LABELS) as StayStatusFilter[]).map(status => (
                    <Button
                      key={status}
                      size="sm"
                      variant={stayStatusFilter === status ? 'default' : 'outline'}
                      onClick={() => {
                        setStayStatusFilter(status);
                        setStayPage(1);
                      }}
                    >
                      {STAY_STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Apto</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedStays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Nenhuma permanência prolongada no período e filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedStays.map(row => (
                        <TableRow key={row.entry.id} className="hover:bg-muted/50">
                          <TableCell>
                            <span className="font-medium">{row.entry.visitorName}</span>
                            {row.entry.company && (
                              <span className="block text-xs text-muted-foreground">{row.entry.company}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{STAY_TYPE_LABELS_SINGULAR[row.entry.visitorType] || row.entry.visitorType}</TableCell>
                          <TableCell className="text-sm">{row.entry.apartment || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(row.entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.entry.exitTime
                              ? format(new Date(row.entry.exitTime), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-[10px] ${
                                row.minutes > SERVICE_PROVIDER_MAX_HOURS * 60
                                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                                  : 'bg-warning/15 text-warning border-warning/30'
                              }`}
                            >
                              {formatDuration(row.minutes)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.isActive ? 'default' : 'outline'} className="text-[10px]">
                              {row.isActive ? 'Ainda no local' : 'Encerrada'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.reasons.join('; ')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <StandardPagination currentPage={currentStayPage} totalPages={totalStayPages} onPageChange={setStayPage} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog: Cadastrar Equipamento */}
      <Dialog open={isEquipmentDialogOpen} onOpenChange={setIsEquipmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Equipamento da Portaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome do Equipamento *</Label>
              <Input value={equipmentFormData.name} onChange={e => setEquipmentFormData({ ...equipmentFormData, name: e.target.value })} placeholder="Ex: Rádio HT, Telefone, Monitor" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={equipmentFormData.description} onChange={e => setEquipmentFormData({ ...equipmentFormData, description: e.target.value })} placeholder="Ex: Marca/Modelo, localização" />
            </div>
            <Button onClick={handleCreateEquipment} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes do Plantão */}
      <Dialog open={!!viewingShift} onOpenChange={() => setViewingShift(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingShift?.shift_type === 'diurno'
                ? <Sun className="h-5 w-5 text-yellow-500" />
                : <Moon className="h-5 w-5 text-blue-400" />}
              Plantão {viewingShift?.shift_type === 'diurno' ? 'Diurno (06:00-18:00)' : 'Noturno (18:00-06:00)'}
            </DialogTitle>
          </DialogHeader>
          {viewingShift && (
            <div className="space-y-5 py-2">
              {/* Informações gerais */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Informações do Plantão
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>{' '}
                    <Badge variant={viewingShift.shift_type === 'diurno' ? 'default' : 'secondary'}>
                      {viewingShift.shift_type === 'diurno' ? 'Diurno' : 'Noturno'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <Badge variant={viewingShift.shift_end ? 'secondary' : 'default'}>
                      {viewingShift.shift_end ? 'Finalizado' : 'Em andamento'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Início:</span>{' '}
                    {format(new Date(viewingShift.shift_start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fim:</span>{' '}
                    {viewingShift.shift_end
                      ? format(new Date(viewingShift.shift_end), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : '—'}
                  </div>
                  {viewingShift.shift_end && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Duração:</span>{' '}
                      {(() => {
                        const ms = new Date(viewingShift.shift_end).getTime() - new Date(viewingShift.shift_start).getTime();
                        const hours = Math.floor(ms / 3600000);
                        const mins = Math.floor((ms % 3600000) / 60000);
                        return `${hours}h ${mins}min`;
                      })()}
                    </div>
                  )}
                </div>
                <div className="text-sm mt-2">
                  <span className="text-muted-foreground">Equipe:</span>{' '}
                  <span className="font-medium">{viewingShift.team_members.join(', ')}</span>
                </div>
                {viewingShift.notes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Observações:</span>{' '}
                    <span>{viewingShift.notes}</span>
                  </div>
                )}
              </div>

              {/* Checklist de equipamentos */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Checklist de Equipamentos
                  {viewingShiftChecks.length > 0 && (
                    <Badge variant="outline" className="text-xs ml-1">
                      {viewingShiftChecks.length} item(ns)
                    </Badge>
                  )}
                </h4>
                {viewingShiftChecks.length > 0 ? (
                  <div className="space-y-2">
                    {viewingShiftChecks.map(c => (
                      <div key={c.id} className="text-sm border-b pb-2 last:border-b-0 last:pb-0">
                        <span className="font-medium">{c.equipment_name}</span>
                        {c.notes && <p className="text-muted-foreground text-xs mt-1">Situação: {c.notes}</p>}
                        {!c.notes && <p className="text-muted-foreground text-xs mt-1 italic">Sem descrição</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum equipamento registrado neste plantão.</p>
                )}
              </div>

              {/* Ocorrências */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Ocorrências
                  <Badge variant="outline" className="text-xs ml-1">{viewingShiftIncidents.length}</Badge>
                </h4>
                {viewingShiftIncidents.length > 0 ? (
                  <div className="space-y-3">
                    {viewingShiftIncidents.map(inc => (
                      <div key={inc.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium">{inc.title}</span>
                          <div className="flex gap-1">
                            <Badge variant={getSeverityColor(inc.severity)} className="text-xs">{getSeverityLabel(inc.severity)}</Badge>
                            <Badge variant="outline" className="text-xs">{getStatusLabel(inc.status)}</Badge>
                          </div>
                        </div>
                        <p className="text-muted-foreground text-xs">{inc.description}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                          <span>Registrada: {format(new Date(inc.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          {inc.resolved_at && <span>Resolvida: {format(new Date(inc.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma ocorrência neste plantão.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Checklist de Equipamentos */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Checklist de Equipamentos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {portariaEquipment.filter(e => e.is_active).map(eq => {
              const check = equipmentChecks.find(c => c.equipment_id === eq.id);
              return (
                <div key={eq.id} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
                  <Label className="font-semibold">{eq.name}</Label>
                  {eq.description && <p className="text-xs text-muted-foreground">{eq.description}</p>}
                  <Textarea
                    value={check?.notes || ''}
                    onChange={e => handleEquipmentCheckChange(eq.id, 'notes', e.target.value)}
                    placeholder="Descreva a situação do equipamento..."
                    className="text-sm min-h-[60px]"
                  />
                </div>
              );
            })}
            {portariaEquipment.filter(e => e.is_active).length === 0 && (
              <p className="text-center text-muted-foreground py-4">Nenhum equipamento ativo cadastrado.</p>
            )}
            <Button className="w-full" onClick={async () => {
              // If there's an active shift, save/update checks to the database
              if (currentShift) {
                const checksToSave = equipmentChecks
                  .filter(c => c.notes.trim())
                  .map(c => ({
                    shift_id: currentShift.id,
                    equipment_id: c.equipment_id,
                    status: c.status || 'functional',
                    notes: c.notes || null,
                  }));

                // Delete existing checks for this shift and re-insert
                await supabase.from('shift_equipment_checks').delete().eq('shift_id', currentShift.id);
                if (checksToSave.length > 0) {
                  await supabase.from('shift_equipment_checks').insert(checksToSave);
                }
                toast.success('Checklist atualizado');
                loadCurrentShiftChecks(currentShift.id);
              }
              setIsChecklistDialogOpen(false);
            }}>
              Confirmar Checklist
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Passagem de Plantão — Termo "Ciente e Recebido" */}
      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Passagem de Plantão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium mb-2">Termo de ciência e recebimento do turno</p>
            <div className="space-y-1 mb-3 max-h-40 overflow-y-auto rounded-md border p-3">
              {openPendingIncidents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma pendência em aberto.</p>
              )}
              {openPendingIncidents.map(inc => (
                <div key={inc.id} className="text-sm flex items-center justify-between">
                  <span>
                    {inc.title}
                    {inc.apartment && <span className="text-muted-foreground"> ({inc.apartment})</span>}
                  </span>
                  <Badge variant={getSeverityColor(inc.severity)} className="text-[10px]">
                    {getSeverityLabel(inc.severity)}
                  </Badge>
                </div>
              ))}
            </div>
            <div>
              <Label>Recebido por (responsável):</Label>
              <Input
                value={ackName}
                onChange={e => setAckName(e.target.value)}
                placeholder="Nome de quem recebe o turno..."
              />
            </div>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea
                value={ackNotes}
                onChange={e => setAckNotes(e.target.value)}
                placeholder="Resumo do que foi repassado..."
                className="min-h-[80px]"
              />
            </div>
            <Button className="w-full" onClick={handleConfirmAck} disabled={!ackName.trim()}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Confirmar Ciente e Recebido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Foto de comprovação — zoom */}
      <Dialog open={!!photoLightbox} onOpenChange={o => { if (!o) setPhotoLightbox(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Foto de comprovação
            </DialogTitle>
          </DialogHeader>
          <img src={photoLightbox || ''} alt="Foto da ocorrência" className="w-full rounded-md border" />
        </DialogContent>
      </Dialog>
    </div>
  );
};
