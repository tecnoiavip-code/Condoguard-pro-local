import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Camera, Tag, CreditCard, Pencil, Trash2, Plus, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Device } from '@/types';
import { useDevices } from '@/hooks/useDevices';
import { useResidents } from '@/hooks/useResidents';
import {
  pushConfigToAllDevices,
  reconcileFromDevices,
  syncAllResidentsToDevices,
} from '@/lib/device-capture';
import { supabaseStorage } from '@/lib/supabase-storage';
import { toast } from 'sonner';
import {
  getSyncJobState,
  setSyncJobState,
  resetSyncJob,
  subscribeSyncJob,
  isSyncRunning,
  markSyncRunning,
  type SyncJobState,
} from '@/lib/sync-job-store';

// Health indicator color: green = ok, yellow = attention, red = offline
const getDeviceHealth = (device: Device): { color: string; label: string } => {
  if (device.status !== 'online') return { color: 'bg-destructive', label: 'Desconectado' };
  const last = device.lastSync ? new Date(device.lastSync).getTime() : 0;
  const ageMin = (Date.now() - last) / 60000;
  if (!last || ageMin > 10) return { color: 'bg-yellow-500', label: 'Atenção: sem sync recente' };
  return { color: 'bg-green-500', label: 'Sincronizado e online' };
};

