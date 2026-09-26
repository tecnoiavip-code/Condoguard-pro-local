import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

// Máscara de telefone: (11) 99999-9999 / (11) 9999-9999
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const isValidPhone = (value: string): boolean => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

// Máscara de CPF: 000.000.000-00
export function formatCPF(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += parseInt(digits[i], 10) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const firstDigit = calcDigit(9);
  if (firstDigit !== parseInt(digits[9], 10)) return false;
  const secondDigit = calcDigit(10);
  return secondDigit === parseInt(digits[10], 10);
}

// Placa: ABC-1234 (antiga) ou ABC1D23 (Mercosul)
export function formatPlate(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
  if (/^[A-Z]{3}\d{4}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  return cleaned;
}

export const isValidPlate = (value: string): boolean => {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 7) return false;
  return /^[A-Z]{3}\d{4}$/.test(cleaned) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(cleaned);
};

export interface StayAlert {
  severity: "warning" | "danger";
  message: string;
}

export const DELIVERY_MAX_MINUTES = 45;
export const SERVICE_PROVIDER_MAX_HOURS = 4;

const formatDuration = (minutes: number): string => {
  const totalMinutes = Math.floor(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
};

// Alerta de permanência prolongada:
// - Entregador (delivery): mais de 45 minutos
// - Prestador de serviço: mais de 4 horas ou ainda no local após as 18h
export function getStayAlert(
  visitorType: string,
  entryTime: string | null | undefined,
  exitTime: string | null | undefined = null,
  referenceTime: Date = new Date()
): StayAlert | null {
  if (!entryTime) return null;
  const entry = new Date(entryTime).getTime();
  if (Number.isNaN(entry)) return null;

  const end = exitTime ? new Date(exitTime).getTime() : referenceTime.getTime();
  const minutes = (end - entry) / 60000;
  if (minutes < 0) return null;

  if (visitorType === "delivery" && minutes > DELIVERY_MAX_MINUTES) {
    return {
      severity: "danger",
      message: `Entregador há ${formatDuration(minutes)} (limite: ${DELIVERY_MAX_MINUTES}min)`,
    };
  }

  if (visitorType === "service_provider") {
    if (minutes > SERVICE_PROVIDER_MAX_HOURS * 60) {
      return {
        severity: "danger",
        message: `Prestador há ${formatDuration(minutes)} (limite: ${SERVICE_PROVIDER_MAX_HOURS}h)`,
      };
    }
    if (!exitTime && referenceTime.getHours() >= 18) {
      return {
        severity: "warning",
        message: "Prestador ainda no condomínio após 18h",
      };
    }
  }

  return null;
}
