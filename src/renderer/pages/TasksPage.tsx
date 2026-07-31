import React from 'react';
import { ListTodo } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { TaskList } from '../components/TaskList';

export function TasksPage() {
  const pendingCount = useAppStore((s) => s.pendingCount);
  const completedCount = useAppStore((s) => s.completedCount);
  const totalCount = useAppStore((s) => s.totalCount);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ListTodo className="h-6 w-6 text-primary" />
              Tasks
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {pendingCount.toLocaleString()} pending · {completedCount.toLocaleString()} completed
              {totalCount > 0 && (
                <span className="text-slate-400"> · {totalCount.toLocaleString()} total</span>
              )}
              {pendingSyncCount > 0 && (
                <span className="ml-2 text-amber-600 font-semibold">· {pendingSyncCount} unsynced</span>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <TaskList />
        </div>
      </div>
    </div>
  );
}
