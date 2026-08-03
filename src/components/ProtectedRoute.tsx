import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isResident, setIsResident] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
      return;
    }

    if (!isLoading && user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'resident')
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) {
            setIsResident(true);
            navigate('/morador');
          }
          setRoleChecked(true);
        });
    }
  }, [user, isLoading, navigate]);

  if (isLoading || (!roleChecked && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || isResident) {
    return null;
  }

  return <>{children}</>;
};
