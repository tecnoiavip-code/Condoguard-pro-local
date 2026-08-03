import { useState, useEffect } from 'react';
import { supabaseStorage } from '@/lib/supabase-storage';
import { AccessEntry } from '@/types';
import { toast } from 'sonner';

export const useAccessEntries = () => {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = async () => {
    setLoading(true);
    const data = await supabaseStorage.getEntries();
    if (data !== null) {
      setEntries(data);
    } else if (entries.length === 0) {
      // Tentar carregar do local storage como fallback caso o supabase falhe
      const fallbackData = await import('@/lib/storage').then(m => m.storage.getEntries());
      if (fallbackData && fallbackData.length > 0) {
        setEntries(fallbackData);
        toast.warning('Offline: Exibindo dados locais', { id: 'offline-entries' });
      } else {
        toast.error('Erro de conexão ao carregar cadastros');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const saveEntry = async (entry: AccessEntry) => {
    const success = await supabaseStorage.saveEntry(entry);
    if (success) {
      await loadEntries();
      return true;
    }
    toast.error('Erro ao salvar cadastro');
    return false;
  };

  const deleteEntry = async (id: string) => {
    const success = await supabaseStorage.deleteEntry(id);
    if (success) {
      await loadEntries();
      return true;
    }
    toast.error('Erro ao excluir cadastro');
    return false;
  };

  const searchSimilarEntries = async (name: string, document: string, plate?: string) => {
    return await supabaseStorage.searchSimilarEntries(name, document, plate);
  };

  return {
    entries,
    loading,
    saveEntry,
    deleteEntry,
    searchSimilarEntries,
    refresh: loadEntries,
  };
};
