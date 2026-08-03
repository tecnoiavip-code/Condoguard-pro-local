import { useState, useEffect } from 'react';
import { supabaseStorage } from '@/lib/supabase-storage';
import { supabase } from '@/integrations/supabase/client';
import { Device } from '@/types';
import { toast } from 'sonner';

export const useDevices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDevices = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const data = await supabaseStorage.getDevices();
    setDevices(data);
    setLoading(false);
  };

  useEffect(() => {
    loadDevices(true);

    // Realtime subscription for device status updates
    const channel = supabase
      .channel('devices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        loadDevices();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveDevice = async (device: Device) => {
    const success = await supabaseStorage.saveDevice(device);
    if (success) {
      await loadDevices();
      return true;
    }
    toast.error('Erro ao salvar dispositivo');
    return false;
  };

  const deleteDevice = async (id: string) => {
    const success = await supabaseStorage.deleteDevice(id);
    if (success) {
      await loadDevices();
      return true;
    }
    toast.error('Erro ao excluir dispositivo');
    return false;
  };

  return {
    devices,
    loading,
    saveDevice,
    deleteDevice,
    refresh: loadDevices,
  };
};
