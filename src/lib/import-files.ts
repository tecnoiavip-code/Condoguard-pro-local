// Importacao de dados a partir de arquivos CSV e PDF.
// Reconhece os tipos: moradores (residents), correspondencias (mails) e acessos (access_entries).
// O resultado e um objeto com arrays por tabela, pronto para restoreCollections().
import { normalizeRow } from './restore-collections';

export type ImportCollection = 'residents' | 'mails' | 'access_entries';

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface PdfCell {
  x: number;
  str: string;
}

export interface PdfLine {
  page: number;
  y: number;
  cells: PdfCell[];
}

export interface ParsedCollections {
  collections: Partial<Record<ImportCollection, Record<string, any>[]>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const stripAccents = (value: string) =>
  String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normKey = (value: string) => stripAccents(value).trim().toLowerCase();

const isEmptyValue = (value: unknown) => {
  const v = String(value ?? '').trim();
  return v === '' || v === '-';
};

const parseDateValue = (value: unknown): string => {
  const s = String(value ?? '').trim();
  if (!s || s.toLowerCase() === 'ativo' || s === '-') return '';
  // dd/mm/yyyy [hh:mm[:ss]]
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, mo, yRaw, h = '0', mi = '0', se = '0'] = br;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return s;
};

const mapVisitorType = (value: unknown): string => {
  const v = normKey(String(value ?? ''));
  if (['entregador', 'entrega', 'entregas', 'delivery', 'motoboy'].includes(v)) return 'delivery';
  if (['prestador', 'prestador de servico', 'service_provider', 'provider', 'servico', 'servicos'].includes(v)) {
    return 'service_provider';
  }
  return 'visitor';
};

const mapMailStatus = (value: unknown): string => {
  const v = normKey(String(value ?? ''));
  if (['entregue', 'delivered', 'retirado'].includes(v)) return 'delivered';
  return 'pending';
};

