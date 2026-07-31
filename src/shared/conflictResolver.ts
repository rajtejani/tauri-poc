import type { Task } from './types';

/** Last-Write-Wins — mirrors the mobile client's conflictResolver.ts */
export function resolveConflict(local: Task, remote: Task): Task {
  if (remote.version !== local.version) {
    return remote.version > local.version ? remote : local;
  }
  if (remote.updatedAt !== local.updatedAt) {
    return remote.updatedAt > local.updatedAt ? remote : local;
  }
  return remote.deviceId >= local.deviceId ? remote : local;
}
