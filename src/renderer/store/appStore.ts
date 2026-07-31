import { create } from 'zustand';
import type { Task, Device, LogEntry, AppStatus, TaskCursor } from '../../shared/types';

interface AppStore {
  // Server
  serverRunning: boolean;
  serverPort: number;
  serverIp: string;
  serverStartedAt: string | null;

  // Database
  dbConnected: boolean;
  dbPath: string;

  // Tasks (windowed — never the full table)
  tasks: Task[];
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  hasMoreTasks: boolean;
  taskCursor: TaskCursor | null;
  tasksLoading: boolean;

  // Devices
  connectedDevices: Device[];

  // Sync
  pendingSyncCount: number;

  // Logs
  logs: LogEntry[];

  // UI
  isLoading: boolean;

  // Actions
  setAppStatus: (status: AppStatus) => void;
  setTaskPage: (page: {
    tasks: Task[];
    totalCount: number;
    pendingCount: number;
    completedCount: number;
    hasMore: boolean;
    nextCursor: TaskCursor | null;
    append?: boolean;
  }) => void;
  setTasksLoading: (loading: boolean) => void;
  upsertTask: (task: Task) => void;
  removeTask: (id: string) => void;
  addLogEntry: (entry: LogEntry) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  serverRunning: false,
  serverPort: 4000,
  serverIp: '...',
  serverStartedAt: null,
  dbConnected: false,
  dbPath: '',
  tasks: [],
  totalCount: 0,
  pendingCount: 0,
  completedCount: 0,
  hasMoreTasks: false,
  taskCursor: null,
  tasksLoading: false,
  connectedDevices: [],
  pendingSyncCount: 0,
  logs: [],
  isLoading: true,

  setAppStatus: (status: AppStatus) =>
    set({
      serverRunning: status.server.running,
      serverPort: status.server.port,
      serverIp: status.server.ipAddress,
      serverStartedAt: status.server.startedAt,
      dbConnected: status.database.connected,
      dbPath: status.database.path,
      connectedDevices: status.connectedDevices,
      pendingSyncCount: status.pendingSyncCount,
      logs: status.logs,
    }),

  setTaskPage: (page) =>
    set((state) => {
      const tasks = page.append
        ? mergeById(state.tasks, page.tasks)
        : page.tasks;
      return {
        tasks,
        totalCount: page.totalCount,
        pendingCount: page.pendingCount,
        completedCount: page.completedCount,
        hasMoreTasks: page.hasMore,
        taskCursor: page.nextCursor,
        tasksLoading: false,
      };
    }),

  setTasksLoading: (loading: boolean) => set({ tasksLoading: loading }),

  upsertTask: (task: Task) =>
    set((state) => {
      if (task.deletedAt) {
        return {
          tasks: state.tasks.filter((t) => t.id !== task.id),
          totalCount: Math.max(0, state.totalCount - (state.tasks.some((t) => t.id === task.id) ? 1 : 0)),
        };
      }
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const next = [...state.tasks];
        const prev = next[idx];
        next[idx] = task;
        let pendingDelta = 0;
        let completedDelta = 0;
        if (prev.completed !== task.completed) {
          pendingDelta = task.completed ? -1 : 1;
          completedDelta = task.completed ? 1 : -1;
        }
        return {
          tasks: next,
          pendingCount: state.pendingCount + pendingDelta,
          completedCount: state.completedCount + completedDelta,
        };
      }
      return {
        tasks: [task, ...state.tasks],
        totalCount: state.totalCount + 1,
        pendingCount: state.pendingCount + (task.completed ? 0 : 1),
        completedCount: state.completedCount + (task.completed ? 1 : 0),
      };
    }),

  removeTask: (id: string) =>
    set((state) => {
      const existing = state.tasks.find((t) => t.id === id);
      if (!existing) return { tasks: state.tasks.filter((t) => t.id !== id) };
      return {
        tasks: state.tasks.filter((t) => t.id !== id),
        totalCount: Math.max(0, state.totalCount - 1),
        pendingCount: Math.max(0, state.pendingCount - (existing.completed ? 0 : 1)),
        completedCount: Math.max(0, state.completedCount - (existing.completed ? 1 : 0)),
      };
    }),

  addLogEntry: (entry: LogEntry) =>
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 100),
    })),

  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));

function mergeById(existing: Task[], incoming: Task[]): Task[] {
  const seen = new Set(existing.map((t) => t.id));
  const extras = incoming.filter((t) => !seen.has(t.id));
  return [...existing, ...extras];
}
