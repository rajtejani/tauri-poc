/**
 * Exposes the same window.electronAPI surface as the Electron preload bridge,
 * backed by Tauri commands + events. Keeps the React layer identical for fair benchmarks.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppStatus,
  CreateTaskInput,
  Device,
  LogEntry,
  Task,
  TaskListPage,
  TaskListQuery,
  UpdateTaskInput,
  PrinterConfig,
  UsbPrinterInfo,
  PrintReceiptArgs,
} from '../../shared/types';

type DesktopAPI = {
  getAppStatus: () => Promise<AppStatus>;
  getTasks: (query?: TaskListQuery) => Promise<TaskListPage & { error?: string }>;
  getDevices: () => Promise<{ devices: Device[]; error?: string }>;
  createTask: (input: CreateTaskInput) => Promise<{ task?: Task; error?: string }>;
  updateTask: (input: UpdateTaskInput) => Promise<{ task?: Task; error?: string }>;
  deleteTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  onStatusChanged: (cb: () => void) => () => void;
  onLogEntry: (cb: (entry: LogEntry) => void) => () => void;
  onTaskUpdated: (cb: (data: { task: Task }) => void) => () => void;
  onDeviceChanged: (cb: (data: { devices: Device[] }) => void) => () => void;
  scanNetworkPrinters: () => Promise<string[]>;
  discoverUsbPrinters: () => Promise<UsbPrinterInfo[]>;
  getPrintersConfig: () => Promise<PrinterConfig[]>;
  savePrintersConfig: (printers: PrinterConfig[]) => Promise<void>;
  printReceipt: (args: PrintReceiptArgs) => Promise<void>;
};

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;

  void listen<T>(event, (e) => cb(e.payload)).then((fn) => {
    if (cancelled) {
      fn();
      return;
    }
    unlisten = fn;
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export function installTauriBridge(): void {
  const api: DesktopAPI = {
    getAppStatus: () => invoke<AppStatus>('get_app_status'),
    getTasks: (query) => invoke('get_tasks', { query: query ?? null }),
    getDevices: () => invoke('get_devices'),
    createTask: (input) => invoke('create_task', { input }),
    updateTask: (input) => invoke('update_task', { input }),
    deleteTask: (id) => invoke('delete_task', { id }),
    scanNetworkPrinters: () => invoke<string[]>('scan_network_printers'),
    discoverUsbPrinters: () => invoke<UsbPrinterInfo[]>('discover_usb_printers'),
    getPrintersConfig: () => invoke<PrinterConfig[]>('get_printers_config'),
    savePrintersConfig: (printers: PrinterConfig[]) => invoke('save_printers_config', { printers }),
    printReceipt: (args: PrintReceiptArgs) =>
      invoke('print_receipt', {
        width: args.width,
        connectionType: args.connectionType ?? 'network',
        ip: args.ip ?? null,
        port: args.port ?? null,
        name: args.name ?? null,
      }),
    onStatusChanged: (cb) => subscribe<null>('status:changed', () => cb()),
    onLogEntry: (cb) => subscribe<LogEntry>('log:entry', cb),
    onTaskUpdated: (cb) => subscribe<{ task: Task }>('tasks:updated', cb),
    onDeviceChanged: (cb) => subscribe<{ devices: Device[] }>('devices:changed', cb),
  };

  window.electronAPI = api;
}
