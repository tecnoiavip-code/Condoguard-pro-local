import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  QrCode, ShieldCheck, ShieldAlert, ShieldX, Car, CalendarDays,
  Locate, Clock, AlertCircle, CheckCircle2, DoorOpen, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { formatPlate } from '@/lib/utils';

interface GuestPassPayload {
  found?: boolean;
  valid?: boolean;
  status?: string;
  reason?: string | null;
  visitor_name?: string;
  apartment?: string | null;
  authorized_date?: string | null;
  authorized_until?: string | null;
  purpose?: string | null;
  vehicle_plate?: string | null;
  single_use?: boolean | null;
  entry_count?: number | null;
}

const statusTheme = (status?: string) => {
  switch (status) {
    case 'today':
      return {
        banner: 'bg-emerald-500 text-emerald-950',
        icon: CheckCircle2,
        label: 'Acesso Autorizado para Hoje',
        sub: 'Apresente este QR Code na portaria.',
      };
    case 'future':
      return {
        banner: 'bg-amber-400 text-amber-950',
        icon: Clock,
        label: 'Autorizado',
        sub: 'Este convite terá validade na data autorizada.',
      };
    case 'past':
      return {
        banner: 'bg-yellow-500 text-yellow-950',
        icon: Clock,
        label: 'Data autorizada já passou',
        sub: 'Consulte o morador para gerar um novo convite.',
      };
    default:
      return {
        banner: 'bg-red-500 text-red-50',
        icon: ShieldX,
        label: 'Convite Expirado, Cancelado ou Já Utilizado',
        sub: 'Contate o morador responsável para um novo convite.',
      };
  }
};

const GuestPass = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GuestPassPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');

  const load = async () => {
    if (!token) {
      setData({ found: false });
      setLoading(false);
      return;
    }
    const { data: resp } = await (supabase.rpc as any)('validate_guest_pass', { _token: token });
    setData((resp as GuestPassPayload) || { found: false });
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const theme = useMemo(() => statusTheme(data?.status), [data?.status]);
  const ThemeIcon = theme.icon;

  const link = typeof window !== 'undefined' ? `${window.location.origin}/convite/${token}` : '';

  const handleSaveVehicle = async () => {
    if (!token) return;
    setSaving(true);
    const { data: resp, error } = await (supabase.rpc as any)('update_guest_pass', {
      _token: token,
      _vehicle_plate: plate.trim().toUpperCase() || null,
      _vehicle_model: model.trim() || null,
    });
    if (error || !resp?.ok) {
      toast.error(resp?.message || error?.message || 'Erro ao salvar veículo');
    } else {
      toast.success('Veículo registrado! A portaria já sabe do seu carro.');
      setData((prev: any) => ({
        ...prev,
        vehicle_plate: plate.trim().toUpperCase() || prev?.vehicle_plate,
      }));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070d1a] flex items-center justify-center">
        <div className="animate-pulse text-slate-400 flex items-center gap-3">
          <QrCode className="h-8 w-8" /> Carregando convite...
        </div>
      </div>
    );
  }

  const canPreCheckin = data?.status === 'today' || data?.status === 'future';

  return (
    <div className="min-h-screen bg-[#070d1a] text-white flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        {/* Cabeçalho */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center gap-2 text-lg font-bold tracking-wide">
            <ShieldCheck className="h-6 w-6 text-sky-400" />
            PortalGuard Pro
          </div>
          <p className="text-xs text-slate-400 mt-1">Convite de Acesso Digital</p>
        </div>

        {!data?.found ? (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <ShieldX className="h-14 w-14 mx-auto text-red-400" />
            <p className="font-semibold text-2xl">Convite não encontrado</p>
            <p className="text-sm text-slate-400">O link pode estar incorreto ou ter sido removido.</p>
          </div>
        ) : (
          <>
            {/* Banner de status */}
            <div className={`rounded-2xl px-5 py-5 ${theme.banner} flex items-start gap-3`}>
              <ThemeIcon className="h-8 w-8 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-lg leading-tight">{theme.label}</p>
                <p className="text-sm opacity-90 mt-0.5">{theme.sub}</p>
              </div>
            </div>

            {/* Dados do convite */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <User className="h-5 w-5 text-sky-400" />
                  <span className="text-xs uppercase tracking-wider">Convidado</span>
                </div>
                <p className="font-semibold text-lg">{data.visitor_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <DoorOpen className="h-3.5 w-3.5" /> Unidade
                  </div>
                  <p className="font-semibold text-xl">{data.apartment || '—'}</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Data autorizada
                  </div>
                  <p className="font-semibold text-base leading-snug">
                    {data.authorized_date ? format(new Date(data.authorized_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                  </p>
                </div>
              </div>

              {data.purpose && (
                <p className="text-sm text-slate-300"><span className="text-slate-500">Motivo:</span> {data.purpose}</p>
              )}
              {data.vehicle_plate && (
                <p className="text-sm text-slate-300"><span className="text-slate-500">Veículo:</span> {data.vehicle_plate}</p>
              )}
              {!data.single_use && (
                <p className="text-xs text-emerald-300/80">Válido por múltiplas entradas no dia autorizado.</p>
              )}
              {data.entry_count ? (
                <p className="text-xs text-slate-400">Entradas já realizadas: {data.entry_count}</p>
              ) : null}
            </div>

            {/* Instruções */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Locate className="h-4 w-4 text-sky-400" />
                Como chegar
              </div>
              <ul className="text-sm text-slate-300 space-y-1.5">
                <li className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-slate-500" /> Apresente este QR Code na guarita.</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-slate-500" /> Dirija-se à unidade {data.apartment || 'do morador'}.</li>
                <li className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-slate-500" /> Identifique-se com documento na entrada.</li>
              </ul>
            </div>

            {/* Pré-check-in do veículo */}
            {canPreCheckin && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Car className="h-4 w-4 text-sky-400" />
                  Pré-check-in do veículo (opcional)
                </div>
                <p className="text-xs text-slate-400">
                  Informe os dados do seu carro para agilizar a entrada.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Placa</Label>
                    <Input
                      value={plate}
                      onChange={e => setPlate(formatPlate(e.target.value))}
                      placeholder="ABC-1D23"
                      className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Modelo</Label>
                    <Input
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder="Ex: Onix 1.0, prata"
                      className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <Button onClick={handleSaveVehicle} disabled={saving} className="w-full">
                    {saving ? 'Salvando...' : 'Salvar informações do veículo'}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-slate-500">
              Convite seguro · QR Code temporário · <span className="text-slate-400">{link}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default GuestPass;