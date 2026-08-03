import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogIn, LogOut, Camera, Upload, X, Plus, Pencil, Trash2, Search, Download, ShieldBan, ShieldCheck, Ban, AlertTriangle, FileSpreadsheet, ScanFace, Loader2, Wifi, WifiOff } from 'lucide-react';
import { DeviceCaptureStatus } from '@/components/DeviceCaptureStatus';
import { AccessEntry, Resident, Device } from '@/types';
import { useAccessEntries } from '@/hooks/useAccessEntries';
import { useResidents } from '@/hooks/useResidents';
import { useDevices } from '@/hooks/useDevices';
import { toast } from 'sonner';
import { capturePhotoFromDevice, syncBiometricToAllDevices } from '@/lib/device-capture';
import StandardPagination from '@/components/StandardPagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToCSV } from '@/lib/export-csv';

const getVisitorTypeLabel = (type: string): string => {
  if (type === 'delivery') return 'Entregador';
  if (type === 'service_provider') return 'Prestador';
  return 'Visitante';
};

interface BlockedVisitor {
  id: string;
  visitor_name: string;
  visitor_document: string;
  reason: string | null;
  blocked_at: string;
  is_active: boolean;
}
export const NewRegistry = () => {
  const { residents } = useResidents();
  const { devices } = useDevices();
  const { entries: allEntries, saveEntry, deleteEntry, searchSimilarEntries } = useAccessEntries();
  const entries = allEntries.filter(e => !e.exitTime);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageAll, setCurrentPageAll] = useState(1);
  const [visitedLocationSearch, setVisitedLocationSearch] = useState('');
  const [showResidentSuggestions, setShowResidentSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [blockedVisitors, setBlockedVisitors] = useState<BlockedVisitor[]>([]);
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [blockingEntry, setBlockingEntry] = useState<AccessEntry | null>(null);
  const [showBlockReasonDialog, setShowBlockReasonDialog] = useState(false);
  const [selectedDetailEntry, setSelectedDetailEntry] = useState<AccessEntry | null>(null);
  const itemsPerPage = 12;
  const itemsPerPageTable = 10;
  const DEFAULT_COMPANIES = [
    'IFOOD', 'UBER', 'UBER EATS', 'MERCADO LIVRE', 'AMAZON', 'LOGGI', 'CORREIOS',
    'DHL', 'FEDEX', 'RAPPI', 'ZÉ DELIVERY', 'ENEL', 'SABESP', 'COMGÁS', 'VIVO', 'CLARO', 'TIM'
  ];
  const [formData, setFormData] = useState({
    visitorName: '',
    visitorDocument: '',
    visitorType: 'visitor' as 'visitor' | 'service_provider' | 'delivery',
    residentId: '',
    purpose: '',
    company: '',
    vehiclePlate: '',
    vehicleModel: '',
    vehicleColor: '',
    photo: '',
    badgeNumber: '',
  });
  const [showCamera, setShowCamera] = useState(false);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [suggestions, setSuggestions] = useState<AccessEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [vehicleModelSuggestions, setVehicleModelSuggestions] = useState<string[]>([]);
  const [vehicleColorSuggestions, setVehicleColorSuggestions] = useState<string[]>([]);
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [showColorSuggestions, setShowColorSuggestions] = useState(false);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [allVehicleModels, setAllVehicleModels] = useState<string[]>([]);
  const [allVehicleColors, setAllVehicleColors] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Device capture states
  const [deviceCaptureLoading, setDeviceCaptureLoading] = useState(false);
  const [deviceCaptureStatus, setDeviceCaptureStatus] = useState('');
  const [deviceCaptureStep, setDeviceCaptureStep] = useState<import('@/lib/device-capture').CaptureStep | undefined>();
  const [deviceCaptureProgress, setDeviceCaptureProgress] = useState(0);
  const [captureAbortController, setCaptureAbortController] = useState<AbortController | null>(null);
  const [selectedFacialDeviceId, setSelectedFacialDeviceId] = useState('');
  const [showDeviceFacialDialog, setShowDeviceFacialDialog] = useState(false);
  const facialDevices = devices.filter(d => d.type === 'facial_recognition');

  useEffect(() => {
    loadBlockedVisitors();
    loadVehicleSuggestions();
  }, []);

  // Auto-correct pagination when current page exceeds total pages
  useEffect(() => {
    const total = Math.ceil(entries.filter(e => !e.exitTime).length / itemsPerPage);
    if (total > 0 && currentPage > total) {
      setCurrentPage(total);
    }
  }, [entries, currentPage]);

  const loadBlockedVisitors = async () => {
    const { data, error } = await supabase
      .from('blocked_visitors')
      .select('*')
      .eq('is_active', true)
      .order('blocked_at', { ascending: false });
    if (!error && data) setBlockedVisitors(data as BlockedVisitor[]);
  };

  const loadVehicleSuggestions = async () => {
    const [modelsRes, colorsRes, companiesRes] = await Promise.all([
      supabase.from('access_entries').select('vehicle_model').not('vehicle_model', 'is', null).not('vehicle_model', 'eq', ''),
      supabase.from('access_entries').select('vehicle_color').not('vehicle_color', 'is', null).not('vehicle_color', 'eq', ''),
      supabase.from('access_entries').select('company').not('company', 'is', null).not('company', 'eq', ''),
    ]);
    if (modelsRes.data) {
      const unique = [...new Set(modelsRes.data.map((r: any) => String(r.vehicle_model ?? '').trim().toUpperCase()))]
        .filter((value): value is string => Boolean(value))
        .sort();
      setAllVehicleModels(unique);
    }
    if (colorsRes.data) {
      const unique = [...new Set(colorsRes.data.map((r: any) => String(r.vehicle_color ?? '').trim().toUpperCase()))]
        .filter((value): value is string => Boolean(value))
        .sort();
      setAllVehicleColors(unique);
    }
    if (companiesRes.data) {
      const dbCompanies = companiesRes.data.map((r: any) => String(r.company ?? '').trim().toUpperCase()).filter(Boolean);
      const unique = [...new Set([...DEFAULT_COMPANIES, ...dbCompanies])].sort();
      setAllCompanies(unique);
    } else {
      setAllCompanies(DEFAULT_COMPANIES.sort());
    }
  };

  const filterVehicleModels = (query: string) => {
    if (!query) { setVehicleModelSuggestions(allVehicleModels.slice(0, 8)); return; }
    const q = query.toUpperCase();
    setVehicleModelSuggestions(allVehicleModels.filter(m => m.includes(q)).slice(0, 8));
  };

  const filterVehicleColors = (query: string) => {
    if (!query) { setVehicleColorSuggestions(allVehicleColors.slice(0, 8)); return; }
    const q = query.toUpperCase();
    setVehicleColorSuggestions(allVehicleColors.filter(c => c.includes(q)).slice(0, 8));
  };

  const filterCompanies = (query: string) => {
    if (!query) { setCompanySuggestions(allCompanies.slice(0, 8)); return; }
    const q = query.toUpperCase();
    setCompanySuggestions(allCompanies.filter(c => c.includes(q)).slice(0, 8));
  };

  const isVisitorBlocked = (document: string) => {
    return blockedVisitors.some(b => b.visitor_document === document && b.is_active);
  };

  const handleBlockVisitor = async (entry: AccessEntry) => {
    setBlockingEntry(entry);
    setBlockReason('');
    setShowBlockReasonDialog(true);
  };

  const confirmBlockVisitor = async () => {
    if (!blockingEntry) return;
    const { error } = await supabase.from('blocked_visitors').insert({
      visitor_name: blockingEntry.visitorName,
      visitor_document: blockingEntry.visitorDocument,
      reason: blockReason || null,
    });
    if (error) {
      toast.error('Erro ao bloquear visitante');
      return;
    }
    toast.success(`${blockingEntry.visitorName} foi bloqueado`);
    setShowBlockReasonDialog(false);
    setBlockingEntry(null);
    loadBlockedVisitors();
  };

  const handleUnblockVisitor = async (id: string) => {
    const { error } = await supabase
      .from('blocked_visitors')
      .update({ is_active: false })
      .eq('id', id);
    if (error) {
      toast.error('Erro ao desbloquear visitante');
      return;
    }
    toast.success('Visitante desbloqueado');
    loadBlockedVisitors();
  };

  const activeEntries = entries.filter(e => !e.exitTime);
  const filteredActiveEntries = activeEntries.filter(entry => entry.visitorName.toLowerCase().includes(searchTerm.toLowerCase()) || entry.apartment.toLowerCase().includes(searchTerm.toLowerCase()) || entry.visitorDocument.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.ceil(filteredActiveEntries.length / itemsPerPage);
  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  if (safePage !== currentPage && totalPages > 0) {
    // Will be corrected on next render via useEffect below
  }
  const paginatedEntries = filteredActiveEntries.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  const filteredAllEntries = allEntries.filter(entry => entry.visitorName.toLowerCase().includes(searchTerm.toLowerCase()) || entry.apartment.toLowerCase().includes(searchTerm.toLowerCase()) || entry.visitorDocument.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPagesAll = Math.ceil(filteredAllEntries.length / itemsPerPageTable);
  const paginatedAllEntries = filteredAllEntries.slice((currentPageAll - 1) * itemsPerPageTable, currentPageAll * itemsPerPageTable);
  const filteredResidents = residents.filter(r => r.name.toLowerCase().includes(visitedLocationSearch.toLowerCase()) || r.apartment.toLowerCase().includes(visitedLocationSearch.toLowerCase()));
  
  const handleVisitedLocationSelect = (residentId: string, residentName: string, apartment: string) => {
    setVisitedLocationSearch(`${residentName} - ${apartment}`);
    setFormData({
      ...formData,
      residentId
    });
    setShowResidentSuggestions(false);
  };
  
  const findSimilarEntries = async (name: string, document: string, plate?: string) => {
    const nameReady = name && name.trim().length >= 5;
    const docReady = document && document.replace(/\D/g, '').length >= 5;
    const plateReady = plate && plate.replace(/[^a-zA-Z0-9]/g, '').length >= 3;
    if (!nameReady && !docReady && !plateReady) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    // Agora busca direto do banco de dados (ignorando o limite de 1000)
    const unique = await searchSimilarEntries(name, document, plate);
    
    if (unique.length > 0) {
      setSuggestions(unique.slice(0, 3));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };
  
  const applySuggestion = (entry: AccessEntry) => {
    setFormData({
      ...formData,
      visitorName: entry.visitorName,
      visitorDocument: entry.visitorDocument,
      visitorType: entry.visitorType,
      company: entry.company || '',
      vehiclePlate: entry.vehiclePlate || '',
      vehicleModel: entry.vehicleModel || '',
      vehicleColor: entry.vehicleColor || '',
      photo: entry.photo || '',
      badgeNumber: '',
    });
    setShowSuggestions(false);
    toast.success('Dados preenchidos automaticamente! Atribua um novo crachá.');
  };
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setStream(mediaStream);
      setShowCamera(true);
      setShowCameraDialog(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 200);
    } catch (error) {
      toast.error('Não foi possível acessar a câmera');
    }
  };
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
    setShowCameraDialog(false);
  };
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const photoData = canvasRef.current.toDataURL('image/jpeg');
        setFormData({
          ...formData,
          photo: photoData
        });
        stopCamera();
        toast.success('Foto capturada com sucesso!');
      }
    }
  };
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({
          ...formData,
          photo: reader.result as string
        });
        toast.success('Foto carregada com sucesso!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeviceCapture = async () => {
    const device = devices.find(d => d.id === selectedFacialDeviceId);
    if (!device) {
      toast.error('Selecione um dispositivo facial.');
      return;
    }
    const abortCtrl = new AbortController();
    setCaptureAbortController(abortCtrl);
    setDeviceCaptureLoading(true);
    setDeviceCaptureStatus('Iniciando...');
    setDeviceCaptureStep('preparing');
    setDeviceCaptureProgress(5);
    try {
      const resident = residents.find(r => r.id === formData.residentId);
      const personInfo = formData.visitorName && formData.visitorDocument ? {
        name: formData.visitorName,
        apartment: resident?.apartment,
        document: formData.visitorDocument,
        identifier: `sp-${formData.visitorDocument}`,
        registration: formData.visitorDocument,
      } : undefined;
      const photo = await capturePhotoFromDevice(device, (msg, step, progress) => {
        setDeviceCaptureStatus(msg);
        if (step) setDeviceCaptureStep(step);
        if (progress !== undefined) setDeviceCaptureProgress(progress);
      }, abortCtrl.signal, personInfo);
      if (photo) {
        setFormData(prev => ({ ...prev, photo }));
        setShowDeviceFacialDialog(false);
        setDeviceCaptureStatus('');
        setDeviceCaptureStep(undefined);
        setDeviceCaptureProgress(0);
        toast.success('Foto capturada pelo dispositivo!');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      toast.error(isNetworkError ? 'Não foi possível conectar ao dispositivo.' : `Erro: ${err.message}`);
    } finally {
      setDeviceCaptureLoading(false);
      setCaptureAbortController(null);
    }
  };

  const handleEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setBadgeError(null);
    if (isVisitorBlocked(formData.visitorDocument)) {
      toast.error('Este visitante está bloqueado e não pode entrar!');
      return;
    }
    const resident = residents.find(r => r.id === formData.residentId);
    if (!resident) {
      toast.error('Selecione um morador válido');
      return;
    }

    // Check for duplicate active entry (same document, still inside)
    const isNew = !editingId;
    if (isNew && formData.visitorDocument.trim()) {
      const { data: activeData } = await supabase
        .from('access_entries')
        .select('id, visitor_name, apartment')
        .eq('visitor_document', formData.visitorDocument.trim().toUpperCase())
        .is('exit_time', null)
        .limit(1);
      if (activeData && activeData.length > 0) {
        toast.error(`${activeData[0].visitor_name} já possui uma entrada ativa (${activeData[0].apartment}). Registre a saída antes de cadastrar nova entrada.`);
        return;
      }
    }

    // Check badge availability before saving (for new entries)
    if (isNew && formData.badgeNumber && formData.badgeNumber.trim()) {
      const { data: badgeData } = await supabase
        .from('access_entries')
        .select('id, visitor_name, apartment, badge_number')
        .eq('badge_number', formData.badgeNumber.trim().toUpperCase())
        .is('exit_time', null)
        .limit(1);
      if (badgeData && badgeData.length > 0) {
        setBadgeError(`O crachá ${badgeData[0].badge_number} já está em uso por ${badgeData[0].visitor_name} (${badgeData[0].apartment}). Registre a saída antes de reutilizá-lo.`);
        return;
      }
    }
    
    const entryData: AccessEntry = editingId
      ? {
          ...allEntries.find(e => e.id === editingId)!,
          visitorName: formData.visitorName,
          visitorDocument: formData.visitorDocument,
          visitorType: formData.visitorType,
          residentId: formData.residentId,
          residentName: resident.name,
          apartment: resident.apartment,
          purpose: formData.purpose,
          vehiclePlate: formData.vehiclePlate,
          vehicleModel: formData.vehicleModel,
          vehicleColor: formData.vehicleColor,
          photo: formData.photo,
          company: formData.company,
          badgeNumber: formData.badgeNumber,
        }
      : {
          id: `entry_${Date.now()}`,
          visitorName: formData.visitorName,
          visitorDocument: formData.visitorDocument,
          visitorType: formData.visitorType,
          residentId: formData.residentId,
          residentName: resident.name,
          apartment: resident.apartment,
          purpose: formData.purpose,
          entryTime: new Date().toISOString(),
          exitTime: null,
          vehiclePlate: formData.vehiclePlate,
          vehicleModel: formData.vehicleModel,
          vehicleColor: formData.vehicleColor,
          photo: formData.photo,
          company: formData.company,
          badgeNumber: formData.badgeNumber,
          autoRecognized: showSuggestions && suggestions.length > 0
        };
    
    await saveEntry(entryData);
    
    // Auto-sync biometrics to all facial devices if visitor/provider has a photo
    if (formData.photo && formData.visitorDocument && facialDevices.length > 0) {
      const personInfo = {
        name: formData.visitorName,
        apartment: resident.apartment,
        document: formData.visitorDocument,
        identifier: `sp-${formData.visitorDocument}`,
        registration: formData.visitorDocument,
      };
      syncBiometricToAllDevices(facialDevices, personInfo, formData.photo, (msg) => {
        console.log('[BiometricSync Visitor]', msg);
      }).then(result => {
        if (result.synced > 0) {
          toast.success(`Biometria sincronizada em ${result.synced} dispositivo(s)`);
        }
        if (result.errors > 0) {
          toast.warning(`Falha em ${result.errors} dispositivo(s)`);
        }
      }).catch(err => {
        console.error('Biometric sync error:', err);
      });
    }

    // Notify resident about visitor arrival (only for new entries)
    if (!editingId && resident) {
      try {
        const { data: resData } = await supabase
          .from('residents')
          .select('auth_user_id')
          .eq('id', formData.residentId)
          .maybeSingle();
        if (resData?.auth_user_id) {
          await supabase.from('notifications').insert({
            user_id: resData.auth_user_id,
            title: '🚪 Visita registrada',
            body: `${formData.visitorName} chegou ao seu endereço`,
            type: 'entry',
          });
        }
      } catch (err) {
        console.error('Error notifying resident:', err);
      }
    }
    
    resetForm();
  };
  const handleEdit = (entry: AccessEntry) => {
    setEditingId(entry.id);
    setFormData({
      visitorName: entry.visitorName,
      visitorDocument: entry.visitorDocument,
      visitorType: entry.visitorType,
      residentId: entry.residentId,
      purpose: entry.purpose || '',
      company: entry.company || '',
      vehiclePlate: entry.vehiclePlate || '',
      vehicleModel: entry.vehicleModel || '',
      vehicleColor: entry.vehicleColor || '',
      photo: entry.photo || '',
      badgeNumber: entry.badgeNumber || '',
    });
    const resident = residents.find(r => r.id === entry.residentId);
    if (resident) {
      setVisitedLocationSearch(`${resident.name} - ${resident.apartment}`);
    }
    setIsDialogOpen(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cadastro?')) return;
    await deleteEntry(id);
  };
  const exportActiveEntriesToPDF = () => {
    const doc = new jsPDF();
    doc.text('Cadastros Ativos', 14, 15);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm', {
      locale: ptBR
    })}`, 14, 22);
    const tableData = filteredActiveEntries.map(entry => {
      const resident = residents.find(r => r.id === entry.residentId);
      return [entry.visitorName, entry.visitorDocument, resident?.name || '-', resident?.apartment || '-', getVisitorTypeLabel(entry.visitorType), entry.badgeNumber || '-', format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', {
        locale: ptBR
      })];
    });
    autoTable(doc, {
      head: [['Nome', 'Documento', 'Morador', 'Apt', 'Tipo', 'Crachá', 'Entrada']],
      body: tableData,
      startY: 28
    });
    doc.save(`cadastros-ativos-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('PDF gerado com sucesso');
  };
  const exportActiveEntriesToCSV = () => {
    const headers = ['Nome', 'Documento', 'Morador', 'Apt', 'Tipo', 'Crachá', 'Entrada'];
    const rows = filteredActiveEntries.map(entry => {
      const resident = residents.find(r => r.id === entry.residentId);
      return [entry.visitorName, entry.visitorDocument, resident?.name || '-', resident?.apartment || '-', getVisitorTypeLabel(entry.visitorType), entry.badgeNumber || '-', format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR })];
    });
    exportToCSV(`cadastros-ativos-${format(new Date(), 'dd-MM-yyyy')}`, headers, rows);
    toast.success('CSV gerado com sucesso');
  };
  const exportAllEntriesToPDF = () => {
    const doc = new jsPDF();
    doc.text('Todos os Cadastros', 14, 15);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm', {
      locale: ptBR
    })}`, 14, 22);
    const tableData = filteredAllEntries.map(entry => {
      const resident = residents.find(r => r.id === entry.residentId);
      return [entry.visitorName, entry.visitorDocument, resident?.name || '-', resident?.apartment || '-', entry.badgeNumber || '-', format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', {
        locale: ptBR
      }), entry.exitTime ? format(new Date(entry.exitTime), 'dd/MM/yyyy HH:mm', {
        locale: ptBR
      }) : 'Ativo'];
    });
    autoTable(doc, {
      head: [['Nome', 'Documento', 'Morador', 'Apt', 'Crachá', 'Entrada', 'Saída']],
      body: tableData,
      startY: 28
    });
    doc.save(`todos-cadastros-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('PDF gerado com sucesso');
  };
  const exportAllEntriesToCSV = () => {
    const headers = ['Nome', 'Documento', 'Morador', 'Apt', 'Crachá', 'Entrada', 'Saída'];
    const rows = filteredAllEntries.map(entry => {
      const resident = residents.find(r => r.id === entry.residentId);
      return [entry.visitorName, entry.visitorDocument, resident?.name || '-', resident?.apartment || '-', entry.badgeNumber || '-', format(new Date(entry.entryTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }), entry.exitTime ? format(new Date(entry.exitTime), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Ativo'];
    });
    exportToCSV(`todos-cadastros-${format(new Date(), 'dd-MM-yyyy')}`, headers, rows);
    toast.success('CSV gerado com sucesso');
  };
  const resetForm = () => {
    setEditingId('');
    setFormData({
      visitorName: '',
      visitorDocument: '',
      visitorType: 'visitor',
      residentId: '',
      purpose: '',
      company: '',
      vehiclePlate: '',
      vehicleModel: '',
      vehicleColor: '',
      photo: '',
      badgeNumber: '',
    });
    setVisitedLocationSearch('');
    setSuggestions([]);
    setShowSuggestions(false);
    setIsDialogOpen(false);
    stopCamera();
  };
  const handleExit = async (entryId: string) => {
    const entry = allEntries.find(e => e.id === entryId);
    if (!entry) return;
    
    const updatedEntry: AccessEntry = {
      ...entry,
      exitTime: new Date().toISOString(),
    };
    
    await saveEntry(updatedEntry);
  };
  return <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Novo Cadastro</h2>
          <p className="text-muted-foreground">Registre entradas e saídas de visitantes e prestadores</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBlockedDialog(true)} className="gap-2">
            <ShieldBan className="h-5 w-5" />
            Bloqueados
            {blockedVisitors.length > 0 && (
              <Badge variant="destructive" className="ml-1">{blockedVisitors.length}</Badge>
            )}
          </Button>
          <Button onClick={() => { setBadgeError(null); setIsDialogOpen(true); }} size="lg" className="gap-2 text-primary-foreground">
            <Plus className="h-5 w-5" />
            Nova Entrada
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <LogOut className="h-5 w-5 text-warning" />
              <span>Ativos no Condomínio</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-normal text-muted-foreground">
                {activeEntries.length} {activeEntries.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
              <Button variant="outline" size="sm" onClick={exportActiveEntriesToPDF}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportActiveEntriesToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, documento ou apartamento..." value={searchTerm} onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
              setCurrentPageAll(1);
            }} className="pl-10" />
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Foto</TableHead>
                  <TableHead>Visitante</TableHead>
                  <TableHead>Apartamento</TableHead>
                  <TableHead>Crachá</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead className="text-right w-[180px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.length === 0 ? <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'Nenhum registro encontrado' : 'Nenhuma pessoa no momento'}
                    </TableCell>
                  </TableRow> : paginatedEntries.map(entry => <TableRow key={entry.id} className={`cursor-pointer ${entry.visitorType === 'delivery' ? 'bg-primary/5 hover:bg-primary/10' : entry.visitorType === 'service_provider' ? 'bg-warning/5 hover:bg-warning/10' : 'bg-success/5 hover:bg-success/10'}`} onClick={() => setSelectedDetailEntry(entry)}>
                      <TableCell>
                        {entry.photo ? <img src={entry.photo} alt={entry.visitorName} className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" /> : <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-3xl">
                            {entry.visitorType === 'delivery' ? '📦' : entry.visitorType === 'service_provider' ? '🔧' : '👤'}
                          </div>}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{entry.visitorName}</p>
                          <p className="text-xs text-muted-foreground">{entry.visitorDocument}</p>
                          {entry.company && <p className="text-xs text-muted-foreground">🏢 {entry.company}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.apartment}</p>
                          <p className="text-xs text-muted-foreground">{entry.residentName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {entry.badgeNumber || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(entry.entryTime).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.vehiclePlate ? <div>
                            <p>🚗 {entry.vehiclePlate}</p>
                            {entry.vehicleModel && <p className="text-xs">{entry.vehicleModel}</p>}
                          </div> : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} className="h-8 w-8" title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleBlockVisitor(entry); }} className="h-8 w-8 text-destructive hover:text-destructive" title="Bloquear">
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleExit(entry.id); }} className="h-8">
                            <LogOut className="h-4 w-4 mr-1" />
                            Saída
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>)}
              </TableBody>
            </Table>
          </div>
          
          <StandardPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="mt-4" />
        </CardContent>
      </Card>


      {/* Detail Modal for Active Entries */}
      <Dialog open={!!selectedDetailEntry} onOpenChange={(open) => { if (!open) setSelectedDetailEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" />
              Detalhes do Cadastro Ativo
            </DialogTitle>
          </DialogHeader>
          {selectedDetailEntry && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {selectedDetailEntry.photo ? (
                  <img src={selectedDetailEntry.photo} alt={selectedDetailEntry.visitorName} className="w-24 h-24 rounded-full object-cover border-2 border-primary/20" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-4xl">
                    {selectedDetailEntry.visitorType === 'delivery' ? '📦' : selectedDetailEntry.visitorType === 'service_provider' ? '🔧' : '👤'}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold">{selectedDetailEntry.visitorName}</h3>
                  <Badge variant={selectedDetailEntry.visitorType === 'delivery' ? 'default' : selectedDetailEntry.visitorType === 'service_provider' ? 'outline' : 'secondary'}>
                    {selectedDetailEntry.visitorType === 'delivery' ? 'Entregador' : selectedDetailEntry.visitorType === 'service_provider' ? 'Prestador de Serviço' : 'Visitante'}
                  </Badge>
                  <Badge variant="default" className="ml-2 bg-success">Ativo</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block">Documento</span>
                  <span className="font-medium">{selectedDetailEntry.visitorDocument}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Crachá</span>
                  <span className="font-medium font-mono">{selectedDetailEntry.badgeNumber || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Visitando</span>
                  <span className="font-medium">{selectedDetailEntry.residentName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Apartamento</span>
                  <span className="font-medium">{selectedDetailEntry.apartment}</span>
                </div>
                {selectedDetailEntry.purpose && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block">Motivo</span>
                    <span className="font-medium">{selectedDetailEntry.purpose}</span>
                  </div>
                )}
                {selectedDetailEntry.company && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block">Empresa</span>
                    <span className="font-medium">{selectedDetailEntry.company}</span>
                  </div>
                )}
              </div>

              {(selectedDetailEntry.vehiclePlate || selectedDetailEntry.vehicleModel || selectedDetailEntry.vehicleColor) && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold mb-2">Veículo</h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground block">Placa</span>
                      <span className="font-medium">{selectedDetailEntry.vehiclePlate || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Modelo</span>
                      <span className="font-medium">{selectedDetailEntry.vehicleModel || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Cor</span>
                      <span className="font-medium">{selectedDetailEntry.vehicleColor || '-'}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex items-center gap-2 text-success">
                  <LogIn className="h-4 w-4" />
                  <span className="text-sm font-medium">Entrada: {new Date(selectedDetailEntry.entryTime).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setSelectedDetailEntry(null); handleEdit(selectedDetailEntry); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button size="sm" onClick={() => { setSelectedDetailEntry(null); handleExit(selectedDetailEntry.id); }}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Registrar Saída
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={isDialogOpen} onOpenChange={open => {
      if (!open) resetForm();
      setIsDialogOpen(open);
    }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Cadastro' : 'Registrar Nova Entrada'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEntry} className="space-y-4" autoComplete="off" data-form-type="other" data-lpignore="true">
              {/* Hidden fields to trick browser autocomplete */}
              <input type="text" name="fake_field_1" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
              <input type="text" name="fake_field_2" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
              {/* Blocked visitor alert */}
              {formData.visitorDocument && isVisitorBlocked(formData.visitorDocument) && (
                <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="rounded-full bg-destructive p-2 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
                  </div>
                  <div>
                    <h4 className="font-bold text-destructive text-base">⚠️ VISITANTE BLOQUEADO</h4>
                    <p className="text-sm text-destructive/90 mt-1">
                      Este documento consta na lista de bloqueio. A entrada <strong>não será permitida</strong>.
                    </p>
                    {blockedVisitors.find(b => b.visitor_document === formData.visitorDocument)?.reason && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Motivo: {blockedVisitors.find(b => b.visitor_document === formData.visitorDocument)?.reason}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Badge in use alert */}
              {badgeError && (
                <div className="rounded-lg border-2 border-warning bg-warning/10 p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="rounded-full bg-warning p-2 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-warning-foreground" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-foreground text-base">⚠️ Crachá em uso</h4>
                    <p className="text-sm text-muted-foreground mt-1">{badgeError}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setBadgeError(null)}>
                    OK
                  </Button>
                </div>
              )}

              {/* Row 1: Tipo + Nome + Documento */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="visitorType" className="text-xs">Tipo *</Label>
                  <Select value={formData.visitorType} onValueChange={(value: 'visitor' | 'service_provider' | 'delivery') => setFormData({
                ...formData,
                visitorType: value
              })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visitor">👤 Visitante</SelectItem>
                      <SelectItem value="service_provider">🔧 Prestador</SelectItem>
                      <SelectItem value="delivery">📦 Entregador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="visitorName" className="text-xs">Nome Completo *</Label>
                  <Input id="vn_field" name="vn_field" className="h-9" value={formData.visitorName} autoComplete="one-time-code" readOnly onFocus={e => e.currentTarget.removeAttribute('readOnly')} onChange={e => {
                setFormData({
                  ...formData,
                  visitorName: e.target.value
                });
                findSimilarEntries(e.target.value, formData.visitorDocument, formData.vehiclePlate);
              }} placeholder="Nome completo" required />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="visitorDocument" className="text-xs">RG/CPF *</Label>
                  <Input id="vd_field" name="vd_field" className="h-9" value={formData.visitorDocument} autoComplete="one-time-code" readOnly onFocus={e => e.currentTarget.removeAttribute('readOnly')} onChange={e => {
                setFormData({
                  ...formData,
                  visitorDocument: e.target.value
                });
                findSimilarEntries(formData.visitorName, e.target.value, formData.vehiclePlate);
              }} placeholder="Número do documento" required />
                </div>
              </div>

              {showSuggestions && suggestions.length > 0 && <div className="p-2 bg-primary/10 border border-primary rounded-lg">
                  <p className="text-xs font-semibold text-primary mb-1">✨ Cadastros encontrados:</p>
                  <div className="space-y-1">
                    {suggestions.map(suggestion => <button key={suggestion.id} type="button" onClick={() => applySuggestion(suggestion)} className="w-full text-left px-3 py-2 bg-background rounded hover:bg-muted transition-colors text-sm flex items-center justify-between gap-3">
                        <span className="font-medium truncate">{suggestion.visitorName}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap">
                          Doc: {suggestion.visitorDocument}
                        </span>
                      </button>)}
                  </div>
                </div>}

              {/* Row 2: Visitando + Empresa (if service provider) + Crachá */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 relative md:col-span-1">
                  <Label htmlFor="residentId">Visitando *</Label>
                  <Input id="vl_field" name="vl_field" value={visitedLocationSearch} autoComplete="one-time-code" readOnly onFocus={e => { e.currentTarget.removeAttribute('readOnly'); setShowResidentSuggestions(visitedLocationSearch.length > 0); }} onChange={e => {
                setVisitedLocationSearch(e.target.value);
                setShowResidentSuggestions(e.target.value.length > 0);
              }} placeholder="Morador ou apt" required />
                  {showResidentSuggestions && filteredResidents.length > 0 && <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {filteredResidents.slice(0, 5).map(resident => <button key={resident.id} type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-sm" onClick={() => handleVisitedLocationSelect(resident.id, resident.name, resident.apartment)}>
                          <span className="font-medium">{resident.name}</span>
                          <span className="text-muted-foreground ml-2">{resident.apartment}</span>
                        </button>)}
                    </div>}
                </div>

                <div className="space-y-2 relative">
                  <Label htmlFor="company">{formData.visitorType === 'visitor' ? 'Empresa (opcional)' : 'Empresa'}</Label>
                  <Input id="co_field" name="co_field" value={formData.company} autoComplete="one-time-code" readOnly onFocus={e => { e.currentTarget.removeAttribute('readOnly'); filterCompanies(formData.company); setShowCompanySuggestions(true); }} onChange={e => { setFormData({ ...formData, company: e.target.value }); filterCompanies(e.target.value); setShowCompanySuggestions(true); }} onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 150)} placeholder="iFood, Uber, Mercado Livre..." />
                  {showCompanySuggestions && companySuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {companySuggestions.map(comp => (
                        <button key={comp} type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-sm" onClick={() => { setFormData({ ...formData, company: comp }); setShowCompanySuggestions(false); }}>
                          {comp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="badgeNumber">Nº Crachá</Label>
                  <Input id="bn_field" name="bn_field" value={formData.badgeNumber} onChange={e => setFormData({
                ...formData,
                badgeNumber: e.target.value
              })} placeholder="Ex: 001" />
                </div>
              </div>

              {/* Row 3: Veículo + Motivo */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehiclePlate">Placa</Label>
              <Input id="vp_field" name="vp_field" value={formData.vehiclePlate} onChange={e => {
                setFormData({
                  ...formData,
                  vehiclePlate: e.target.value
                });
                findSimilarEntries(formData.visitorName, formData.visitorDocument, e.target.value);
              }} placeholder="ABC-1234" />
                </div>

                <div className="space-y-2 relative">
                  <Label htmlFor="vehicleModel">Modelo</Label>
                  <Input id="vm_field" name="vm_field" value={formData.vehicleModel} autoComplete="one-time-code" readOnly onFocus={e => { e.currentTarget.removeAttribute('readOnly'); filterVehicleModels(formData.vehicleModel); setShowModelSuggestions(true); }} onChange={e => { setFormData({ ...formData, vehicleModel: e.target.value }); filterVehicleModels(e.target.value); setShowModelSuggestions(true); }} onBlur={() => setTimeout(() => setShowModelSuggestions(false), 150)} placeholder="Honda Civic" />
                  {showModelSuggestions && vehicleModelSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {vehicleModelSuggestions.map(model => (
                        <button key={model} type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-sm" onClick={() => { setFormData({ ...formData, vehicleModel: model }); setShowModelSuggestions(false); }}>
                          {model}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 relative">
                  <Label htmlFor="vehicleColor">Cor</Label>
                  <Input id="vc_field" name="vc_field" value={formData.vehicleColor} autoComplete="one-time-code" readOnly onFocus={e => { e.currentTarget.removeAttribute('readOnly'); filterVehicleColors(formData.vehicleColor); setShowColorSuggestions(true); }} onChange={e => { setFormData({ ...formData, vehicleColor: e.target.value }); filterVehicleColors(e.target.value); setShowColorSuggestions(true); }} onBlur={() => setTimeout(() => setShowColorSuggestions(false), 150)} placeholder="Preto" />
                  {showColorSuggestions && vehicleColorSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {vehicleColorSuggestions.map(color => (
                        <button key={color} type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-sm" onClick={() => { setFormData({ ...formData, vehicleColor: color }); setShowColorSuggestions(false); }}>
                          {color}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose">Motivo</Label>
                  <Input id="pp_field" name="pp_field" value={formData.purpose} onChange={e => setFormData({
                ...formData,
                purpose: e.target.value
              })} placeholder="Visita, manutenção..." />
                </div>
              </div>

              {/* Row 4: Foto */}
              <div className="space-y-2 flex items-center gap-4">
                <div>
                  {formData.photo ? (
                    <img src={formData.photo} alt="Foto" className="w-24 h-24 rounded-full object-cover border-2 border-primary" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      Sem foto
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Foto do Visitante</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="outline" onClick={startCamera}>
                      📷 Webcam
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('photoUpload')?.click()}>
                      📁 Carregar
                    </Button>
                    {facialDevices.length > 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowDeviceFacialDialog(true)} className="gap-1">
                        <ScanFace className="h-4 w-4" />
                        Dispositivo
                      </Button>
                    )}
                    {formData.photo && (
                      <Button type="button" size="sm" variant="destructive" onClick={() => setFormData({ ...formData, photo: '' })}>
                        🗑️ Remover
                      </Button>
                    )}
                  </div>
                </div>
                <input id="photoUpload" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>




              <div className="flex space-x-2">
                <Button type="submit" className="flex-1">
                  <LogIn className="h-4 w-4 mr-2" />
                  {editingId ? 'Salvar Alterações' : 'Registrar Entrada'}
                </Button>
                <Button type="button" variant="destructive" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      {/* Camera Capture Dialog */}
      <Dialog open={showCameraDialog} onOpenChange={(open) => {
        if (!open) stopCamera();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Capturar Foto do Visitante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden border-2 border-primary/20 bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg" />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={capturePhoto} className="flex-1 gap-2">
                <Camera className="h-4 w-4" />
                Capturar Foto
              </Button>
              <Button type="button" variant="secondary" onClick={stopCamera}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={showBlockedDialog} onOpenChange={setShowBlockedDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldBan className="h-5 w-5 text-destructive" />
              Visitantes/Prestadores Bloqueados
            </DialogTitle>
          </DialogHeader>
          {blockedVisitors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum visitante bloqueado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedVisitors.map(bv => (
                  <TableRow key={bv.id}>
                    <TableCell className="font-medium">{bv.visitor_name}</TableCell>
                    <TableCell>{bv.visitor_document}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{bv.reason || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(bv.blocked_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleUnblockVisitor(bv.id)} className="gap-1">
                        <ShieldCheck className="h-4 w-4" />
                        Desbloquear
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Block Reason Dialog */}
      <Dialog open={showBlockReasonDialog} onOpenChange={setShowBlockReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Bloquear {blockingEntry?.visitorName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo do bloqueio (opcional)</Label>
              <Textarea
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Informe o motivo do bloqueio..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBlockReasonDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmBlockVisitor}>
                <Ban className="h-4 w-4 mr-2" />
                Confirmar Bloqueio
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Device Facial Capture Dialog */}
      <Dialog open={showDeviceFacialDialog} onOpenChange={setShowDeviceFacialDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-primary" />
              Captura Facial pelo Dispositivo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dispositivo Facial</Label>
              <Select value={selectedFacialDeviceId} onValueChange={setSelectedFacialDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o dispositivo..." />
                </SelectTrigger>
                <SelectContent>
                  {facialDevices.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      <div className="flex items-center gap-2">
                        {d.status === 'online' ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-destructive" />}
                        {d.name} - {d.location}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DeviceCaptureStatus
              status={deviceCaptureStatus}
              step={deviceCaptureStep}
              progress={deviceCaptureProgress}
              loading={deviceCaptureLoading}
              onCancel={() => captureAbortController?.abort()}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleDeviceCapture}
                disabled={!selectedFacialDeviceId || deviceCaptureLoading}
                className="flex-1 gap-2"
              >
                {deviceCaptureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                Capturar Foto
              </Button>
              <Button variant="secondary" onClick={() => setShowDeviceFacialDialog(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
};