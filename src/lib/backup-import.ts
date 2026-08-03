import type { AccessEntry, Device, Mail, Resident } from '@/types';

export interface ParsedBackupData {
  residents: Resident[];
  mails: Mail[];
  entries: AccessEntry[];
  devices: Device[];
  authorizations: any[];
  blockedVisitors: any[];
}

const COLLECTION_KEYS = ['residents', 'mails', 'entries', 'devices', 'authorizations', 'blockedVisitors'] as const;

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const makeId = (prefix: string, index: number) => `${prefix}_${Date.now()}_${index}`;

const normalizeResident = (item: any, index: number): Resident => ({
  id: toStringValue(item?.id || item?.resident_id || item?.uuid || makeId('res', index)),
  name: toStringValue(item?.name || item?.resident_name || ''),
  cpf: toStringValue(item?.cpf || item?.document || ''),
  apartment: toStringValue(item?.apartment || item?.apt || item?.apto || item?.location || ''),
  phone: toStringValue(item?.phone || item?.telephone || ''),
  email: toStringValue(item?.email || ''),
  photo: toStringValue(item?.photo || item?.photo_url || ''),
  vehiclePlate: toStringValue(item?.vehicle_plate || item?.vehiclePlate || item?.plate || ''),
  vehicleModel: toStringValue(item?.vehicle_model || item?.vehicleModel || ''),
  vehicleColor: toStringValue(item?.vehicle_color || item?.vehicleColor || ''),
  vehicleTag: toStringValue(item?.vehicle_tag || item?.vehicleTag || ''),
  createdAt: toStringValue(item?.created_at || item?.createdAt || new Date().toISOString()),
});

const normalizeMail = (item: any, index: number): Mail => {
  const rawStatus = toStringValue(item?.status || '').toLowerCase();
  const mappedStatus = rawStatus === 'entregue' || rawStatus === 'delivered' ? 'delivered' : 'pending';

  return {
    id: toStringValue(item?.id || item?.mail_id || makeId('mail', index)),
    residentId: toStringValue(item?.resident_id || item?.residentId || item?.resident?.id || ''),
    sender: toStringValue(item?.sender || item?.remetente || ''),
    packageType: (toStringValue(item?.package_type || item?.packageType || 'Carta') as Mail['packageType']),
    notes: toStringValue(item?.notes || item?.observations || ''),
    trackingCode: toStringValue(item?.tracking_code || item?.trackingCode || ''),
    photoUrl: toStringValue(item?.photo_url || item?.photoUrl || ''),
    receivedAt: toStringValue(item?.received_at || item?.receivedAt || new Date().toISOString()),
    status: mappedStatus as Mail['status'],
    deliveredAt: toStringValue(item?.delivered_at || item?.deliveredAt || null),
    withdrawnBy: toStringValue(item?.withdrawn_by || item?.withdrawnBy || null),
  };
};

const normalizeEntry = (item: any, index: number): AccessEntry => {
  const visitorType = toStringValue(item?.visitor_type || item?.visitorType || '').toLowerCase();
  const mappedVisitorType = visitorType === 'delivery' || visitorType === 'entregador'
    ? 'delivery'
    : visitorType === 'service_provider' || visitorType === 'prestador' || visitorType === 'provider'
    ? 'service_provider'
    : 'visitor';

  return {
    id: toStringValue(item?.id || item?.entry_id || makeId('entry', index)),
    visitorName: toStringValue(item?.visitor_name || item?.visitorName || ''),
    visitorDocument: toStringValue(item?.visitor_document || item?.visitorDocument || ''),
    visitorType: mappedVisitorType as AccessEntry['visitorType'],
    residentId: toStringValue(item?.resident_id || item?.residentId || ''),
    residentName: toStringValue(item?.resident_name || item?.residentName || ''),
    apartment: toStringValue(item?.apartment || item?.apt || item?.apto || ''),
    purpose: toStringValue(item?.purpose || item?.motivo || ''),
    entryTime: toStringValue(item?.entry_time || item?.entryTime || new Date().toISOString()),
    exitTime: toStringValue(item?.exit_time || item?.exitTime || null),
    vehiclePlate: toStringValue(item?.vehicle_plate || item?.vehiclePlate || ''),
    vehicleModel: toStringValue(item?.vehicle_model || item?.vehicleModel || ''),
    vehicleColor: toStringValue(item?.vehicle_color || item?.vehicleColor || ''),
    photo: toStringValue(item?.photo || item?.photo_url || item?.photoUrl || ''),
    company: toStringValue(item?.company || item?.empresa || ''),
    autoRecognized: Boolean(item?.auto_recognized || item?.autoRecognized || false),
    badgeNumber: toStringValue(item?.badge_number || item?.badgeNumber || ''),
  };
};

const normalizeDevice = (item: any, index: number): Device => ({
  id: toStringValue(item?.id || item?.device_id || makeId('dev', index)),
  name: toStringValue(item?.name || ''),
  type: (toStringValue(item?.type || 'card_reader') as Device['type']),
  location: toStringValue(item?.location || item?.local || ''),
  status: (toStringValue(item?.status || 'offline') as Device['status']),
  lastSync: toStringValue(item?.last_sync || item?.lastSync || new Date().toISOString()),
  ipAddress: toStringValue(item?.ip_address || item?.ipAddress || ''),
  serialNumber: toStringValue(item?.serial_number || item?.serialNumber || ''),
});

const getCollection = (source: unknown, key: string): any[] => {
  if (!isObject(source)) return [];

  const direct = (source as Record<string, any>)[key];
  if (Array.isArray(direct)) return direct;

  const nested = (source as Record<string, any>).data;
  if (isObject(nested)) {
    const nestedValue = (nested as Record<string, any>)[key];
    if (Array.isArray(nestedValue)) return nestedValue;
  }

  if (isObject(direct)) {
    const nestedItems = (direct as Record<string, any>).items || (direct as Record<string, any>).data || (direct as Record<string, any>).records;
    if (Array.isArray(nestedItems)) return nestedItems;
  }

  return [];
};

export const parseBackupPayload = (payload: unknown): ParsedBackupData => {
  const root = isObject(payload) && isObject(payload.data) ? payload.data : payload;

  return {
    residents: getCollection(root, 'residents').map((item, index) => normalizeResident(item, index)),
    mails: getCollection(root, 'mails').map((item, index) => normalizeMail(item, index)),
    entries: getCollection(root, 'entries').map((item, index) => normalizeEntry(item, index)),
    devices: getCollection(root, 'devices').map((item, index) => normalizeDevice(item, index)),
    authorizations: getCollection(root, 'authorizations'),
    blockedVisitors: getCollection(root, 'blockedVisitors'),
  };
};

export const extractBackupCollections = (payload: unknown): ParsedBackupData => parseBackupPayload(payload);

export const getBackupCollectionNames = () => [...COLLECTION_KEYS];
