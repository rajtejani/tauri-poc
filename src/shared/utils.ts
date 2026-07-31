import type { LogEntry } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function createLogEntry(
  level: LogEntry['level'],
  message: string,
  meta?: Record<string, unknown>
): LogEntry {
  return {
    id: generateId(),
    level,
    message,
    timestamp: nowISO(),
    meta,
  };
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
