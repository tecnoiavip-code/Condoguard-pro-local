import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const PWAUpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates once per day (86400 seconds)
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 24 * 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] bg-primary text-primary-foreground rounded-xl p-4 shadow-2xl animate-in slide-in-from-top-4 max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <div className="bg-primary-foreground/20 p-2 rounded-lg">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Nova versão disponível!</p>
          <p className="text-xs opacity-80">Toque para atualizar o app</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => updateServiceWorker(true)}
        >
          Atualizar
        </Button>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;
