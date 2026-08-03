import { useState, useEffect } from 'react';
import { supabaseStorage } from '@/lib/supabase-storage';
import { Mail } from '@/types';
import { toast } from 'sonner';

export const useMails = () => {
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMails = async () => {
    setLoading(true);
    const data = await supabaseStorage.getMails();
    setMails(data);
    setLoading(false);
  };

  useEffect(() => {
    loadMails();
  }, []);

  const saveMail = async (mail: Mail) => {
    const success = await supabaseStorage.saveMail(mail);
    if (success) {
      await loadMails();
      return true;
    }
    toast.error('Erro ao salvar correspondência');
    return false;
  };

  const deleteMail = async (id: string) => {
    const success = await supabaseStorage.deleteMail(id);
    if (success) {
      await loadMails();
      return true;
    }
    toast.error('Erro ao excluir correspondência');
    return false;
  };

  return {
    mails,
    loading,
    saveMail,
    deleteMail,
    refresh: loadMails,
  };
};
