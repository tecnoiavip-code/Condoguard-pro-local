import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Smartphone, Wifi, Camera, LogIn, Download, CheckCircle2, Info } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

// Portal do Morador no projeto local: como os moradores acessam e se comunicam.
// Com HTTPS (porta httpsPort) o portal vira PWA de verdade (instalar como app).
const ResidentAccessCard = () => {
  const [httpsUrl, setHttpsUrl] = useState('');
  const [httpUrl, setHttpUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    const resolveUrl = () => {
      let host = (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
        ? window.location.hostname
        : '192.168.0.5';
      let httpPort = '8080';
      let httpsPort = '8443';
      fetch('/api/network-info', { headers: { Accept: 'application/json' } })
        .then(r => (r.ok ? r.json() : null))
        .then(body => {
          if (cancelled) return;
          const info = body?.data ?? body;
          if (info?.host) host = info.host;
          if (info?.port) httpPort = String(info.port);
          if (info?.httpsPort) httpsPort = String(info.httpsPort);
          setHttpUrl(`http://${host}:${httpPort}/morador`);
          setHttpsUrl(`https://${host}:${httpsPort}/morador`);
        })
        .catch(() => {
          if (!cancelled) {
            setHttpUrl(`http://${host}:${httpPort}/morador`);
            setHttpsUrl(`https://${host}:${httpsPort}/morador`);
          }
        });
    };
    resolveUrl();
    return () => { cancelled = true; };
  }, []);

  const copyUrl = useCallback(async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      toast.success('Endereço copiado! Envie para o morador.');
    } catch {
      toast.error('Não foi possível copiar. Escreva o endereço manualmente.');
    }
  }, [httpsUrl]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <span>Portal do Morador (acesso dos moradores)</span>
        </CardTitle>
        <CardDescription>
          Mostre este QR Code ao morador — ele abre o portal no celular, dentro da rede do condomínio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-3 shrink-0 mx-auto md:mx-0">
            <div className="p-3 bg-white rounded-2xl border border-border shadow-sm">
              <QRCodeCanvas
                value={httpsUrl || 'portal de acesso'}
                size={200}
                marginSize={1}
                level="M"
              />
            </div>
            {httpsUrl && (
              <Button variant="outline" size="sm" onClick={copyUrl}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copiar endereço
              </Button>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {httpsUrl && (
              <div className="bg-muted rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <code className="text-sm text-primary break-all">{httpsUrl}</code>
                <a
                  href="/cert/ca"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar certificado
                </a>
              </div>
            )}
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Wifi className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">1. Rede:</strong> o celular do morador precisa estar no
                  mesmo Wi-Fi deste computador (o servidor fica aqui no condomínio).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Download className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">2. Segurança (1ª vez):</strong> toque em "Baixar
                  certificado" acima. No celular, instale-o como <em>Certificado de CA</em> (Android:
                  Configurações → Segurança → Instalar certificado; iOS: Ajustes → Perfil baixado). Depois
                  aceite o aviso "Conexão não particular" uma única vez.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Camera className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">3. Abrir:</strong> apontar a câmera para o QR Code acima
                  (ou digitar o endereço <code className="text-xs">{httpsUrl}</code>).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <LogIn className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">4. Conta:</strong> o morador cria sua conta (ou faz login)
                  e já pode falar com a portaria, ver correspondências e criar autorizações.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">5. App:</strong> com HTTPS ele recebe a opção de
                  <strong className="text-foreground"> instalar como app</strong> (ícone na tela, funciona offline
                  e com badge). Pode também usar o menu "Adicionar à tela inicial".
                </span>
              </li>
            </ol>
            <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>
                Conversas e notificações chegam em tempo real enquanto o portal está aberto (SSE, sem internet).
                O app da nuvem (<strong>PortalGuard na web</strong>) usa outro banco de dados — para falar com
                este servidor local, o morador usa o endereço HTTPS acima. Alternativa sem instalar o
                certificado: <code className="text-[11px]">{httpUrl}</code> (funciona, mas não instala como app).
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResidentAccessCard;