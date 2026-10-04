// Generates a standalone HTML utility that runs on the gatehouse PC (same LAN
// as the Control iD devices) and writes the Push Server config to flash.
// Always points to THIS local server, so the devices reach the gateway without
// any internet routing: VITE_CONTROLID_HOST ("ip:porta") wins, otherwise the
// address the browser is using, otherwise 127.0.0.1:8080.
const WEBHOOK_PATH = '/api/controlid-webhook';
const DEFAULT_HOST = '127.0.0.1:8080';

function resolveHost(): string {
  const configured = (import.meta.env.VITE_CONTROLID_HOST as string | undefined)?.trim();
  if (configured) return configured;
  const browserHost = typeof window !== 'undefined' ? window.location.host : '';
  return browserHost || DEFAULT_HOST;
}

function resolveProtocol(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') return 'https';
  return 'http';
}

export const WEBHOOK_HOST = resolveHost();
export const WEBHOOK_URL = `${resolveProtocol()}://${WEBHOOK_HOST}${WEBHOOK_PATH}`;

export function buildControlIdUtilityHtml(ips: string[]): string {
  const hostname = WEBHOOK_HOST.replace(/:\d+$/, '');
  const port = WEBHOOK_HOST.match(/:(\d+)$/)?.[1] || '8080';
  const config = {
    push_server: {
      push_remote_address: WEBHOOK_URL,
      push_request_timeout: '15000',
      push_request_period: '5',
    },
    monitor: {
      request_timeout: '15000',
      hostname,
      port,
      path: WEBHOOK_PATH,
    },
    general: { online: '1', local_identification: '1' },
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Configurador Control iD - PortalGuard</title>
<style>body{font-family:system-ui;background:#111418;color:#e7e9ec;max-width:760px;margin:30px auto;padding:0 16px}
input,textarea{width:100%;padding:8px;background:#1c2026;color:#fff;border:1px solid #333;border-radius:6px;box-sizing:border-box}
button{padding:10px 16px;border:0;border-radius:6px;background:#2f7d4f;color:#fff;font-weight:600;cursor:pointer;margin-top:12px}
pre{background:#000;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;max-height:340px;overflow:auto}label{display:block;margin-top:12px;font-size:13px}</style></head>
<body><h2>Configurador Control iD — Liberação Centralizada</h2>
<p>Abra este arquivo no PC da portaria (mesma rede dos equipamentos). Ele grava o Servidor Push apontando para:<br><b>${WEBHOOK_URL}</b></p>
<label>IPs dos equipamentos (um por linha)</label><textarea id="ips" rows="4">${ips.join('\n')}</textarea>
<label>Usuário</label><input id="u" value="admin"><label>Senha</label><input id="p" type="password" value="admin">
<label><input type="checkbox" id="rb" checked style="width:auto"> Reiniciar após gravar</label>
<button onclick="run()">Aplicar configuração</button><pre id="log"></pre>
<script>
const CONFIG=${JSON.stringify(config)};
const log=m=>{document.getElementById('log').textContent+=m+'\\n'};
async function post(ip,path,body){const r=await fetch('http://'+ip+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const t=await r.text();if(!r.ok)throw new Error(path+' HTTP '+r.status+' '+t);try{return JSON.parse(t)}catch{return {}}}
async function run(){document.getElementById('log').textContent='';
const ips=document.getElementById('ips').value.split(/\\s+/).filter(Boolean);
for(const ip of ips){try{log('['+ip+'] login...');
const s=(await post(ip,'login.fcgi',{login:document.getElementById('u').value,password:document.getElementById('p').value})).session;
if(!s)throw new Error('sessão não retornada (usuário/senha?)');
await post(ip,'set_configuration.fcgi?session='+s,CONFIG);log('['+ip+'] Servidor Push gravado ✔');
if(document.getElementById('rb').checked){try{await post(ip,'reboot.fcgi?session='+s)}catch(e){}log('['+ip+'] reiniciando...')}
}catch(e){log('['+ip+'] ERRO: '+e.message+' — confira IP, rede e se o modo iDCloud está desligado.')}}
log('Concluído.')}
</script></body></html>`;
}

export function downloadControlIdUtility(ips: string[]) {
  const blob = new Blob([buildControlIdUtilityHtml(ips)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'config-controlid.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}