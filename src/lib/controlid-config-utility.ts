// Generates a standalone HTML utility that runs on the gatehouse PC (same LAN
// as the Control iD devices) and writes the Push Server + online (Pro) config.
// The server address is auto-detected from the local backend (/api/network-info)
// so devices reach this PC by its LAN IP:port; it also stays editable in the
// generated page as a fallback.
const WEBHOOK_PATH = '/api/controlid-webhook';
const DEFAULT_HOST = '127.0.0.1:8080';

function sanitizeHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}

export function fallbackServerHost(): string {
  const configured = (import.meta.env.VITE_CONTROLID_HOST as string | undefined)?.trim();
  if (configured) return sanitizeHost(configured);
  const browserHost = typeof window !== 'undefined' ? window.location.host : '';
  return sanitizeHost(browserHost) || DEFAULT_HOST;
}

export async function resolveServerHost(): Promise<string> {
  try {
    const resp = await fetch('/api/network-info', { headers: { Accept: 'application/json' } });
    if (resp.ok) {
      const body = await resp.json();
      const info = body?.data ?? body;
      const host = typeof info?.host === 'string' ? info.host : '';
      const port = info?.port != null ? String(info.port) : '';
      if (host && port) return sanitizeHost(`${host}:${port}`);
    }
  } catch { /* usa fallback */ }
  return fallbackServerHost();
}

