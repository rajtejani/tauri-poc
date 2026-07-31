// Shared types used by both main process and renderer

export interface Device {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  connected: boolean;
  lastSeen: string; // ISO timestamp
}

/**
 * Canonical task shape — matches the mobile Socket.IO contract
 * (see Offline-First-Assets/artifacts/task-sync-mobile/SOCKET_CONTRACT.md).
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  deviceId: string;
  /** Soft-delete tombstone; null when the task is active. */
  deletedAt: string | null;
}

export interface SyncEvent {
  id: string;
  type: EventType;
  payload: unknown;
  timestamp: string;
  deviceId?: string;
}

export type EventType =
  | 'device:connect'
  | 'device:disconnect'
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'task:list'
  | 'server:start'
  | 'db:write';

export interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  ipAddress: string;
  startedAt: string | null;
}

export interface DatabaseStatus {
  connected: boolean;
  path: string;
  size?: number;
}

export interface AppStatus {
  server: ServerStatus;
  database: DatabaseStatus;
  connectedDevices: Device[];
  pendingSyncCount: number;
  logs: LogEntry[];
}

// IPC channel definitions — single source of truth
export const IPC_CHANNELS = {
  // Renderer -> Main
  GET_APP_STATUS: 'app:get-status',
  GET_TASKS: 'tasks:get-all',
  CREATE_TASK: 'tasks:create',
  UPDATE_TASK: 'tasks:update',
  DELETE_TASK: 'tasks:delete',
  GET_DEVICES: 'devices:get-all',
  // Main -> Renderer (push events)
  TASK_UPDATED: 'tasks:updated',
  DEVICE_CHANGED: 'devices:changed',
  LOG_ENTRY: 'log:entry',
  STATUS_CHANGED: 'status:changed',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Socket.IO wire payloads (mobile client contract)
export interface TaskMutationPayload {
  operationId: string;
  deviceId: string;
  task: Task;
}

export interface MutationAck {
  operationId: string;
  success: boolean;
  conflict?: boolean;
  resolvedTask?: Task;
  error?: string;
}

export interface SyncRequestPayload {
  deviceId: string;
  since: string | null;
  /** Max tasks per page. Host defaults to SYNC_TASK_PAGE_SIZE. */
  limit?: number;
  /** Continue after this row (ASC sync order). Omit/null for first page. */
  cursor?: TaskCursor | null;
}

export interface SyncResponsePayload {
  tasks: Task[];
  serverTime: string;
  hasMore: boolean;
  nextCursor: TaskCursor | null;
}

/** Keyset cursor for paged sync / list queries. */
export interface TaskCursor {
  updatedAt: string;
  id: string;
}

export type TaskListFilter = 'all' | 'pending' | 'completed';

export interface TaskListQuery {
  limit?: number;
  cursor?: TaskCursor | null;
  filter?: TaskListFilter;
}

export interface TaskListPage {
  tasks: Task[];
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  hasMore: boolean;
  nextCursor: TaskCursor | null;
}

/** UI list page size (desktop + mobile FlatList window). */
export const UI_TASK_PAGE_SIZE = 100;

/** Sync pull chunk size — mobile and desktop host must match. */
export const SYNC_TASK_PAGE_SIZE = 500;

export interface SocketDeviceConnectPayload {
  deviceId: string;
  name: string;
  type: Device['type'];
}

export interface SocketTaskPayload {
  task: Task;
  sourceDeviceId?: string;
}

export interface SocketTaskListPayload {
  tasks: Task[];
}

export type CreateTaskInput = Pick<Task, 'title'> & { description?: string | null };
export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'completed'>> & { id: string };

export interface PrinterConfig {
  name: string;
  ip: string;
  port: number;
  width: '58mm' | '80mm' | '110mm';
}

