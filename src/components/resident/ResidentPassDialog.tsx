import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Share2, Camera, X, ShieldCheck, DoorOpen,
  CalendarDays, User, Car, Lock, QrCode,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export interface PassAuthorization {
  id: string;
  qr_code_token?: string | null;
  visitor_name: string;
  authorized_date: string;
  authorized_until?: string | null;
  purpose?: string | null;
  vehicle_plate?: string | null;
  single_use?: boolean;
  status?: string | null;
}

interface ResidentPassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authorization: PassAuthorization | null;
  apartment?: string | null;
  residentName?: string | null;
  onSaved?: () => void;
}

const ResidentPassDialog = ({
  open,
  onOpenChange,
  authorization,
  apartment,
  residentName,
  onSaved,
}: ResidentPassDialogProps) => {
  const qrRef = useRef<HTMLCanvasElement | null>(null);
  const [savingPass, setSavingPass] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!authorization) return null;

  const qrValue = authorization?.qr_code_token || '';

  const isActive = authorization.status === 'approved' || authorization.status === 'pending';

  const shareMessage =
    `Data autorizada: ${format(new Date(authorization.authorized_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`;

  const handleToggleMode = async () => {
    if (!authorization?.qr_code_token) return;
    setToggling(true);
    const next = !authorization.single_use;
    const { data, error } = await (supabase.rpc as any)('update_guest_pass', {
      _token: authorization.qr_code_token,
      _single_use: next,
    });
    if (error || !data?.ok) {
      toast.error(data?.message || error?.message || 'Erro ao alterar o modo do convite');
      setToggling(false);
      return;
    }
    toast.success(next ? 'Convite agora é de uso único' : 'Convite válido o dia todo');
    setToggling(false);
    onSaved?.();
  };

  const buildPassCanvas = (): HTMLCanvasElement | null => {
    const qrCanvas = qrRef.current;
    if (!qrCanvas) return null;
    const W = 600, H = 820;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fundo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Faixa superior
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(0, 0, W, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('PortalGuard Pro', 40, 52);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('Convite de Acesso Digital', 40, 82);

    // QR Code (desenhado a partir do canvas renderizado no DOM)
    const qrSize = 280;
    const qrX = (W - qrSize) / 2;
    const qrY = 160;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Campos
    const drawRow = (label: string, value: string, y: number) => {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText(label, 40, y);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(value.length > 30 ? value.slice(0, 30) + '...' : value, 40, y + 34);
    };

    drawRow('APARTAMENTO', apartment || '—', 520);
    drawRow('CONVIDADO', authorization.visitor_name, 600);
    drawRow(
      'DATA AUTORIZADA',
      format(new Date(authorization.authorized_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR }),
      680
    );
    if (authorization.vehicle_plate) {
      drawRow('VEÍCULO', authorization.vehicle_plate, 756);
    }

    // Rodapé
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('Apresente este QR Code na portaria do condomínio.', 40, H - 30);

    return canvas;
  };

  const saveImage = () => {
    setSavingPass(true);
    try {
      const canvas = buildPassCanvas();
      if (!canvas) {
        toast.error('Erro ao gerar a imagem');
        return;
      }
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `convite-${authorization.visitor_name.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
      toast.success('Imagem do convite gerada!');
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      toast.error('Erro ao gerar a imagem');
    } finally {
      setSavingPass(false);
    }
  };

  const shareInvite = async () => {
    if (!qrValue) return;
    setSharing(true);
    const fileName = `convite-${authorization.visitor_name.replace(/\s+/g, '-').toLowerCase()}.png`;
    try {
      const canvas = buildPassCanvas();
      const blob: Blob | null = await new Promise((resolve) => {
        if (!canvas) {
          resolve(null);
          return;
        }
        canvas.toBlob(resolve, 'image/png');
      });
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
      const nav = navigator as any;
      const canShareFile = !!file && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
      if (typeof nav.share === 'function' && (!file || canShareFile)) {
        await nav.share(canShareFile ? { files: [file], text: shareMessage } : { text: shareMessage });
        setSharing(false);
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setSharing(false);
        return;
      }
      console.error('Erro ao compartilhar:', err);
    }
    setSharing(false);
    saveImage();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl w-[95vw] max-w-md overflow-y-auto max-h-[92vh]">
        <DialogHeader className="flex items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Passe QR Code
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Visual do passe */}
        <div className="rounded-2xl overflow-hidden border bg-gradient-to-b from-slate-900 to-slate-800 text-white">
          <div className="bg-primary px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5" />
              PortalGuard Pro
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'} className={!isActive ? 'text-[10px]' : 'text-[10px]'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white rounded-2xl p-4">
                <QRCodeCanvas
                  ref={qrRef}
                  value={qrValue || 'INVALIDO'}
                  size={220}
                  includeMargin={false}
                  level="H"
                />
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Lock className="h-3 w-3" /> QR Code temporário — invalida imediatamente se cancelado
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1 mb-1">
                  <DoorOpen className="h-3 w-3" /> Unidade
                </div>
                <p className="font-bold">{apartment || '—'}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1 mb-1">
                  <User className="h-3 w-3" /> Convidado
                </div>
                <p className="font-bold truncate">{authorization.visitor_name}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 col-span-2">
                <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1 mb-1">
                  <CalendarDays className="h-3 w-3" /> Data
                </div>
                <p className="font-bold">
                  {format(new Date(authorization.authorized_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                  {authorization.authorized_until && authorization.authorized_until !== authorization.authorized_date
                    ? ` até ${format(new Date(authorization.authorized_until + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`
                    : ''}
                </p>
              </div>
              {authorization.purpose && (
                <div className="bg-white/5 rounded-xl p-3 col-span-2">
                  <p className="text-sm text-slate-300"><span className="text-slate-400">Motivo:</span> {authorization.purpose}</p>
                </div>
              )}
              {authorization.vehicle_plate && (
                <div className="bg-white/5 rounded-xl p-3 col-span-2">
                  <p className="text-sm text-slate-300 flex items-center gap-1">
                    <Car className="h-3.5 w-3.5 text-slate-400" /> {authorization.vehicle_plate}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modo de uso */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={authorization.single_use ? 'default' : 'outline'}
            size="sm"
            disabled={toggling}
            onClick={() => { if (!authorization.single_use) handleToggleMode(); }}
          >
            Uso único
          </Button>
          <Button
            variant={!authorization.single_use ? 'default' : 'outline'}
            size="sm"
            disabled={toggling}
            onClick={() => { if (authorization.single_use) handleToggleMode(); }}
          >
            Válido o dia todo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {authorization.single_use
            ? 'O convite expira após a primeira entrada.'
            : 'Permite múltiplas entradas durante a data autorizada.'}
        </p>

        {/* Compartilhar */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={shareInvite} disabled={!qrValue || sharing} title="Compartilhar cartão com QR Code">
            <Share2 className="mr-2 h-4 w-4" /> {sharing ? 'Compartilhando...' : 'Compartilhar'}
          </Button>
          <Button variant="outline" onClick={saveImage} disabled={!qrValue} title="Salvar cartão do convite (PNG)">
            <Camera className="mr-2 h-4 w-4" /> {savingPass ? 'Gerando...' : 'Salvar Imagem'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResidentPassDialog;