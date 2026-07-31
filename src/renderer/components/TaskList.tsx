import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Check, Trash2, Pencil, X, RefreshCw } from 'lucide-react';
import type { Task } from '../../shared/types';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/appStore';
import { browserMockAPI } from '../lib/browserMock';
import type { CreateTaskInput, UpdateTaskInput } from '../../shared/types';
import { loadTaskPage } from '../hooks/useAppBootstrap';

function getAPI() {
  return window.electronAPI ?? (browserMockAPI as unknown as NonNullable<typeof window.electronAPI>);
}

const ROW_HEIGHT = 72;
const OVERSCAN = 8;

function useTaskMutations() {
  const upsertTask = useAppStore((s) => s.upsertTask);
  const removeTask = useAppStore((s) => s.removeTask);

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

  async function createTask(input: CreateTaskInput) {
    const api = getAPI();
    if (!api) return null;
    const result = await api.createTask(input);
    if (result.task) upsertTask(result.task);
    return result;
  }

  return { createTask, updateTask, deleteTask };
}

const TaskRow = memo(function TaskRow({ task }: { task: Task }) {
  const { updateTask, deleteTask } = useTaskMutations();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? '');

  async function handleToggle() {
    await updateTask({ id: task.id, completed: !task.completed });
  }

  async function handleDelete() {
    await deleteTask(task.id);
  }

  async function handleSaveEdit() {
    if (!editTitle.trim()) return;
    const nextDescription = editDescription.trim() || null;
    const titleChanged = editTitle.trim() !== task.title;
    const descriptionChanged = nextDescription !== (task.description ?? null);
    if (titleChanged || descriptionChanged) {
      await updateTask({
        id: task.id,
        title: editTitle.trim(),
        description: nextDescription,
      });
    }
    setEditing(false);
  }

  function startEditing() {
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditing(true);
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border px-4 py-2 transition-all duration-150',
        task.completed
          ? 'border-slate-100 bg-slate-50/50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      )}
      style={{ height: ROW_HEIGHT - 8 }}
    >
      <button
        onClick={handleToggle}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150',
          task.completed
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-slate-300 hover:border-emerald-500/60 bg-white'
        )}
        aria-label="Toggle task"
      >
        {task.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>

      {editing ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="Title"
            className="w-full bg-white rounded px-2 py-0.5 text-sm text-slate-800 outline-none border border-slate-200 focus:border-primary"
          />
          <input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="Description (optional)"
            className="w-full bg-white rounded px-2 py-0.5 text-xs text-slate-600 outline-none border border-slate-200 focus:border-primary placeholder-slate-400"
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm truncate',
              task.completed ? 'line-through text-slate-400' : 'text-slate-800'
            )}
          >
            {task.title}
          </p>
          {task.description ? (
            <p
              className={cn(
                'text-xs truncate mt-0.5',
                task.completed ? 'text-slate-400' : 'text-slate-600'
              )}
            >
              {task.description}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!task.completed && !editing && (
          <button
            onClick={startEditing}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={handleSaveEdit}
              className="rounded p-1 text-emerald-600 hover:bg-slate-100 transition-colors"
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 transition-colors"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          onClick={handleDelete}
          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          aria-label="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {task.deviceId === 'desktop-hub' && (
        <RefreshCw className="h-3 w-3 text-amber-500 shrink-0" aria-label="Created on desktop hub" />
      )}
    </div>
  );
});

function VirtualTaskList({ tasks, onNearEnd }: { tasks: Task[]; onNearEnd: () => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalHeight = tasks.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    tasks.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visible = tasks.slice(startIndex, endIndex);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const top = e.currentTarget.scrollTop;
      setScrollTop(top);
      const remaining = e.currentTarget.scrollHeight - top - e.currentTarget.clientHeight;
      if (remaining < ROW_HEIGHT * 12) onNearEnd();
    },
    [onNearEnd]
  );

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="h-[min(60vh,560px)] overflow-y-auto pr-1"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startIndex * ROW_HEIGHT,
            left: 0,
            right: 0,
          }}
        >
          {visible.map((t) => (
            <div key={t.id} style={{ height: ROW_HEIGHT, paddingBottom: 8, boxSizing: 'border-box' }}>
              <TaskRow task={t} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TaskList() {
  const { createTask } = useTaskMutations();
  const tasks = useAppStore((s) => s.tasks);
  const totalCount = useAppStore((s) => s.totalCount);
  const hasMoreTasks = useAppStore((s) => s.hasMoreTasks);
  const tasksLoading = useAppStore((s) => s.tasksLoading);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const loadingMore = useRef(false);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    await createTask({
      title: newTitle.trim(),
      description: newDescription.trim() || null,
    });
    setNewTitle('');
    setNewDescription('');
    setCreating(false);
  }

  const loadMore = useCallback(async () => {
    if (!hasMoreTasks || loadingMore.current || tasksLoading) return;
    loadingMore.current = true;
    try {
      await loadTaskPage({ append: true });
    } finally {
      loadingMore.current = false;
    }
  }, [hasMoreTasks, tasksLoading]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="What needs to be done?"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-primary/60 focus:bg-white"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate();
            }}
            placeholder="Add more detail (optional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-primary/60 focus:bg-white"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newTitle.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {totalCount === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">No tasks yet — add one above</div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 px-1">
            Showing {tasks.length.toLocaleString()} of {totalCount.toLocaleString()}
            {hasMoreTasks ? ' · scroll for more' : ''}
          </p>
          <VirtualTaskList tasks={tasks} onNearEnd={loadMore} />
          {tasksLoading && <p className="text-xs text-slate-400 px-1 py-2">Loading more…</p>}
        </div>
      )}
    </div>
  );
}
