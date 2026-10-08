import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const baseName = `PortalGuard-Local-${version}`;

const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
if (!existsSync(nsisDir)) {
  console.error('Pasta do instalador nao encontrada. Rode antes: npx tauri build');
  process.exit(1);
}
const setupFile = readdirSync(nsisDir).find((f) => f.endsWith('-setup.exe'));
if (!setupFile) {
  console.error('Instalador -setup.exe nao encontrado em', nsisDir);
  process.exit(1);
}

const outDir = join(root, 'Instalador');
const setupName = `${baseName}-Setup.exe`;
const readmeName = 'LEIA-ME.txt';
const zipName = `${baseName}.zip`;
const stageDir = join(outDir, '.stage', baseName);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

copyFileSync(join(nsisDir, setupFile), join(outDir, setupName));
copyFileSync(join(nsisDir, setupFile), join(stageDir, setupName));

const readme = `${baseName} - Instalador para Windows
==================================================

INSTALACAO
1. Se baixou o .zip, extraia primeiro (botao direito > Extrair tudo).
2. Execute "${setupName}" (se o Windows pedir, clique em Sim na tela de
   Controle de Conta de Usuario).
3. Siga o assistente e marque "Executar PortalGuard Local" ao finalizar.
4. O programa fica no Menu Inicio e pode ser fixado na area de trabalho.

ONDE FICAM OS DADOS
- Banco de dados, fotos e documentos: C:\\ProgramData\\PortalGuard
- Acesso pelo navegador: http://127.0.0.1:<porta> (aberto pelo programa)

DESINSTALACAO
- Configuracoes do Windows > Aplicativos > PortalGuard Local > Desinstalar
- Ao desinstalar, todo o conteudo do programa e removido, inclusive
  C:\\ProgramData\\PortalGuard. Faca backup antes se quiser manter os dados.

REQUISITOS
- Windows 10 ou 11 64 bits
- Microsoft Edge WebView2 Runtime (o instalador instala automaticamente
  caso nao esteja presente)
`;

writeFileSync(join(outDir, readmeName), readme, 'utf8');
writeFileSync(join(stageDir, readmeName), readme, 'utf8');

const zipPath = join(outDir, zipName);
const ps = `Compress-Archive -Force -Path '${join(outDir, '.stage', baseName)}' -DestinationPath '${zipPath}'`;
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
rmSync(join(outDir, '.stage'), { recursive: true, force: true });

console.log('Release gerada em:', outDir);
console.log(' -', setupName);
console.log(' -', readmeName);
console.log(' -', zipName, '(contem pasta', baseName + ')');
