import { useState, useEffect, useRef } from 'react';
import { supabaseStorage } from '@/lib/supabase-storage';
import { exportToCSV } from '@/lib/export-csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Save, X, Plus, Search, Download, FileSpreadsheet, ScanFace, Loader2, Tag, Wifi, WifiOff, ImageDown } from 'lucide-react';
import { DeviceCaptureStatus } from '@/components/DeviceCaptureStatus';
import { Badge } from '@/components/ui/badge';
import { Resident, Device } from '@/types';
import { useResidents } from '@/hooks/useResidents';
import { useDevices } from '@/hooks/useDevices';
import { toast } from 'sonner';
import { capturePhotoFromDevice, syncTagsFromDevice, syncPhotosFromDevices, syncBiometricToAllDevices, syncTagToAllDevices, removeUserFromAllDevices } from '@/lib/device-capture';
import StandardPagination from '@/components/StandardPagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Residents = () => {
  const { residents, loading, saveResident, deleteResident, refresh } = useResidents();
  const { devices } = useDevices();
  const [editingId, setEditingId] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedResidentPhoto, setSelectedResidentPhoto] = useState<string>('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 10;
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    apartment: '',
    phone: '',
    email: '',
    photo: '',
    vehiclePlate: '',
    vehicleModel: '',
    vehicleColor: '',
    vehicleTag: '',
  });
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Device capture states
  const [deviceCaptureLoading, setDeviceCaptureLoading] = useState(false);
  const [deviceCaptureStatus, setDeviceCaptureStatus] = useState('');
  const [deviceCaptureStep, setDeviceCaptureStep] = useState<import('@/lib/device-capture').CaptureStep | undefined>();
  const [deviceCaptureProgress, setDeviceCaptureProgress] = useState(0);
  const [captureAbortController, setCaptureAbortController] = useState<AbortController | null>(null);
  const [selectedFacialDeviceId, setSelectedFacialDeviceId] = useState('');
  const [showDeviceCaptureDialog, setShowDeviceCaptureDialog] = useState(false);

  // Tag sync states
  const [tagSyncLoading, setTagSyncLoading] = useState(false);
  const [selectedTagDeviceId, setSelectedTagDeviceId] = useState('');
  const [showTagSyncDialog, setShowTagSyncDialog] = useState(false);
  const [deviceTags, setDeviceTags] = useState<Array<{ value: string; userId?: number; userName?: string }>>([]);

  // Photo sync states
  const [photoSyncLoading, setPhotoSyncLoading] = useState(false);
  const [photoSyncStatus, setPhotoSyncStatus] = useState('');

  const facialDevices = devices.filter(d => d.type === 'facial_recognition');
  const tagDevices = devices.filter(d => d.type === 'vehicle_tag' || d.type === 'card_reader');

  const filteredResidents = residents.filter(resident =>
    resident.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resident.apartment.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (resident.cpf || '').includes(searchTerm)
  );
  const totalPages = Math.ceil(filteredResidents.length / itemsPerPage);
  const paginatedResidents = filteredResidents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const residentData: Resident = {
      id: editingId || `res_${Date.now()}`,
      ...formData,
      createdAt: editingId
        ? residents.find((r) => r.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    const savedResidentId = await saveResident(residentData);
    if (savedResidentId) {
      const personInfo = {
        name: formData.name,
        apartment: formData.apartment,
        document: formData.cpf,
        identifier: savedResidentId,
        registration: formData.cpf || undefined,
      };

      // Auto-sync biometrics (face) to all facial devices if resident has a photo
      if (formData.photo && facialDevices.length > 0) {
        syncBiometricToAllDevices(facialDevices, personInfo, formData.photo, (msg) => {
          console.log('[BiometricSync]', msg);
        }).then(result => {
          if (result.synced > 0) toast.success(`Biometria sincronizada em ${result.synced} dispositivo(s)`);
          if (result.errors > 0) toast.warning(`Biometria: falha em ${result.errors} dispositivo(s)`);
        }).catch(err => console.error('Biometric sync error:', err));
      }

      // Auto-sync vehicle TAG to all devices
      if (formData.vehicleTag && devices.length > 0) {
        syncTagToAllDevices(devices, personInfo, formData.vehicleTag).then(result => {
          if (result.synced > 0) toast.success(`TAG veicular sincronizada em ${result.synced} dispositivo(s)`);
          if (result.errors > 0) toast.warning(`TAG: falha em ${result.errors} dispositivo(s)`);
        }).catch(err => console.error('TAG sync error:', err));
      }

      resetForm();
    }
  };

  const handleEdit = async (resident: Resident) => {
    setEditingId(resident.id);
    const photo = await supabaseStorage.getResidentPhoto(resident.id);
    setFormData({
      name: resident.name,
      cpf: resident.cpf || '',
      apartment: resident.apartment,
      phone: resident.phone || '',
      email: resident.email || '',
      photo,
      vehiclePlate: resident.vehiclePlate || '',
      vehicleModel: resident.vehicleModel || '',
      vehicleColor: resident.vehicleColor || '',
      vehicleTag: resident.vehicleTag || '',
    });
    setIsDialogOpen(true);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
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
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const photoData = canvasRef.current.toDataURL('image/jpeg', 0.7);
        setFormData({ ...formData, photo: photoData });
        stopCamera();
        toast.success('Foto capturada!');
      }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result as string });
        toast.success('Foto carregada!');
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
      const personInfo = {
        name: formData.name,
        apartment: formData.apartment,
        document: formData.cpf,
        identifier: editingId || formData.cpf || formData.name,
        registration: formData.cpf || undefined,
      };
      const photo = await capturePhotoFromDevice(device, (msg, step, progress) => {
        setDeviceCaptureStatus(msg);
        if (step) setDeviceCaptureStep(step);
        if (progress !== undefined) setDeviceCaptureProgress(progress);
      }, abortCtrl.signal, personInfo);
      if (photo) {
        setFormData(prev => ({ ...prev, photo }));
        setShowDeviceCaptureDialog(false);
        setDeviceCaptureStatus('');
        setDeviceCaptureStep(undefined);
        setDeviceCaptureProgress(0);
        toast.success('Foto capturada pelo dispositivo!');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      toast.error(isNetworkError
        ? 'Não foi possível conectar ao dispositivo. Verifique se está na mesma rede.'
        : `Erro: ${err.message}`
      );
    } finally {
      setDeviceCaptureLoading(false);
      setCaptureAbortController(null);
    }
  };

  const handleSyncTags = async () => {
    const device = devices.find(d => d.id === selectedTagDeviceId);
    if (!device) {
      toast.error('Selecione um dispositivo de antena.');
      return;
    }

    setTagSyncLoading(true);
    setDeviceTags([]);

    try {
      const tags = await syncTagsFromDevice(device, (msg) => toast.info(msg, { duration: 2000 }));
      setDeviceTags(tags);
      if (tags.length === 0) {
        toast.info('Nenhuma TAG encontrada no dispositivo.');
      } else {
        toast.success(`${tags.length} TAGs encontradas!`);
      }
    } catch (err: any) {
      toast.error(`Erro ao sincronizar TAGs: ${err.message}`);
    } finally {
      setTagSyncLoading(false);
    }
  };

  const selectTag = (tagValue: string) => {
    setFormData(prev => ({ ...prev, vehicleTag: tagValue }));
    setShowTagSyncDialog(false);
    toast.success(`TAG ${tagValue} selecionada!`);
  };

  const handleViewDetail = async (resident: Resident) => {
    setSelectedResident(resident);
    setSelectedResidentPhoto('');
    setIsDetailOpen(true);
    const photo = await supabaseStorage.getResidentPhoto(resident.id);
    setSelectedResidentPhoto(photo);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza? Isso também removerá correspondências e o cadastro nos equipamentos.')) return;
    const ok = await deleteResident(id);
    if (ok && devices.length > 0) {
      // Remove user from all hardware devices in background
      removeUserFromAllDevices(devices, id).then(result => {
        if (result.removed > 0) toast.success(`Removido de ${result.removed} dispositivo(s)`);
        if (result.errors > 0) toast.warning(`Falha em ${result.errors} dispositivo(s)`);
      }).catch(err => console.error('Device removal error:', err));
    }
  };

  const exportResidentsToPDF = () => {
    const doc = new jsPDF();
    doc.text('Lista de Moradores', 14, 15);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 22);

    const tableData = filteredResidents.map(resident => [
      resident.name,
      resident.apartment,
      resident.cpf || '-',
      resident.phone || '-',
      resident.email || '-',
      resident.vehiclePlate ? `${resident.vehiclePlate} - ${resident.vehicleModel || ''}` : '-'
    ]);

    autoTable(doc, {
      head: [['Nome', 'Apt', 'CPF', 'Telefone', 'E-mail', 'Veículo']],
      body: tableData,
      startY: 28,
    });

    doc.save(`moradores-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('PDF gerado com sucesso');
  };

  const exportResidentsToCSV = () => {
    const headers = ['Nome', 'Apt', 'CPF', 'Telefone', 'E-mail', 'Veículo'];
    const rows = filteredResidents.map(resident => [
      resident.name, resident.apartment, resident.cpf || '-', resident.phone || '-',
      resident.email || '-', resident.vehiclePlate ? `${resident.vehiclePlate} - ${resident.vehicleModel || ''}` : '-',
    ]);
    exportToCSV(`moradores-${format(new Date(), 'dd-MM-yyyy')}`, headers, rows);
    toast.success('CSV gerado com sucesso');
  };

  const resetForm = () => {
    setEditingId('');
    setFormData({
      name: '',
      cpf: '',
      apartment: '',
      phone: '',
      email: '',
      photo: '',
      vehiclePlate: '',
      vehicleModel: '',
      vehicleColor: '',
      vehicleTag: '',
    });
    stopCamera();
    setIsDialogOpen(false);
    setShowDeviceCaptureDialog(false);
    setShowTagSyncDialog(false);
    setDeviceCaptureStatus('');
    setDeviceCaptureStep(undefined);
    setDeviceCaptureProgress(0);
    captureAbortController?.abort();
    setCaptureAbortController(null);
    setDeviceTags([]);
  };

  const handleSyncPhotos = async () => {
    if (!residents || residents.length === 0) {
      toast.error('Nenhum morador cadastrado');
      return;
    }
    setPhotoSyncLoading(true);
    setPhotoSyncStatus('Iniciando sincronização...');
    try {
      const result = await syncPhotosFromDevices(
        devices,
        residents,
        (msg, current, total) => setPhotoSyncStatus(`${msg} (${current} sincronizadas)`)
      );
      toast.success(`Sincronização concluída: ${result.synced} fotos importadas, ${result.skipped} ignoradas, ${result.errors} erros`);
      if (result.synced > 0) refresh();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao sincronizar fotos');
    } finally {
      setPhotoSyncLoading(false);
      setPhotoSyncStatus('');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Moradores</h2>
          <p className="text-muted-foreground">Cadastre e gerencie os moradores do condomínio</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSyncPhotos}
            variant="outline"
            disabled={photoSyncLoading || facialDevices.length === 0}
            className="gap-2"
          >
            {photoSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            {photoSyncLoading ? 'Sincronizando...' : 'Importar Fotos'}
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Novo Cadastro
          </Button>
        </div>
      </div>

      {photoSyncStatus && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-primary">{photoSyncStatus}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Lista de Moradores</span>
              <span className="text-sm font-normal text-muted-foreground">
                Total: {residents.length}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportResidentsToPDF}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportResidentsToCSV}>
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
              <Input
                placeholder="Buscar por nome, apartamento ou CPF..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Foto</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Apartamento</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead className="text-right w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedResidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum morador cadastrado ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedResidents.map((resident) => (
                    <TableRow key={resident.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleViewDetail(resident)}>
                      <TableCell>
                        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-3xl">
                          👤
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{resident.name}</TableCell>
                      <TableCell>{resident.apartment}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{resident.cpf || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {resident.phone || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {resident.email || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {resident.vehiclePlate ? (
                          <div className="space-y-1">
                            <div>🚗 {resident.vehiclePlate}</div>
                            {resident.vehicleModel && (
                              <div className="text-xs">{resident.vehicleModel}</div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleEdit(resident); }}
                            className="h-8 w-8"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleDelete(resident.id); }}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Detail Modal */}
          <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Detalhes do Morador</DialogTitle>
              </DialogHeader>
              {selectedResident && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {selectedResidentPhoto ? (
                      <img src={selectedResidentPhoto} alt={selectedResident.name} className="w-24 h-24 rounded-full object-cover border-2 border-primary/20" />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-4xl">👤</div>
                    )}
                    <div>
                      <h3 className="text-xl font-semibold">{selectedResident.name}</h3>
                      <p className="text-muted-foreground">Apartamento {selectedResident.apartment}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground block">CPF</span>
                      <span className="font-medium">{selectedResident.cpf || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Telefone</span>
                      <span className="font-medium">{selectedResident.phone || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground block">E-mail</span>
                      <span className="font-medium">{selectedResident.email || '-'}</span>
                    </div>
                  </div>

                  {(selectedResident.vehiclePlate || selectedResident.vehicleModel || selectedResident.vehicleColor || selectedResident.vehicleTag) && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold mb-2">Veículo</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block">Placa</span>
                          <span className="font-medium">{selectedResident.vehiclePlate || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Modelo</span>
                          <span className="font-medium">{selectedResident.vehicleModel || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Cor</span>
                          <span className="font-medium">{selectedResident.vehicleColor || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">TAG</span>
                          <span className="font-medium">{selectedResident.vehicleTag || '-'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-3 text-xs text-muted-foreground">
                    Cadastrado em: {selectedResident.createdAt ? format(new Date(selectedResident.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setIsDetailOpen(false); handleEdit(selectedResident); }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          <StandardPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="mt-4" />
        </CardContent>
      </Card>

      {/* Registration Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Morador' : 'Cadastro de Morador'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Foto Section */}
              <div className="space-y-2 md:col-span-3 flex items-center gap-4">
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
                  <Label>Foto do Morador</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="outline" onClick={startCamera}>
                      📷 Webcam
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('photoUpload')?.click()}>
                      📁 Carregar
                    </Button>
                    {facialDevices.length > 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowDeviceCaptureDialog(true)} className="gap-1">
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
                  <input
                    id="photoUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
              </div>

              {/* Camera Modal */}
              {showCamera && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 md:col-span-3">
                  <div className="bg-background p-4 rounded-lg">
                    <video ref={videoRef} autoPlay className="w-full max-w-md rounded-lg" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex gap-2 mt-4">
                      <Button type="button" onClick={capturePhoto}>
                        📸 Capturar
                      </Button>
                      <Button type="button" variant="secondary" onClick={stopCamera}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Info */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do morador"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00 (opcional)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apartment">Apartamento/Casa *</Label>
                <Input
                  id="apartment"
                  value={formData.apartment}
                  onChange={(e) => setFormData({ ...formData, apartment: e.target.value })}
                  placeholder="Ex: Apto 101"
                  required
                />
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (com DDD)</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="11999999999"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="exemplo@email.com"
                />
              </div>

              {/* Vehicle Info */}
              <div className="space-y-2">
                <Label htmlFor="vehiclePlate">Placa do Veículo</Label>
                <Input
                  id="vehiclePlate"
                  value={formData.vehiclePlate}
                  onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                  placeholder="ABC-1234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleModel">Modelo do Veículo</Label>
                <Input
                  id="vehicleModel"
                  value={formData.vehicleModel}
                  onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                  placeholder="Ex: Honda Civic"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleColor">Cor do Veículo</Label>
                <Input
                  id="vehicleColor"
                  value={formData.vehicleColor}
                  onChange={(e) => setFormData({ ...formData, vehicleColor: e.target.value })}
                  placeholder="Ex: Preto"
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="vehicleTag">TAG Veicular</Label>
                <div className="flex gap-2">
                  <Input
                    id="vehicleTag"
                    value={formData.vehicleTag}
                    onChange={(e) => setFormData({ ...formData, vehicleTag: e.target.value })}
                    placeholder="Número da TAG de acesso"
                    className="flex-1"
                  />
                  {tagDevices.length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowTagSyncDialog(true)} className="gap-1 whitespace-nowrap">
                      <Tag className="h-4 w-4" />
                      Buscar do Dispositivo
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button type="submit" className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                {editingId ? 'Salvar Alterações' : 'Cadastrar Morador'}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Device Facial Capture Dialog */}
      <Dialog open={showDeviceCaptureDialog} onOpenChange={setShowDeviceCaptureDialog}>
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
              <Button variant="secondary" onClick={() => setShowDeviceCaptureDialog(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Sync Dialog */}
      <Dialog open={showTagSyncDialog} onOpenChange={setShowTagSyncDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Sincronizar TAG do Dispositivo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dispositivo de Antena/TAG</Label>
              <Select value={selectedTagDeviceId} onValueChange={setSelectedTagDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o dispositivo..." />
                </SelectTrigger>
                <SelectContent>
                  {tagDevices.map(d => (
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

            <Button
              onClick={handleSyncTags}
              disabled={!selectedTagDeviceId || tagSyncLoading}
              className="w-full gap-2"
            >
              {tagSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
              Buscar TAGs
            </Button>

            {deviceTags.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <Label className="text-xs text-muted-foreground">Selecione a TAG para vincular:</Label>
                {deviceTags.map((tag, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectTag(tag.value)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono font-medium">{tag.value}</p>
                      {tag.userName && (
                        <p className="text-xs text-muted-foreground">{tag.userName}</p>
                      )}
                    </div>
                    <Badge variant="outline">Selecionar</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