const mapMailType = (value: unknown): string => {
  const s = String(value ?? '').trim();
  return s && s !== '-' ? s : 'Carta';
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function detectDelimiter(sample: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === d) count++;
      else if (ch === '\n' && !inQuotes) break;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string): CsvParseResult {
  const content = String(text ?? '').replace(/^\uFEFF/, '');
  if (!content.trim()) return { headers: [], rows: [] };

  const delim = detectDelimiter(content);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map(h => h.trim());
  const dataRows = nonEmpty.slice(1).map(cols => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(cols[idx] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows: dataRows };
}

const HEADER_MAPS: Record<ImportCollection, Record<string, string>> = {
  residents: {
    id: 'id',
    name: 'name', nome: 'name',
    apartment: 'apartment', apartamento: 'apartment', apto: 'apartment', apt: 'apartment', unidade: 'apartment', bloco: 'apartment',
    cpf: 'cpf', documento: 'cpf',
    phone: 'phone', telefone: 'phone', celular: 'phone', fone: 'phone',
    email: 'email', 'e-mail': 'email',
    vehicleplate: 'vehicle_plate', placa: 'vehicle_plate',
    vehiclemodel: 'vehicle_model', modelo: 'vehicle_model',
    vehiclecolor: 'vehicle_color', cor: 'vehicle_color',
    vehicletag: 'vehicle_tag', tag: 'vehicle_tag',
    contracttype: 'contract_type', contractenddate: 'contract_end_date', vencimento: 'contract_end_date',
  },
  mails: {
    id: 'id',
    residentid: 'resident_id', resident_id: 'resident_id', moradorid: 'resident_id', morador_id: 'resident_id', morador: 'resident_id',
    sender: 'sender', remetente: 'sender',
    packagetype: 'package_type', package_type: 'package_type', tipo: 'package_type',
    status: 'status', situacao: 'status',
    receivedat: 'received_at', received_at: 'received_at', data: 'received_at', datahora: 'received_at', recebido: 'received_at',
    deliveredat: 'delivered_at', delivered_at: 'delivered_at', entregue: 'delivered_at',
    withdrawnby: 'withdrawn_by', withdrawn_by: 'withdrawn_by', retiradopor: 'withdrawn_by',
    trackingcode: 'tracking_code', tracking_code: 'tracking_code', rastreio: 'tracking_code',
    notes: 'notes', observacoes: 'notes', observacao: 'notes',
    photourl: 'photo_url', photo_url: 'photo_url',
  },
  access_entries: {
    id: 'id',
    visitorname: 'visitor_name', visitor_name: 'visitor_name', nome: 'visitor_name', nomevisitante: 'visitor_name', visitante: 'visitor_name',
    visitordocument: 'visitor_document', visitor_document: 'visitor_document', documento: 'visitor_document', cpf: 'visitor_document', rg: 'visitor_document',
    visitortype: 'visitor_type', visitor_type: 'visitor_type', tipo: 'visitor_type',
    apartment: 'apartment', apartamento: 'apartment', apto: 'apartment', unidade: 'apartment',
    purpose: 'purpose', motivo: 'purpose', objetivo: 'purpose',
    entrytime: 'entry_time', entry_time: 'entry_time', entrada: 'entry_time', data: 'entry_time', datahora: 'entry_time',
    exittime: 'exit_time', exit_time: 'exit_time', saida: 'exit_time',
    company: 'company', empresa: 'company',
    vehicleplate: 'vehicle_plate', vehicle_plate: 'vehicle_plate', placa: 'vehicle_plate',
    vehiclemodel: 'vehicle_model', vehicle_model: 'vehicle_model', modelo: 'vehicle_model',
    vehiclecolor: 'vehicle_color', vehicle_color: 'vehicle_color', cor: 'vehicle_color',
    badgenumber: 'badge_number', badge_number: 'badge_number', cracha: 'badge_number',
    residentid: 'resident_id', resident_id: 'resident_id', morador: 'resident_id', moradorid: 'resident_id',
    residentname: 'resident_name', resident_name: 'resident_name', nomeresidente: 'resident_name',
  },
};

const ACCESS_SIGNALS = [
  'visitante', 'visitor', 'visitorname', 'visitortype', 'visitordocument',
  'entrada', 'entrytime', 'entry_time', 'saida', 'exittime', 'exit_time', 'visitor_name',
];
const MAIL_SIGNALS = [
  'remetente', 'sender', 'correspondencia', 'encomenda', 'packagetype', 'package_type',
  'destinatario', 'tracking', 'trackingcode', 'rastreio',
];
const RESIDENT_SIGNALS = ['morador', 'apartamento', 'apartment', 'apto', 'unidade', 'cpf'];

export function detectCsvCollection(headers: string[], filename = ''): ImportCollection | null {
  const set = headers.map(normKey);
  const has = (arr: string[]) => arr.some(s => set.includes(s));
  if (has(ACCESS_SIGNALS)) return 'access_entries';
  if (has(MAIL_SIGNALS)) return 'mails';
  if (has(RESIDENT_SIGNALS)) return 'residents';

  const f = normKey(filename);
  if (/acesso|access|visit/.test(f)) return 'access_entries';
  if (/correspond|mail|encomenda|package/.test(f)) return 'mails';
  if (/morador|resident/.test(f)) return 'residents';
  return null;
}

function normalizeFieldValue(collection: ImportCollection, column: string, value: string): any {
  if (collection === 'residents' && ['vehicle_plate', 'vehicle_model', 'vehicle_color', 'vehicle_tag'].includes(column)) {
    return isEmptyValue(value) ? '' : String(value).trim().toUpperCase();
  }
  if (collection === 'mails') {
    if (column === 'status') return mapMailStatus(value);
    if (column === 'package_type') return mapMailType(value);
  }
  if (collection === 'access_entries') {
    if (column === 'visitor_type') return mapVisitorType(value);
    if (column === 'visitor_name' || column === 'apartment') return isEmptyValue(value) ? '' : String(value).trim().toUpperCase();
    if (column === 'visitor_document') return isEmptyValue(value) ? '' : String(value).trim();
  }
  return value;
}

export function csvToCollections(text: string, filename = ''): ParsedCollections {
  const { headers, rows } = parseCsv(text);
  const out: Partial<Record<ImportCollection, Record<string, any>[]>> = {};
  if (headers.length === 0 || rows.length === 0) return { collections: out };

  const collection = detectCsvCollection(headers, filename);
  if (!collection) return { collections: out };

  const map = HEADER_MAPS[collection];
  const mapped: Record<string, any>[] = [];

  rows.forEach(record => {
    const item: Record<string, any> = {};
    headers.forEach(h => {
      const column = map[normKey(h)];
      if (!column) return;
      item[column] = normalizeFieldValue(collection, column, record[h]);
    });
    // descarta linhas sem nenhuma coluna reconhecida
    if (Object.keys(item).length > 0) mapped.push(item);
  });

  if (mapped.length > 0) out[collection] = mapped;
  return { collections: out };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const HEADERS: Record<ImportCollection, string[]> = {
  residents: ['nome', 'apartamento', 'telefone', 'veiculo'],
  mails: ['morador id', 'remetente', 'tipo', 'status', 'data'],
  access_entries: ['nome', 'tipo', 'apartamento', 'entrada', 'saida'],
};

function matchHeaderLine(cells: string[]): ImportCollection | null {
  const normalized = cells.map(normKey);
  for (const key of Object.keys(HEADERS) as ImportCollection[]) {
    const expected = HEADERS[key];
    if (normalized.length === expected.length && expected.every((h, i) => normalized[i] === h)) {
      return key;
    }
  }
  return null;
}

async function loadPdfjs(): Promise<any> {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default || worker;
    } catch {
      // Sem worker explicito o pdfjs ainda tenta criar um "fake worker".
    }
  }
  return pdfjs;
}

