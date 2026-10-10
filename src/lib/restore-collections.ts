// Restauracao de colecoes no banco de dados.
// Compartilhado pelas importacoes JSON, CSV e PDF.

export interface RestoreTableResult {
  table: string;
  ok: number;
  fail: number;
  error?: string;
}

export interface RestoreResult {
  results: RestoreTableResult[];
  totalOk: number;
  totalFail: number;
  failedTables: RestoreTableResult[];
}

// Mapeamento de tabelas para aliases de exportacoes antigas/versoes anteriores
export const TABLE_ALIASES: Record<string, string[]> = {
  residents: ['residents', 'residentes', 'moradores'],
  vehicles: ['vehicles', 'veiculos'],
  mails: ['mails', 'correspondencias', 'packages'],
  access_entries: ['access_entries', 'accessEntries', 'entries', 'registros', 'acessos'],
  devices: ['devices', 'dispositivos', 'equipamentos'],
  controlid_config: ['controlid_config', 'controlidConfig', 'controlIdConfig'],
  visitor_authorizations: ['visitor_authorizations', 'visitorAuthorizations', 'authorizations', 'autorizacoes'],
  blocked_visitors: ['blocked_visitors', 'blockedVisitors', 'bloqueados'],
  announcements: ['announcements', 'comunicados', 'avisos'],
  announcement_attachments: ['announcement_attachments', 'announcementAttachments'],
  announcement_reads: ['announcement_reads', 'announcementReads'],
  chat_messages: ['chat_messages', 'chatMessages', 'mensagens'],
  incidents: ['incidents', 'ocorrencias'],
  notifications: ['notifications', 'notificacoes'],
  portaria_equipment: ['portaria_equipment', 'portariaEquipment', 'equipamentosPortaria'],
  profiles: ['profiles', 'perfis'],
  push_subscriptions: ['push_subscriptions', 'pushSubscriptions'],
  shift_equipment_checks: ['shift_equipment_checks', 'shiftEquipmentChecks'],
  shifts: ['shifts', 'turnos'],
  user_roles: ['user_roles', 'userRoles', 'roles'],
  vapid_keys: ['vapid_keys', 'vapidKeys'],
};

// Mapeamento de propriedades em camelCase para snake_case do banco
export const FIELD_ALIASES: Record<string, string> = {
  vehiclePlate: 'vehicle_plate',
  vehicleModel: 'vehicle_model',
  vehicleColor: 'vehicle_color',
  vehicleTag: 'vehicle_tag',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  photoUrl: 'photo_url',
  photo: 'photo_url',
  residentId: 'resident_id',
  packageType: 'package_type',
  trackingCode: 'tracking_code',
  receivedAt: 'received_at',
  deliveredAt: 'delivered_at',
  withdrawnBy: 'withdrawn_by',
  registeredBy: 'registered_by',
  visitorName: 'visitor_name',
  visitorDocument: 'visitor_document',
  visitorType: 'visitor_type',
  residentName: 'resident_name',
  entryTime: 'entry_time',
  exitTime: 'exit_time',
  autoRecognized: 'auto_recognized',
  badgeNumber: 'badge_number',
  startDate: 'start_date',
  endDate: 'end_date',
  ipAddress: 'ip_address',
  serialNumber: 'serial_number',
  lastSync: 'last_sync',
  blockedAt: 'blocked_at',
  blockedBy: 'blocked_by',
  authorizedDate: 'authorized_date',
  authorizedUntil: 'authorized_until',
  staffNotes: 'staff_notes',
  reviewedBy: 'reviewed_by',
  authUserId: 'auth_user_id',
  authUser_id: 'auth_user_id',
  isOwner: 'is_owner',
  deviceName: 'device_name',
  deviceIp: 'device_ip',
  devicePort: 'device_port',
  deviceId: 'device_id',
  apiPath: 'api_path',
  isActive: 'is_active',
};

// Ordem de importacao respeitando dependencias de chave estrangeira
export const RESTORE_ORDER = [
  'profiles',
  'user_roles',
  'residents',
  'vehicles',
  'devices',
  'controlid_config',
  'portaria_equipment',
  'vapid_keys',
  'push_subscriptions',
  'shifts',
  'shift_equipment_checks',
  'incidents',
  'blocked_visitors',
  'visitor_authorizations',
  'access_entries',
  'mails',
  'announcements',
  'announcement_attachments',
  'announcement_reads',
  'chat_messages',
  'notifications',
];

export function normalizeRow(row: Record<string, any>): Record<string, any> {
  if (!row || typeof row !== 'object') return row;
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    const snakeKey = FIELD_ALIASES[k] || k.replace(/([A-Z])/g, '_$1').toLowerCase();
    normalized[snakeKey] = v;
  }
  return normalized;
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const AUTH_USER_FK_FIELDS = [
  'created_by', 'registered_by', 'withdrawn_by',
  'reported_by', 'resolved_by', 'blocked_by',
  'auth_user_id', 'reviewed_by', 'granted_by',
];

