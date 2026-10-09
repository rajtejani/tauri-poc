/**
 * Browser mock of the Electron API — used when running outside Electron.
 */

import type {
  Task,
  Device,
  AppStatus,
  CreateTaskInput,
  UpdateTaskInput,
  LogEntry,
  TaskListQuery,
  TaskListPage,
  PrinterConfig,
  UsbPrinterInfo,
  PrintReceiptArgs,
  PrintRasterArgs,
  SelftestPrintArgs,
} from '../../shared/types';
import { UI_TASK_PAGE_SIZE } from '../../shared/types';
import { generateId, nowISO, createLogEntry } from '../../shared/utils';

const DESKTOP_DEVICE_ID = 'desktop-hub';

function makeTask(title: string, completed: boolean): Task {
  const now = nowISO();
  return {
    id: generateId(),
    title,
    description: null,
    completed,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deviceId: DESKTOP_DEVICE_ID,
    deletedAt: null,
  };
}

let tasks: Task[] = [
  makeTask('Set up SQLite database', true),
  makeTask('Configure Socket.IO server', true),
  makeTask('Build dashboard UI', false),
  makeTask('Test LAN sync with mobile client', false),
].filter((t) => !t.id.startsWith('loadtest_'));

let devices: Device[] = [
  { id: 'dev-1', name: 'MacBook Pro', type: 'desktop', connected: true, lastSeen: nowISO() },
  { id: 'dev-2', name: 'iPhone 15', type: 'mobile', connected: true, lastSeen: nowISO() },
];

let logs: LogEntry[] = [
  createLogEntry('success', 'Server started on port 4000', { ip: '192.168.1.100' }),
  createLogEntry('success', 'Database initialized', { path: '~/AppData/app.db' }),
  createLogEntry('info', 'Client connected', { deviceId: 'dev-1', name: 'MacBook Pro' }),
  createLogEntry('info', 'Client connected', { deviceId: 'dev-2', name: 'iPhone 15' }),
  createLogEntry('success', 'Task created via socket', { title: 'Set up SQLite database' }),
];

const statusListeners: Array<() => void> = [];
const logListeners: Array<(entry: LogEntry) => void> = [];

function pushLog(entry: LogEntry) {
  logs = [entry, ...logs].slice(0, 100);
  logListeners.forEach((cb) => cb(entry));
  statusListeners.forEach((cb) => cb());
}

function buildStatus(): AppStatus {
  return {
    server: {
      running: true,
      port: 4000,
      ipAddress: '192.168.1.100',
      startedAt: new Date(Date.now() - 60000).toISOString(),
    },
    database: { connected: true, path: '~/Library/Application Support/offline-hub/app.db' },
    connectedDevices: devices,
    pendingSyncCount: tasks.filter((t) => t.deviceId === DESKTOP_DEVICE_ID && !t.deletedAt).length,
    logs,
  };
}

function activeTasks(): Task[] {
  return tasks
    .filter((t) => !t.deletedAt && !t.id.startsWith('loadtest_'))
    .sort((a, b) =>
      b.updatedAt === a.updatedAt ? b.id.localeCompare(a.id) : b.updatedAt.localeCompare(a.updatedAt)
    );
}

function getTasksPage(query?: TaskListQuery): TaskListPage {
  const limit = query?.limit ?? UI_TASK_PAGE_SIZE;
  let list = activeTasks();
  if (query?.filter === 'pending') list = list.filter((t) => !t.completed);
  if (query?.filter === 'completed') list = list.filter((t) => t.completed);
  const all = activeTasks();
  if (query?.cursor) {
    list = list.filter(
      (t) =>
        t.updatedAt < query.cursor!.updatedAt ||
        (t.updatedAt === query.cursor!.updatedAt && t.id < query.cursor!.id)
    );
  }
  const page = list.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const slice = hasMore ? page.slice(0, limit) : page;
  const last = slice[slice.length - 1];
  return {
    tasks: slice,
    totalCount: all.length,
    pendingCount: all.filter((t) => !t.completed).length,
    completedCount: all.filter((t) => t.completed).length,
    hasMore,
    nextCursor: last ? { updatedAt: last.updatedAt, id: last.id } : null,
  };
}