export const Devices = () => {
  const { devices, loading, saveDevice, deleteDevice } = useDevices();
  const { residents, refresh: refreshResidents } = useResidents();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [job, setJob] = useState<SyncJobState>(() => getSyncJobState());

  useEffect(() => {
    const unsub = subscribeSyncJob(setJob);
    setJob(getSyncJobState());
    return unsub;
  }, []);

  const syncing = job.status === 'running';
  const [formData, setFormData] = useState({
    name: '',
    type: 'facial_recognition' as Device['type'],
    location: '',
    status: 'online' as Device['status'],
    ipAddress: '',
    serialNumber: '',
  });

  const handleSyncAll = async () => {
    if (devices.length === 0) {
      toast.error('Nenhum dispositivo cadastrado');
      return;
    }
    if (isSyncRunning()) {
      toast.info('Já existe uma sincronização em andamento.');
      return;
    }
    if (!confirm('Sincronizar tudo: enviará configuração do webhook, reconciliará faces/TAGs do hardware e replicará todos os moradores (faces e TAGs) em todos os dispositivos. Esta operação continua mesmo se você sair desta página. Continuar?')) {
      return;
    }

    markSyncRunning(true);
    resetSyncJob();
    setSyncJobState({
      status: 'running',
      message: 'Iniciando...',
      total: residents.length,
      current: 0,
      photosSynced: 0,
      tagsSynced: 0,
      errors: 0,
      startedAt: Date.now(),
    });

    // Run in detached promise so it survives unmount
    (async () => {
      try {
        setSyncJobState({ message: 'Enviando configuração do webhook...' });
        const cfg = await pushConfigToAllDevices(devices);

        setSyncJobState({ message: `Reconciliando dados do hardware... (${cfg.success} configs OK)` });
        const rec = await reconcileFromDevices(devices, residents as any, () => { /* progress */ });

        await refreshResidents();

        setSyncJobState({
          message: `Replicando moradores nos dispositivos...`,
          photosSynced: rec.photosAdded,
          tagsSynced: rec.tagsAdded,
        });

        const result = await syncAllResidentsToDevices(
          devices,
          residents as any,
          (id) => supabaseStorage.getResidentPhoto(id),
          (msg, current, total) => setSyncJobState({ message: msg, current, total }),
        );

        const finalState = getSyncJobState();
        setSyncJobState({
          status: 'done',
          message: 'Sincronização concluída!',
          photosSynced: finalState.photosSynced + result.photosSynced,
          tagsSynced: finalState.tagsSynced + result.tagsSynced,
          errors: finalState.errors + result.errors,
          finishedAt: Date.now(),
        });
        toast.success('Sincronização concluída', {
          description: `${result.photosSynced} face(s), ${result.tagsSynced} TAG(s)${result.errors > 0 ? `, ${result.errors} erro(s)` : ''}`,
          duration: 8000,
        });
      } catch (err: any) {
        console.error('Sync error:', err);
        setSyncJobState({
          status: 'error',
          message: err?.message || 'Erro na sincronização',
          finishedAt: Date.now(),
        });
        toast.error('Erro na sincronização', { description: err?.message || 'Tente novamente' });
      } finally {
        markSyncRunning(false);
      }
    })();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deviceData: Device = {
      id: editingId || `dev_${Date.now()}`,
      ...formData,
      lastSync: new Date().toISOString(),
    };
    const success = await saveDevice(deviceData);
    if (success) resetForm();
  };

  const handleEdit = (device: Device) => {
    setEditingId(device.id);
    setFormData({
      name: device.name,
      type: device.type,
      location: device.location,
      status: device.status,
      ipAddress: device.ipAddress || '',
      serialNumber: device.serialNumber || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este dispositivo?')) return;
    await deleteDevice(id);
  };

  const toggleStatus = async (id: string) => {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    await saveDevice({
      ...device,
      status: device.status === 'online' ? 'offline' : 'online',
      lastSync: new Date().toISOString(),
    });
  };

  const resetForm = () => {
    setEditingId('');
    setFormData({
      name: '', type: 'facial_recognition', location: '', status: 'online',
      ipAddress: '', serialNumber: '',
    });
    setShowForm(false);
  };

  const getDeviceIcon = (type: Device['type']) => {
    switch (type) {
      case 'facial_recognition': return <Camera className="h-5 w-5" />;
      case 'vehicle_tag': return <Tag className="h-5 w-5" />;
      case 'card_reader': return <CreditCard className="h-5 w-5" />;
    }
  };

  const getDeviceTypeName = (type: Device['type']) => {
    switch (type) {
      case 'facial_recognition': return 'Reconhecimento Facial';
      case 'vehicle_tag': return 'TAG Veicular';
      case 'card_reader': return 'Leitor de Cartão';
    }
  };

  const progressPct = job.total > 0 ? Math.min(100, Math.round((job.current / job.total) * 100)) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Dispositivos</h2>
          <p className="text-muted-foreground">Gerencie os dispositivos de controle de acesso</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncAll} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar Tudo
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Dispositivo
          </Button>
        </div>
      </div>

      {(syncing || job.status === 'done' || job.status === 'error') && job.message && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-3">
              {syncing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {job.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {job.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
              <span className="text-sm text-muted-foreground flex-1">{job.message}</span>
              {job.total > 0 && (
                <span className="text-xs text-muted-foreground">{job.current}/{job.total}</span>
              )}
              {(job.status === 'done' || job.status === 'error') && (
                <Button size="sm" variant="ghost" onClick={resetSyncJob}>Fechar</Button>
              )}
            </div>
            {syncing && job.total > 0 && (
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            )}
            {(job.photosSynced > 0 || job.tagsSynced > 0 || job.errors > 0) && (
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>📷 {job.photosSynced} fotos</span>
                <span>🏷️ {job.tagsSynced} TAGs</span>
                {job.errors > 0 && <span className="text-destructive">⚠️ {job.errors} erros</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Editar Dispositivo' : 'Novo Dispositivo'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Dispositivo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Portaria Principal"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: Device['type']) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facial_recognition">📷 Reconhecimento Facial</SelectItem>
                      <SelectItem value="vehicle_tag">🏷️ TAG Veicular</SelectItem>
                      <SelectItem value="card_reader">💳 Leitor de Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Localização *</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Ex: Portaria 1, Garagem, etc."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: Device['status']) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">🟢 Online</SelectItem>
                      <SelectItem value="offline">🔴 Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ipAddress">Endereço IP</Label>
                  <Input
                    id="ipAddress"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Número de Série</Label>
                  <Input
                    id="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    placeholder="SN12345678"
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <Button type="submit" className="flex-1">
                  {editingId ? 'Salvar Alterações' : 'Cadastrar Dispositivo'}
                </Button>
                <Button type="button" variant="destructive" onClick={resetForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                Nenhum dispositivo cadastrado. Clique em "Novo Dispositivo" para começar.
              </p>
            </CardContent>
          </Card>
        ) : (
          devices.map((device) => (
            <Card key={device.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <div className={`p-2 rounded-lg ${device.status === 'online' ? 'bg-success/20' : 'bg-destructive/20'}`}>
                        {getDeviceIcon(device.type)}
                      </div>
                      <span
                        className={`absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${getDeviceHealth(device).color}`}
                        title={getDeviceHealth(device).label}
                        aria-label={getDeviceHealth(device).label}
                      />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{device.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{getDeviceTypeName(device.type)}</p>
                    </div>
                  </div>
                  <Badge variant={device.status === 'online' ? 'default' : 'destructive'}>
                    {device.status === 'online' ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                    {device.status === 'online' ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Localização:</span>
                    <span className="font-medium">{device.location}</span>
                  </div>
                  {device.ipAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IP:</span>
                      <span className="font-mono text-xs">{device.ipAddress}</span>
                    </div>
                  )}
                  {device.serialNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Série:</span>
                      <span className="font-mono text-xs">{device.serialNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última Sync:</span>
                    <span className="text-xs">{new Date(device.lastSync).toLocaleString('pt-BR')}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus(device.id)}
                    className="flex-1"
                  >
                    {device.status === 'online' ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(device)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(device.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
