/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PREVIEW_UPDATE_TOAST?: string;
}

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
} from './shared/types';

export type DesktopAPI = {
  getAppStatus: () => Promise<AppStatus>;
  getTasks: (query?: TaskListQuery) => Promise<TaskListPage & { error?: string }>;
  getDevices: () => Promise<{ devices: Device[]; error?: string }>;
  createTask: (input: CreateTaskInput) => Promise<{ task?: Task; error?: string }>;
  updateTask: (input: UpdateTaskInput) => Promise<{ task?: Task; error?: string }>;
  deleteTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  scanNetworkPrinters: () => Promise<string[]>;
  discoverUsbPrinters: () => Promise<UsbPrinterInfo[]>;
  getPrintersConfig: () => Promise<PrinterConfig[]>;
  savePrintersConfig: (printers: PrinterConfig[]) => Promise<void>;
  printReceipt: (args: PrintReceiptArgs) => Promise<void>;
  onStatusChanged: (cb: () => void) => () => void;
  onLogEntry: (cb: (entry: LogEntry) => void) => () => void;
  onTaskUpdated: (cb: (data: { task: Task }) => void) => () => void;
  onDeviceChanged: (cb: (data: { devices: Device[] }) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI?: DesktopAPI;
  }
}

export {};
