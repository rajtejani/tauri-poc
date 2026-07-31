import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { browserMockAPI } from '../lib/browserMock';
import type { LogEntry, Task } from '../../shared/types';
import { UI_TASK_PAGE_SIZE } from '../../shared/types';

function getAPI() {
  return window.electronAPI ?? (browserMockAPI as unknown as NonNullable<typeof window.electronAPI>);
}

/**
 * Bootstraps the app: fetches initial status + first task page, subscribes to push events.
 * Falls back to browser mock when running outside Electron.
 */
export function useAppBootstrap(): void {
  const { setAppStatus, setTaskPage, upsertTask, addLogEntry, setLoading } = useAppStore();

  useEffect(() => {
    const api = getAPI();
    if (!api) {
      setLoading(false);
      return;
    }

    async function loadInitial() {
      setLoading(true);
      try {
        const [status, page] = await Promise.all([
          api!.getAppStatus(),
          api!.getTasks({ limit: UI_TASK_PAGE_SIZE }),
        ]);
        setAppStatus(status);
        if (page.tasks) {
          setTaskPage({
            tasks: page.tasks,
            totalCount: page.totalCount,
            pendingCount: page.pendingCount,
            completedCount: page.completedCount,
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
          });
        }
      } catch (err) {
        console.error('Bootstrap failed:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitial();

    // Status/device/log changes must NOT reload the full task list.
    const unsubStatus = api.onStatusChanged(async () => {
      const status = await api!.getAppStatus();
      setAppStatus(status);
    });

    // Remote (and local) task writes arrive as a single-task push — keeps UI live at 150k scale.
    const unsubTask = api.onTaskUpdated(({ task }: { task: Task }) => {
      upsertTask(task);
    });

    const unsubLog = api.onLogEntry((entry: LogEntry) => {
      addLogEntry(entry);
    });

    return () => {
      unsubStatus();
      unsubTask();
      unsubLog();
    };
  }, []);
}

export function useRefreshStatus(): () => Promise<void> {
  const { setAppStatus } = useAppStore();
  return async () => {
    const api = getAPI();
    if (!api) return;
    const status = await api.getAppStatus();
    setAppStatus(status);
  };
}

export async function loadTaskPage(options?: { append?: boolean }): Promise<void> {
  const api = getAPI();
  if (!api) return;
  const { setTaskPage, setTasksLoading, taskCursor, hasMoreTasks } = useAppStore.getState();
  const append = options?.append ?? false;
  if (append && !hasMoreTasks) return;

  setTasksLoading(true);
  try {
    const page = await api.getTasks({
      limit: UI_TASK_PAGE_SIZE,
      cursor: append ? taskCursor : null,
    });
    setTaskPage({
      tasks: page.tasks,
      totalCount: page.totalCount,
      pendingCount: page.pendingCount,
      completedCount: page.completedCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      append,
    });
  } finally {
    setTasksLoading(false);
  }
}