export const browserMockAPI = {
  getAppStatus: async (): Promise<AppStatus> => buildStatus(),

  getTasks: async (query?: TaskListQuery) => getTasksPage(query),

  getDevices: async () => ({ devices }),

  createTask: async (input: CreateTaskInput) => {
    const task = makeTask(input.title, false);
    if (input.description) task.description = input.description;
    tasks = [task, ...tasks];
    pushLog(createLogEntry('success', 'Task created', { title: task.title }));
    return { task };
  },

  updateTask: async (input: UpdateTaskInput) => {
    const idx = tasks.findIndex((t) => t.id === input.id);
    if (idx < 0) return { error: 'Not found' };
    const { id, ...updates } = input;
    const now = nowISO();
    tasks[idx] = {
      ...tasks[idx],
      ...updates,
      updatedAt: now,
      version: tasks[idx].version + 1,
      deviceId: DESKTOP_DEVICE_ID,
    };
    pushLog(createLogEntry('info', 'Task updated', { id }));
    return { task: tasks[idx] };
  },

  deleteTask: async (id: string) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { success: false };
    const now = nowISO();
    tasks[idx] = {
      ...tasks[idx],
      updatedAt: now,
      version: tasks[idx].version + 1,
      deletedAt: now,
      deviceId: DESKTOP_DEVICE_ID,
    };
    pushLog(createLogEntry('info', 'Task deleted', { id }));
    return { success: true };
  },

  onStatusChanged: (cb: () => void) => {
    statusListeners.push(cb);
    return () => {
      const i = statusListeners.indexOf(cb);
      if (i >= 0) statusListeners.splice(i, 1);
    };
  },

  scanNetworkPrinters: async (): Promise<string[]> => {
    // Wait 1.5s to simulate scanning
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Dynamically derive mock subnet based on host
    let subnet = '192.168.1';
    const host = window.location.hostname;
    const parts = host.split('.');
    if (parts.length === 4 && parts.every((p) => !isNaN(Number(p)))) {
      subnet = parts.slice(0, 3).join('.');
    }
    return [`${subnet}.55`, `${subnet}.89`].filter((ip) => ip !== host);
  },

  discoverUsbPrinters: async (): Promise<UsbPrinterInfo[]> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return [
      {
        name: 'HP LaserJet Pro',
        portName: 'USB001',
        status: '0',
      },
    ];
  },

  getPrintersConfig: async (): Promise<PrinterConfig[]> => {
    const saved = localStorage.getItem('mock_printers');
    if (saved) {
      return JSON.parse(saved);
    }
    return []; // Start with an empty list for restaurant deployment
  },

  savePrintersConfig: async (printers: PrinterConfig[]): Promise<void> => {
    localStorage.setItem('mock_printers', JSON.stringify(printers));
    pushLog(createLogEntry('info', 'Printer configurations saved', { count: printers.length }));
  },

  printReceipt: async (args: PrintReceiptArgs): Promise<void> => {
    pushLog(
      createLogEntry('success', `Receipt printed (${args.connectionType ?? 'network'})`, {
        ...args,
      }),
    );
  },

  printRaster: async (args: PrintRasterArgs): Promise<void> => {
    pushLog(
      createLogEntry('success', `Raster print (${args.connectionType ?? 'network'})`, {
        mode: args.mode ?? 'gsv0',
        widthDots: args.widthDots,
        height: args.height,
        byteLength: args.rows.length,
        name: args.name,
        ip: args.ip,
      }),
    );
  },

  printSelftest: async (args: SelftestPrintArgs): Promise<void> => {
    pushLog(
      createLogEntry('success', `Printer self-test (${args.connectionType ?? 'network'})`, {
        name: args.name,
        ip: args.ip,
      }),
    );
  },

  onLogEntry: (cb: (entry: LogEntry) => void) => {
    logListeners.push(cb);
    return () => {
      const i = logListeners.indexOf(cb);
      if (i >= 0) logListeners.splice(i, 1);
    };
  },

  onTaskUpdated: (_cb: (data: { task: Task }) => void) => () => {},
  onDeviceChanged: (_cb: () => void) => () => {},
};