export interface RestoreOptions {
  chunkSize?: number;
  onStatus?: (message: string) => void;
}

/**
 * Restaura um conjunto de colecoes (objeto com arrays por tabela) no banco atual,
 * respeitando dependencias e sanitizando chaves estrangeiras. Retorna contagem
 * de sucesso/falha por tabela.
 */
export async function restoreCollections(
  supabase: any,
  rootData: Record<string, any>,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const CHUNK = options.chunkSize ?? 100;
  const results: RestoreTableResult[] = [];

  options.onStatus?.('Restaurando dados no banco atual...');

  // Preencher IDs validos de auth.users do banco destino para evitar violacao de FK
  const validUserIds = new Set<string>();
  try {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.id) validUserIds.add(currentUser.id);

    const { data: profiles } = await supabase.from('profiles').select('id');
    if (profiles) profiles.forEach((p: any) => validUserIds.add(p.id));

    const { data: roles } = await supabase.from('user_roles').select('user_id');
    if (roles) roles.forEach((r: any) => validUserIds.add(r.user_id));
  } catch (err) {
    console.warn('[restore] Erro ao carregar usuarios locais:', err);
  }

  // Preencher IDs de residentes existentes (para validar FKs e casar IDs truncados)
  const existingResidentIds = new Set<string>();
  try {
    const { data: dbRes } = await supabase.from('residents').select('id');
    if (dbRes) dbRes.forEach((r: any) => existingResidentIds.add(r.id));
  } catch (err) {
    console.warn('[restore] Erro ao carregar residentes locais:', err);
  }

  // Casamento por prefixo: PDFs exportados truncam o ID do morador (12 caracteres).
  const resolveResidentId = (value: string): string | null => {
    if (existingResidentIds.has(value)) return value;
    if (value.length >= 8) {
      const matches = [...existingResidentIds].filter(id => id.startsWith(value));
      if (matches.length === 1) return matches[0];
    }
    return null;
  };

  const sanitizeRow = (table: string, row: Record<string, any>) => {
    const sanitized = { ...row };

    for (const field of AUTH_USER_FK_FIELDS) {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        if (!validUserIds.has(sanitized[field])) {
          sanitized[field] = null;
        }
      }
    }

    if ((table === 'realtime_events' || table === 'notifications') && sanitized.user_id) {
      if (!validUserIds.has(sanitized.user_id)) {
        sanitized.user_id = null;
      }
    }

    if (table === 'residents') {
      if (sanitized.cpf !== undefined && (sanitized.cpf === null || String(sanitized.cpf).trim() === '')) {
        sanitized.cpf = null;
      }
      if (sanitized.email !== undefined && (sanitized.email === null || String(sanitized.email).trim() === '')) {
        sanitized.email = null;
      }
    }

    if ((table === 'access_entries' || table === 'mails') && sanitized.resident_id) {
      if (existingResidentIds.size > 0) {
        const resolved = resolveResidentId(String(sanitized.resident_id));
        sanitized.resident_id = resolved; // null quando nao existir no destino
      }
    }

    return sanitized;
  };

  for (const table of RESTORE_ORDER) {
    const possibleKeys = TABLE_ALIASES[table] || [table];
    let rawRows: any[] = [];

    for (const key of possibleKeys) {
      if (Array.isArray(rootData[key]) && rootData[key].length > 0) {
        rawRows = rootData[key];
        break;
      }
    }

    if (rawRows.length === 0) continue;

    let rows = rawRows.map(r => normalizeRow(r));

    if (table === 'profiles') {
      rows = rows.filter(r => r.id && validUserIds.has(r.id));
    } else if (table === 'user_roles') {
      rows = rows.filter(r => r.user_id && validUserIds.has(r.user_id));
    }

    if (rows.length === 0) continue;

    rows = rows.map(r => sanitizeRow(table, r));

    // Garante um id em cada linha (necessario para o upsert).
    rows = rows.map(r => (r.id ? r : { ...r, id: makeId() }));

    let ok = 0, fail = 0, lastErr = '';

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(table as any)
        .upsert(chunk, { onConflict: 'id' } as any);

      if (error) {
        for (const row of chunk) {
          const { error: rowErr } = await supabase
            .from(table as any)
            .upsert(row, { onConflict: 'id' } as any);

          if (rowErr) {
            fail++;
            lastErr = rowErr.message;
            console.error(`[restore] ${table} erro na linha:`, rowErr.message, row);
          } else {
            ok++;
            if (table === 'residents' && row.id) existingResidentIds.add(row.id);
          }
        }
      } else {
        ok += chunk.length;
        if (table === 'residents') {
          chunk.forEach(r => r.id && existingResidentIds.add(r.id));
        }
      }
    }

    results.push({ table, ok, fail, error: lastErr });
  }

  const totalOk = results.reduce((s, r) => s + r.ok, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const failedTables = results.filter(r => r.fail > 0);

  return { results, totalOk, totalFail, failedTables };
}
