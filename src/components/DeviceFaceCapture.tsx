import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ScanFace, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Device } from '@/types';
import { fetchDeviceFrame } from '@/lib/device-capture';

interface DeviceFaceCaptureProps {
  devices: Device[];
  onCaptured: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * Pré-visualização ao vivo da câmera do leitor facial + botão de captura.
 * Funciona como a webcam: a imagem aparece em tempo real e o operador clica
 * em "Capturar" para usar o frame atual — sem precisar tocar no dispositivo.
 */
export function DeviceFaceCapture({ devices, onCaptured, onCancel }: DeviceFaceCaptureProps) {
  const [selectedId, setSelectedId] = useState(devices.length === 1 ? devices[0].id : '');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const device = devices.find(d => d.id === selectedId);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!device) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    setLoading(true);

    const tick = async () => {
      try {
        const frame = await fetchDeviceFrame(device);
        if (cancelled) return;
        if (frame) {
          setPreview(frame);
          setError(null);
        } else {
          setError('O dispositivo não retornou imagem.');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao conectar ao dispositivo.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(tick, 1000);
        }
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [device]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Dispositivo Facial</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o dispositivo..." />
          </SelectTrigger>
          <SelectContent>
            {devices.map(d => (
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

      <div className="relative aspect-square w-full max-w-xs mx-auto rounded-lg overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Pré-visualização do dispositivo" className="w-full h-full object-cover" />
        ) : error ? (
          <div className="text-center px-4 text-destructive">
            <p className="text-xs">{error}</p>
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs mt-1">Conectando à câmera...</p>
          </div>
        )}
        {loading && preview && (
          <div className="absolute top-2 right-2 rounded-full bg-black/50 p-1">
            <Loader2 className="h-3 w-3 text-white animate-spin" />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Posicione o rosto na frente do dispositivo e clique em <strong>Capturar</strong>.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => preview && onCaptured(preview)}
          disabled={!preview}
          className="flex-1 gap-2"
        >
          <ScanFace className="h-4 w-4" />
          Capturar
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
