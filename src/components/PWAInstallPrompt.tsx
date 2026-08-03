import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS/iPadOS (iPads now report as Macintosh)
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show iOS/iPadOS banner if not installed and not dismissed
    if (ios && !standalone) {
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) setShowBanner(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || !showBanner) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  return (
    <div className="fixed bottom-16 left-2 right-2 z-50 bg-primary text-primary-foreground rounded-xl p-4 shadow-lg animate-in slide-in-from-bottom-4">
      <button onClick={handleDismiss} className="absolute top-2 right-2 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="bg-primary-foreground/20 p-2 rounded-lg">
          <Download className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Instale o App</p>
          {isIOS ? (
            <div>
              <p className="text-xs opacity-80">
                No Safari, toque em <span className="inline-flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mx-0.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> e depois em <span className="font-bold">"Adicionar à Tela de Início"</span>
              </p>
            </div>
          ) : (
            <p className="text-xs opacity-80">Acesse rápido pela tela inicial</p>
          )}
        </div>
        {!isIOS && (
          <Button size="sm" variant="secondary" onClick={handleInstall}>
            Instalar
          </Button>
        )}
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
