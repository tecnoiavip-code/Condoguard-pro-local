import { Loader2, Camera, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CaptureStep } from '@/lib/device-capture';

interface DeviceCaptureStatusProps {
  status: string;
  step?: CaptureStep;
  progress?: number;
  loading: boolean;
  onCancel?: () => void;
}

const stepLabels: Record<CaptureStep, string> = {
  preparing: 'Preparando',
  creating_user: 'Configurando dispositivo',
  enrolling: 'Aguardando captura facial',
  fetching: 'Baixando foto',
  cleaning: 'Finalizando',
  done: 'Concluído',
  error: 'Erro',
};

export function DeviceCaptureStatus({ status, step, progress = 0, loading, onCancel }: DeviceCaptureStatusProps) {
  if (!status) return null;

  const isDone = step === 'done';
  const isError = step === 'error';
  const isEnrolling = step === 'enrolling';

  return (
    <div className={`rounded-lg border-2 p-4 space-y-3 transition-colors ${
      isDone ? 'border-success/50 bg-success/5' :
      isError ? 'border-destructive/50 bg-destructive/5' :
      isEnrolling ? 'border-primary/50 bg-primary/5 animate-pulse' :
      'border-border bg-muted/50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 rounded-full p-2 ${
          isDone ? 'bg-success/10 text-success' :
          isError ? 'bg-destructive/10 text-destructive' :
          isEnrolling ? 'bg-primary/10 text-primary' :
          'bg-muted text-muted-foreground'
        }`}>
          {isDone ? <CheckCircle2 className="h-5 w-5" /> :
           isError ? <AlertCircle className="h-5 w-5" /> :
           loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
           <Camera className="h-5 w-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${
            isDone ? 'text-success' :
            isError ? 'text-destructive' :
            'text-foreground'
          }`}>
            {step ? stepLabels[step] : 'Processando'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{status}</p>
        </div>

        {loading && onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
        )}
      </div>

      {loading && progress > 0 && (
        <Progress value={progress} className="h-1.5" />
      )}
    </div>
  );
}
