export interface Resident {
  id: string;
  name: string;
  cpf?: string;
  apartment: string;
  phone?: string;
  email?: string;
  photo?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleTag?: string;
  createdAt: string;
}

export interface Mail {
  id: string;
  residentId: string;
  sender: string;
  packageType: 'Carta' | 'Pacote Pequeno' | 'Pacote Médio' | 'Pacote Grande';
  notes: string;
  trackingCode?: string;
  photoUrl?: string;
  receivedAt: string;
  status: 'pending' | 'delivered';
  deliveredAt: string | null;
  withdrawnBy: string | null;
}

export interface AccessEntry {
  id: string;
  visitorName: string;
  visitorDocument: string;
  visitorType: 'visitor' | 'service_provider' | 'delivery';
  residentId: string;
  residentName: string;
  apartment: string;
  purpose: string;
  entryTime: string;
  exitTime: string | null;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  photo?: string;
  company?: string;
  autoRecognized?: boolean;
  badgeNumber?: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'facial_recognition' | 'vehicle_tag' | 'card_reader';
  location: string;
  status: 'online' | 'offline';
  lastSync: string;
  ipAddress?: string;
  serialNumber?: string;
}

export interface RealtimeEvent {
  id: string;
  type: 'entry' | 'exit' | 'mail' | 'alert' | 'device';
  description: string;
  timestamp: string;
  priority: 'low' | 'medium' | 'high';
  relatedId?: string;
}

export interface DashboardStats {
  totalResidents: number;
  pendingMails: number;
  activeVisitors: number;
  todayEntries: number;
}
