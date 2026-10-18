// Gera `server/face-assets.data.mjs` com os binários (WASM do tfjs + pesos dos
// modelos do face-api) embutidos em base64. O bundle do servidor (esbuild + pkg)
// inclui esse módulo, e o motor facial extrai os arquivos em tempo de execução
// para o diretório de dados. Assim o exe do servidor é autossuficiente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const WASM_DIST = path.join(root, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist');
const MODEL_DIR = path.join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
const OUT = path.join(root, 'server', 'face-assets.data.mjs');

const WASM_FILES = [
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
];

const MODEL_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

export function generateFaceAssets() {
  const assets = {};
  for (const f of WASM_FILES) {
    const p = path.join(WASM_DIST, f);
    if (!fs.existsSync(p)) throw new Error(`Arquivo WASM ausente: ${p}`);
    assets[f] = fs.readFileSync(p).toString('base64');
  }
  for (const f of MODEL_FILES) {
    const p = path.join(MODEL_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`Arquivo de modelo ausente: ${p}`);
    assets[f] = fs.readFileSync(p).toString('base64');
  }

  const header = '// GERADO AUTOMATICAMENTE por scripts/gen-face-assets.mjs. NAO EDITAR.\n';
  fs.writeFileSync(OUT, `${header}export const ASSETS = ${JSON.stringify(assets)};\n`);
  const size = fs.statSync(OUT).size;
  console.log(`[gen-face-assets] ${OUT} (${(size / 1024 / 1024).toFixed(1)} MB, ${Object.keys(assets).length} arquivos)`);
  return OUT;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateFaceAssets();
}