export async function extractPdfLines(buffer: ArrayBuffer): Promise<{ lines: PdfLine[]; text: string }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: buffer,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const lines: PdfLine[] = [];
  let text = '';

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items || [])
      .filter((it: any) => it && typeof it.str === 'string' && it.str.trim() !== '')
      .map((it: any) => ({ x: it.transform[4], y: it.transform[5], str: it.str }));

    items.sort((a: any, b: any) => (b.y - a.y) || (a.x - b.x));

    for (const item of items) {
      const last = lines[lines.length - 1];
      if (last && last.page === p && Math.abs(last.y - item.y) <= 2.5) {
        last.cells.push({ x: item.x, str: item.str });
      } else {
        lines.push({ page: p, y: item.y, cells: [{ x: item.x, str: item.str }] });
      }
    }

    text += items.map((it: any) => it.str).join(' ') + '\n';
  }

  return { lines, text };
}

function splitVehicle(value: string): { plate: string; model: string } {
  const s = String(value ?? '').trim();
  if (!s || s === '-') return { plate: '', model: '' };
  const m = s.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (m) {
    const model = m[2].trim();
    return { plate: m[1].trim().toUpperCase(), model: model === '-' ? '' : model.toUpperCase() };
  }
  return { plate: s.toUpperCase(), model: '' };
}

function buildBackupRow(collection: ImportCollection, cells: string[]): Record<string, any> | null {
  if (collection === 'residents') {
    const [name, apartment, phone, vehicle] = cells;
    if (!String(name ?? '').trim() && !String(apartment ?? '').trim()) return null;
    const { plate, model } = splitVehicle(vehicle ?? '');
    return {
      name: String(name ?? '').trim().toUpperCase(),
      apartment: String(apartment ?? '').trim().toUpperCase(),
      phone: isEmptyValue(phone) ? '' : String(phone).trim(),
      vehicle_plate: plate,
      vehicle_model: model,
    };
  }
  if (collection === 'mails') {
    const [residentId, sender, packageType, status, data] = cells;
    if (!String(sender ?? '').trim() && !String(residentId ?? '').trim()) return null;
    return {
      resident_id: String(residentId ?? '').trim(),
      sender: String(sender ?? '').trim(),
      package_type: mapMailType(packageType),
      status: mapMailStatus(status),
      received_at: parseDateValue(data),
    };
  }
  // access_entries
  const [visitorName, visitorType, apartment, entryTime, exitTime] = cells;
  if (!String(visitorName ?? '').trim() && !String(apartment ?? '').trim()) return null;
  return {
    visitor_name: String(visitorName ?? '').trim().toUpperCase(),
    visitor_type: mapVisitorType(visitorType),
    apartment: String(apartment ?? '').trim().toUpperCase(),
    entry_time: parseDateValue(entryTime) || new Date().toISOString(),
    exit_time: parseDateValue(exitTime) || null,
  };
}

