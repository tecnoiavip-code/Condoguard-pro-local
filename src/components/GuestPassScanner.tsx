import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  QrCode, Camera, Keyboard, AlertTriangle, CheckCircle2, User, DoorOpen,
  FileText, Car, Loader2, Video, CameraOff, ShieldCheck, X, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatPlate } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ValidatePayload {
  found?: boolean;
  valid?: boolean;
  status?: string;
  reason?: string | null;
  visitor_name?: string;
  visitor_document?: string | null;
  resident_name?: string | null;
  apartment?: string | null;
  authorized_date?: string | null;
  authorized_until?: string | null;
  purpose?: string | null;
  vehicle_plate?: string | null;
  single_use?: boolean | null;
  entry_count?: number | null;
}

const parseToken = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/convite\/([a-f0-9-]{36})/i);
  if (m) return m[1];
  if (/^[a-f0-9-]{36}$/i.test(t)) return t;
  return null;
};

interface GuestPassScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryConfirmed?: () => void;
}

const GuestPassScanner = ({ open, onOpenChange, onEntryConfirmed }: GuestPassScannerProps) => {
  const [mode, setMode] = useState<'usb' | 'camera'>('usb');
  const [input, setInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [payload, setPayload] = useState<ValidatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [plate, setPlate] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const reset = () => {
    setInput('');
    setPayload(null);
    setError(null);
    setToken(null);
    setPlate('');
    setPhoto(null);
    setCameraError(null);
    setValidating(false);
    setRedeeming(false);
  };

  const stopCamera = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleValidate = async (token: string) => {
    setValidating(true);
    setError(null);
    setPayload(null);
    const { data, error: rpcErr } = await (supabase.rpc as any)('validate_guest_pass', { _token: token });
    if (rpcErr) {
      setError(rpcErr.message || 'Falha ao validar convite');
      setValidating(false);
      return;
    }
    const p = (data as ValidatePayload) || {};
    if (!p.found || !p.valid) {
      setError(p.reason || (p.found === false ? 'Convite não encontrado' : 'Convite não pode ser utilizado agora'));
      setPayload(p);
      setValidating(false);
      return;
    }
    setToken(token);
    setPayload(p);
    setPlate(p.vehicle_plate || '');
    setValidating(false);
  };

  const submitInput = () => {
    const tk = parseToken(input);
    if (!tk) {
      setError('QR Code inválido. Escaneie novamente.');
      return;
    }
    handleValidate(tk);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      scanTimerRef.current = window.setInterval(scanFrame, 180);
    } catch {
      setCameraError('Não foi possível acessar a câmera.');
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code) {
        const tk = parseToken(code.data);
        if (tk) {
          stopCamera();
          handleValidate(tk);
        }
      }
    } catch {
      // ignora frames sem imagem legível
    }
  };

  useEffect(() => {
    if (!open) {
      reset();
      stopCamera();
      return;
    }
    const hasCamera = typeof navigator !== 'undefined' && 'mediaDevices' in navigator && !!navigator.mediaDevices.getUserMedia;
    setMode(hasCamera ? 'camera' : 'usb');
    const t = setTimeout(() => {
      if (hasCamera) startCamera();
      else inputRef.current?.focus();
    }, 300);
    return () => { clearTimeout(t); stopCamera(); };
  }, [open]);

  useEffect(() => () => stopCamera(), []);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, c.width, c.height);
    setPhoto(c.toDataURL('image/jpeg', 0.6));
  };

  const confirmEntry = async () => {
    if (!token) return;
    setRedeeming(true);
    const { data, error: rpcErr } = await (supabase.rpc as any)('redeem_guest_pass', {
      _token: token,
      _vehicle_plate: plate.trim().toUpperCase() || null,
      _vehicle_model: null,
      _photo_url: photo,
    });
    if (rpcErr || !data?.ok) {
      toast.error(data?.message || rpcErr?.message || 'Falha ao registrar entrada');
      setRedeeming(false);
      setPayload({ ...payload, valid: false, status: 'redeem_error', reason: data?.message });
      setError(data?.message || 'Não foi possível registrar a entrada');
      return;
    }
    toast.success(`Entrada de ${data.visitor_name || ''} registrada!`);
    onEntryConfirmed?.();
    setRedeeming(false);
    onOpenChange(false);
  };

  const isToday = payload?.status === 'today';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl w-[95vw] max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader className="flex items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Ler Convite (QR Code)
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Aponte a câmera ou o leitor USB para o QR Code e confirme a entrada.
        </DialogDescription>

        {/* Estado de erro */}
        {error && !payload?.valid && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold">Convite não liberado</p>
              <p className="text-muted-foreground">{error}</p>
              {payload?.visitor_name && <p className="text-sm mt-1">Convidado: <strong>{payload.visitor_name}</strong></p>}
              {payload?.reason && <p className="text-xs text-muted-foreground mt-1">{payload.reason}</p>}
            </div>
          </div>
        )}

        {/* Sem token ainda: ler */}
        {!token && (
          <div className="space-y-4">
            {/* Alternador de modo */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === 'usb' ? 'default' : 'outline'} size="sm" onClick={() => { setMode('usb'); setCameraError(null); stopCamera(); }}>
                <Keyboard className="mr-2 h-4 w-4" /> Leitor USB
              </Button>
              <Button
                variant={mode === 'camera' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setMode('camera'); setCameraError(null); if (!cameraActive) startCamera(); }}
                disabled={!('mediaDevices' in navigator)}
              >
                <Camera className="mr-2 h-4 w-4" /> Câmera
              </Button>
            </div>

            {mode === 'usb' ? (
              <div className="space-y-2">
                <Label>Leitor de QR Code (USB)</Label>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitInput(); }}
                  placeholder="Aponte o leitor para o QR Code"
                  className="rounded-xl font-mono text-sm"
                  disabled={validating}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Keyboard className="h-3 w-3" /> Aponte o leitor e aguarde o bip — o código é lido automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <canvas ref={scanCanvasRef} className="hidden" />
                <div className="relative rounded-2xl overflow-hidden bg-black">
                  {!cameraActive && !cameraError && (
                    <div className="aspect-[4/3] flex items-center justify-center text-slate-400 text-sm">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Iniciando câmera...
                    </div>
                  )}
                  <video ref={videoRef} className="w-full aspect-[4/3] object-cover" muted playsInline />
                  {cameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="relative h-40 w-40">
                        <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-emerald-400 rounded-tl-xl" />
                        <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-emerald-400 rounded-tr-xl" />
                        <div className="absolute left-0 bottom-0 h-8 w-8 border-l-4 border-b-4 border-emerald-400 rounded-bl-xl" />
                        <div className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-emerald-400 rounded-br-xl" />
                      </div>
                    </div>
                  )}
                </div>
                {cameraError ? (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <CameraOff className="h-3 w-3" /> {cameraError} Use o leitor USB ou digite o código manualmente.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Alinhe o QR Code dentro do quadro. A leitura é automática.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Validating */}
        {validating && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-3" /> Validando convite...
          </div>
        )}

        {/* Card de confirmação rápida */}
        {token && payload?.valid && payload?.status === 'today' && !redeeming && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex gap-3 items-start">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
              <div>
                <p className="font-bold">Acesso autorizado para hoje</p>
                <p className="text-xs text-muted-foreground mt-0.5">Confira os dados e confirme a entrada.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border p-3 col-span-2 flex items-center gap-2">
                <User className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visitante</p>
                  <p className="font-semibold truncate">{payload.visitor_name}</p>
                </div>
              </div>
              <div className="rounded-xl border p-3 flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Apartamento</p>
                  <p className="font-semibold">{payload.apartment || '—'}</p>
                </div>
              </div>
              <div className="rounded-xl border p-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Morador responsável</p>
                  <p className="font-semibold truncate">{payload.resident_name || '—'}</p>
                </div>
              </div>
              {payload.visitor_document && (
                <div className="rounded-xl border p-3 col-span-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Documento</p>
                    <p className="font-medium">{payload.visitor_document}</p>
                  </div>
                </div>
              )}

              <div className="rounded-xl border p-3 space-y-1.5 col-span-2">
                <Label className="text-xs flex items-center gap-1"><Car className="h-3.5 w-3.5" /> Placa do veículo</Label>
                <Input
                  value={plate}
                  onChange={e => setPlate(formatPlate(e.target.value))}
                  placeholder="ABC-1D23"
                  className="rounded-lg uppercase"
                />
              </div>

              {photo && (
                <div className="col-span-2 flex items-center gap-2">
                  <img src={photo} alt="Foto do visitante" className="h-12 w-12 rounded-lg object-cover" />
                  <Button size="sm" variant="outline" onClick={capturePhoto}>Refazer foto</Button>
                </div>
              )}
            </div>

            {payload.purpose && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Motivo: {payload.purpose}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => reset()}>Cancelar</Button>
              <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={confirmEntry}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar Entrada
              </Button>
            </div>
          </div>
        )}

        {/* Convite para data futura */}
        {token && payload?.valid && payload?.status === 'future' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Não liberado ainda
            </p>
            <p className="text-sm text-muted-foreground">
              Este convite é válido apenas a partir de{' '}
              <strong>
                {payload.authorized_date
                  ? format(parse(payload.authorized_date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy', { locale: ptBR })
                  : '—'}
              </strong>
              .
            </p>
            <p className="text-xs text-muted-foreground">Informe o morador responsável ({payload.apartment || 'unidade'}).</p>
            <Button variant="secondary" size="sm" onClick={() => reset()}>Ler outro convite</Button>
          </div>
        )}

        {redeeming && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-3" /> Registrando entrada...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GuestPassScanner;