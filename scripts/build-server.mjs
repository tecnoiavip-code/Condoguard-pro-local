import { build } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const serverDir = join(root, 'server');
const outDir = join(root, 'server-dist');
const binariesDir = join(root, 'src-tauri', 'binaries');

mkdirSync(outDir, { recursive: true });
mkdirSync(binariesDir, { recursive: true });

await build({
  entryPoints: [join(serverDir, 'index.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(outDir, 'server.bundle.js'),
  external: ['node:sqlite'],
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  define: {},
  plugins: [
    {
      // pkg embute o bundle como CJS; import.meta nao existe la.
      name: 'import-meta-shim',
      setup(build) {
        build.onLoad({ filter: /[\/\\]server[\/\\].*\.js$/ }, (args) => {
          const contents = readFileSync(args.path, 'utf8').replace(
            /fileURLToPath\(import\.meta\.url\)/g,
            'require.main.filename'
          );
          return { contents, loader: 'js' };
        });
      },
    },
  ],
});

const bundlePath = join(outDir, 'server.bundle.js');
let code = readFileSync(bundlePath, 'utf8');
const sqliteLiteral = 'require("node:sqlite")';
if (code.includes(sqliteLiteral)) {
  code = code.split(sqliteLiteral).join('eval("require")("node:sqlite")');
  writeFileSync(bundlePath, code);
}

const pkgTarget = process.arch === 'x64' ? 'node22-win-x64' : 'node22-win-arm64';
const outExe = join(binariesDir, 'portalguard-server.exe');

try {
  execSync(`npx --yes @yao-pkg/pkg@5.16.1 ${join(outDir, 'server.bundle.js')} --targets ${pkgTarget} --options experimental-sqlite --output ${outExe}`, {
    stdio: 'inherit',
    cwd: root,
  });
} catch (err) {
  console.error('Falha ao empacotar servidor com pkg:', err);
  process.exit(1);
}
console.log('Servidor empacotado:', outExe);

const triple =
  process.platform === 'win32'
    ? process.arch === 'x64'
      ? 'x86_64-pc-windows-msvc'
      : 'aarch64-pc-windows-msvc'
    : process.arch === 'x64'
      ? 'x86_64-unknown-linux-gnu'
      : 'aarch64-unknown-linux-gnu';
const ext = process.platform === 'win32' ? '.exe' : '';
const outTriple = join(binariesDir, `portalguard-server-${triple}${ext}`);
copyFileSync(outExe, outTriple);
console.log('Sidecar (target triple):', outTriple);