/**
 * Interpreta o PDF de backup multi-secao gerado pelo proprio app
 * (Moradores Cadastrados / Correspondencias / Registros de Acesso).
 */
export function parsePdfBackupLines(lines: PdfLine[]): ParsedCollections {
  const collections: Partial<Record<ImportCollection, Record<string, any>[]>> = {};
  let current: ImportCollection | null = null;
  let headerX: number[] | null = null;
  let columnCount = 0;

  const push = (collection: ImportCollection, row: Record<string, any>) => {
    (collections[collection] ||= []).push(row);
  };

  for (const line of lines) {
    const texts = line.cells.map(c => c.str);
    const joined = normKey(texts.join(' '));

    if (joined.includes('moradores cadastrados')) { current = 'residents'; headerX = null; continue; }
    if (joined.includes('correspondencias')) { current = 'mails'; headerX = null; continue; }
    if (joined.includes('registros de acesso')) { current = 'access_entries'; headerX = null; continue; }

    const header = matchHeaderLine(texts);
    if (header) {
      current = header;
      headerX = line.cells.map(c => c.x);
      columnCount = texts.length;
      continue;
    }

    if (!current || !headerX) continue;
    if (line.cells.length <= 1 && columnCount > 2) continue;

    const rowCells = new Array(columnCount).fill('');
    let filled = false;
    for (const cell of line.cells) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < headerX.length; i++) {
        const d = Math.abs(cell.x - headerX[i]);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      if (bestDist > 40) continue;
      rowCells[best] = rowCells[best] ? `${rowCells[best]} ${cell.str}` : cell.str;
      filled = true;
    }
    if (!filled) continue;

    const built = buildBackupRow(current, rowCells);
    if (built) push(current, built);
  }

  return { collections };
}

/**
 * Parser generico para PDFs que nao sao o backup do app: tenta extrair
 * moradores de linhas rotuladas ("Nome: ... Apartamento: ...") ou tabulares.
 */
export function parseGenericPdfLines(lines: PdfLine[]): ParsedCollections {
  const residents: Record<string, any>[] = [];
  const aptPattern = /^[a-z]{0,3}[- ]?\d{1,4}[a-z0-9\-/]*$/i;

  for (const line of lines) {
    const cells = line.cells.map(c => c.str.trim()).filter(Boolean);
    if (cells.length === 0) continue;
    const joined = cells.join(' ');

    const labeled = joined.match(
      /nome\s*[:\-]?\s*([^:;,|]+?)\s*[|;,:\-]\s*(?:apto|apartamento|unidade|ap)\s*[:\-]?\s*([a-z0-9\-/ ]+)/i,
    );
    if (labeled) {
      residents.push({
        name: labeled[1].trim().toUpperCase(),
        apartment: labeled[2].trim().toUpperCase(),
      });
      continue;
    }

    if (cells.length >= 2 && cells.length <= 6) {
      const name = cells[0];
      const apartment = cells[1];
      if (!/[a-zà-ú]/i.test(name)) continue;
      if (['nome', 'name'].includes(normKey(name))) continue;
      if (!aptPattern.test(apartment)) continue;
      const phone = cells.slice(2).find(c => /^\+?[\d\s()\-]{8,}$/.test(c)) || '';
      const email = cells.slice(2).find(c => c.includes('@')) || '';
      residents.push({
        name: name.toUpperCase(),
        apartment: apartment.toUpperCase(),
        phone,
        email,
      });
    }
  }

  return { collections: residents.length > 0 ? { residents } : {} };
}

export function mergeCollections(
  target: Partial<Record<ImportCollection, Record<string, any>[]>>,
  extra: Partial<Record<ImportCollection, Record<string, any>[]>>,
): void {
  (Object.keys(extra) as ImportCollection[]).forEach(key => {
    const list = extra[key];
    if (list && list.length > 0) {
      (target[key] ||= []).push(...list);
    }
  });
}

export function collectionsCount(collections: Partial<Record<ImportCollection, Record<string, any>[]>>): number {
  return (Object.values(collections) as Record<string, any>[][]).reduce((sum, list) => sum + (list?.length || 0), 0);
}

export { normalizeRow };
