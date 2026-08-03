import { Resident, Mail, AccessEntry, Device, RealtimeEvent } from '@/types';

const STORAGE_KEYS = {
  RESIDENTS: 'pg_residents',
  MAILS: 'pg_mails',
  ENTRIES: 'pg_entries',
  DEVICES: 'pg_devices',
  EVENTS: 'pg_events',
};

export const storage = {
  // Residents
  getResidents: (): Resident[] => {
    const data = localStorage.getItem(STORAGE_KEYS.RESIDENTS);
    return data ? JSON.parse(data) : [];
  },
  
  saveResidents: (residents: Resident[]) => {
    localStorage.setItem(STORAGE_KEYS.RESIDENTS, JSON.stringify(residents));
  },

  // Mails
  getMails: (): Mail[] => {
    const data = localStorage.getItem(STORAGE_KEYS.MAILS);
    return data ? JSON.parse(data) : [];
  },
  
  saveMails: (mails: Mail[]) => {
    localStorage.setItem(STORAGE_KEYS.MAILS, JSON.stringify(mails));
  },

  // Entries
  getEntries: (): AccessEntry[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ENTRIES);
    return data ? JSON.parse(data) : [];
  },
  
  saveEntries: (entries: AccessEntry[]) => {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  },

  // Devices
  getDevices: (): Device[] => {
    const data = localStorage.getItem(STORAGE_KEYS.DEVICES);
    return data ? JSON.parse(data) : [];
  },
  
  saveDevices: (devices: Device[]) => {
    localStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(devices));
  },

  // Events
  getEvents: (): RealtimeEvent[] => {
    const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
    return data ? JSON.parse(data) : [];
  },
  
  saveEvents: (events: RealtimeEvent[]) => {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  },

  addEvent: (event: Omit<RealtimeEvent, 'id' | 'timestamp'>) => {
    const events = storage.getEvents();
    const newEvent: RealtimeEvent = {
      ...event,
      id: `event_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    // Manter apenas os últimos 100 eventos
    const updatedEvents = [newEvent, ...events].slice(0, 100);
    storage.saveEvents(updatedEvents);
    return newEvent;
  },
};
