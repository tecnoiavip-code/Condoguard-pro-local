import { useState, useEffect } from 'react';
import { supabaseStorage } from '@/lib/supabase-storage';
import { Resident } from '@/types';
import { toast } from 'sonner';

export const useResidents = () => {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);

  const loadResidents = async () => {
    setLoading(true);
    const data = await supabaseStorage.getResidents();
    // Only update if we got valid data; preserve existing list on error
    if (data !== null) {
      setResidents(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadResidents();
  }, []);

  const saveResident = async (resident: Resident) => {
    const savedId = await supabaseStorage.saveResident(resident);
    if (savedId) {
      await loadResidents();
      return savedId;
    }
    toast.error('Erro ao salvar morador');
    return null;
  };

  const deleteResident = async (id: string) => {
    const success = await supabaseStorage.deleteResident(id);
    if (success) {
      await loadResidents();
      return true;
    }
    toast.error('Erro ao excluir morador');
    return false;
  };

  return {
    residents,
    loading,
    saveResident,
    deleteResident,
    refresh: loadResidents,
  };
};
