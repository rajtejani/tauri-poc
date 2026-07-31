import { useAppStore } from '../store/appStore';
import { browserMockAPI } from '../lib/browserMock';
import type { CreateTaskInput, UpdateTaskInput } from '../../shared/types';

function getAPI() {
  return window.electronAPI ?? (browserMockAPI as unknown as NonNullable<typeof window.electronAPI>);
}

export function useTasks() {
  const upsertTask = useAppStore((s) => s.upsertTask);
  const removeTask = useAppStore((s) => s.removeTask);

  async function createTask(input: CreateTaskInput) {
    const api = getAPI();
    if (!api) return null;
    const result = await api.createTask(input);
    if (result.task) upsertTask(result.task);
    return result;
  }

  async function updateTask(input: UpdateTaskInput) {
    const api = getAPI();
    if (!api) return null;
    const result = await api.updateTask(input);
    if (result.task) upsertTask(result.task);
    return result;
  }

  async function deleteTask(id: string) {
    const api = getAPI();
    if (!api) return null;
    removeTask(id);
    return api.deleteTask(id);
  }

  return { createTask, updateTask, deleteTask };
}
