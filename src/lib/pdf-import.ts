// Stub for legacy PDF import. Full implementation can be restored later if needed.
// This file kept minimal to satisfy dynamic import in Settings.tsx without breaking the build.

export type ParsedResident = {
  name: string;
  apartment: string;
  cpf?: string;
  email?: string;
  phone?: string;
};

export type ParsedAccessEntry = {
  visitorName: string;
  visitorDocument?: string;
  apartment?: string;
  entryTime?: string;
};

export async function smartExtractText(_buf: ArrayBuffer, _name: string): Promise<{ text: string; method: string }> {
  return { text: '', method: 'unavailable' };
}

export function parseResidentsFromText(_text: string): ParsedResident[] {
  return [];
}

export function parsedToResident(p: ParsedResident) {
  return {
    id: '',
    name: p.name,
    apartment: p.apartment,
    cpf: p.cpf || '',
    email: p.email || '',
    phone: p.phone || '',
    createdAt: new Date().toISOString(),
  };
}

export function detectTextType(_text: string): 'residents' | 'access' | 'unknown' {
  return 'unknown';
}

export function parseAccessEntriesFromText(_text: string): ParsedAccessEntry[] {
  return [];
}

export function parsedToAccessEntry(p: ParsedAccessEntry) {
  return {
    id: '',
    visitorName: p.visitorName,
    visitorDocument: p.visitorDocument || '',
    visitorType: 'visitor' as const,
    residentId: '',
    residentName: '',
    apartment: p.apartment || '',
    purpose: '',
    entryTime: p.entryTime || new Date().toISOString(),
    exitTime: null,
  };
}