export function buildControlIdUtilityHtml(devices: { ip: string; name?: string }[], serverHost: string = fallbackServerHost()): string {
  const defaultHost = sanitizeHost(serverHost) || DEFAULT_HOST;
  const ips = devices.map((d) => d.ip);
  const names = Object.fromEntries(devices.filter((d) => d.name).map((d) => [d.ip, d.name as string]));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Configurador Control iD - PortalGuard</title>
<style>body{font-family:system-ui;background:#111418;color:#e7e9ec;max-width:760px;margin:30px auto;padding:0 16px}
input,textarea{width:100%;padding:8px;background:#1c2026;color:#fff;border:1px solid #333;border-radius:6px;box-sizing:border-box}
button{padding:10px 16px;border:0;border-radius:6px;background:#2f7d4f;color:#fff;font-weight:600;cursor:pointer;margin-top:12px}
pre{background:#000;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;max-height:340px;overflow:auto}label{display:block;margin-top:12px;font-size:13px}</style></head>
<body><h2>Configurador Control iD — Liberação Centralizada</h2>
<p>Abra este arquivo no PC da portaria (mesma rede dos equipamentos). Ele grava o Servidor Push, o Monitor e ativa o modo online (Pro) apontando para este PC.</p>
<label>Endereço deste PC na rede (IP:porta) — confira e ajuste se precisar</label><input id="srv" value="${defaultHost}">
<label>IPs dos equipamentos (um por linha)</label><textarea id="ips" rows="4">${ips.join('\n')}</textarea>
<label>Usuário</label><input id="u" value="admin"><label>Senha</label><input id="p" type="password" value="admin">
<label><input type="checkbox" id="rb" checked style="width:auto"> Reiniciar após gravar</label>
<button onclick="run()">Aplicar configuração</button><pre id="log"></pre>
<script>
const WEBHOOK_PATH=${JSON.stringify(WEBHOOK_PATH)};
const NAMES=${JSON.stringify(names)};
const log=m=>{document.getElementById('log').textContent+=m+'\\n'};
function serverHost(){return document.getElementById('srv').value.trim().replace(/^https?:\\/\\//i,'').replace(/\\/.*$/,'')}
function splitHost(v){const b=v.match(/^\\[([^\\]]+)\\](?::(\\d+))?$/);if(b)return[b[1],b[2]||'8080'];const i=v.lastIndexOf(':');if(i>-1&&/^\\d+$/.test(v.slice(i+1)))return[v.slice(0,i),v.slice(i+1)];return[v,'8080']}
function makeConfig(){const parts=splitHost(serverHost());const hostname=parts[0];const port=String(parts[1]);const url='http://'+hostname+':'+port+WEBHOOK_PATH;return{url,host:hostname,port,config:{monitor:{request_timeout:'15000',hostname,port,path:WEBHOOK_PATH},push_server:{push_remote_address:url,push_request_timeout:'15000',push_request_period:'5'},general:{online:'1',local_identification:'1'}}}}
async function post(ip,path,body){const r=await fetch('http://'+ip+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const t=await r.text();if(!r.ok)throw new Error(path+' HTTP '+r.status+' '+t);try{return JSON.parse(t)}catch{return {}}}
async function ensureOnlineServer(ip,s,baseUrl){
const SRV='PortalGuard Servidor';
const loaded=await post(ip,'load_objects.fcgi?session='+s,{object:'devices',fields:['id','name','ip']});
const list=(loaded&&loaded.devices)||[];
const existing=list.find(d=>String(d.name)===SRV);
let sid=existing?existing.id:null;
if(sid){await post(ip,'create_or_modify_objects.fcgi?session='+s,{object:'devices',values:[{id:sid,name:SRV,ip:baseUrl}]})}
else{const c=await post(ip,'create_objects.fcgi?session='+s,{object:'devices',values:[{name:SRV,ip:baseUrl,public_key:''}]});sid=c&&c.ids&&c.ids[0]}
if(!sid)throw new Error('não foi possível registrar o servidor online');
await post(ip,'set_configuration.fcgi?session='+s,{general:{online:'1',local_identification:'1',ihm_enterprise_mode:'0'},online_client:{server_id:String(sid),extract_template:'0',max_request_attempts:'3'}});
log('['+ip+'] servidor online gravado ('+baseUrl+') id='+sid+' e modo online (Pro) ativado ✔')}
async function applyDeviceName(ip,s,name){if(!name)return;try{const loaded=await post(ip,'load_objects.fcgi?session='+s,{object:'devices',fields:['id','name','ip','public_key']});const list=(loaded&&loaded.devices)||[];const did=String((await post(ip,'system_information.fcgi?session='+s,{})).device_id||'');const self=list.find(d=>String(d.id)===did);if(self){await post(ip,'create_or_modify_objects.fcgi?session='+s,{object:'devices',values:[{id:self.id,name,ip:self.ip,public_key:self.public_key||''}]});log('['+ip+'] nome do aparelho gravado: '+name+' ✔')}}catch(e){log('['+ip+'] AVISO: nome do aparelho falhou: '+e.message)}}
async function run(){document.getElementById('log').textContent='';
const mc=makeConfig();
const ips=document.getElementById('ips').value.split(/\\s+/).filter(Boolean);
log('Servidor: '+mc.url);
for(const ip of ips){try{log('['+ip+'] login...');
const s=(await post(ip,'login.fcgi',{login:document.getElementById('u').value,password:document.getElementById('p').value})).session;
if(!s)throw new Error('sessão não retornada (usuário/senha?)');
await post(ip,'set_configuration.fcgi?session='+s,mc.config);log('['+ip+'] Servidor Push e Monitor gravados ✔');
await applyDeviceName(ip,s,NAMES[ip]);
try{await ensureOnlineServer(ip,s,mc.url)}catch(e){log('['+ip+'] AVISO: modo online falhou: '+e.message)}
if(document.getElementById('rb').checked){try{await post(ip,'reboot.fcgi?session='+s)}catch(e){}log('['+ip+'] reiniciando...')}
}catch(e){log('['+ip+'] ERRO: '+e.message+' — confira IP, rede e se o modo iDCloud está desligado.')}}
log('Concluído.')}
</script></body></html>`;
}

export async function downloadControlIdUtility(devices: { ip: string; name?: string }[]) {
  const serverHost = await resolveServerHost();
  const blob = new Blob([buildControlIdUtilityHtml(devices, serverHost)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'config-controlid.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
