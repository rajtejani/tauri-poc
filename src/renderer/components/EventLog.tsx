import React from 'react';
import type { LogEntry } from '../../shared/types';
import { cn } from '../lib/utils';
import { formatTimestamp } from '../../shared/utils';
import { Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

const levelConfig = {
  info: {
    icon: Info,
    class: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
  },
  warn: {
    icon: AlertTriangle,
    class: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  error: {
    icon: XCircle,
    class: 'text-rose-600',
    bg: 'bg-rose-50',
    dot: 'bg-rose-500',
  },
  success: {
    icon: CheckCircle2,
    class: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
  },
};

interface LogRowProps {
  entry: LogEntry;
}

function LogRow({ entry }: LogRowProps) {
  const cfg = levelConfig[entry.level];
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-0">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', cfg.class)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 leading-snug">{entry.message}</p>
        {entry.meta && Object.keys(entry.meta).length > 0 && (
          <code className="inline-block text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded px-1.5 py-0.5 mt-1 font-mono break-all max-w-full">
            {JSON.stringify(entry.meta)}
          </code>
        )}
      </div>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
        {formatTimestamp(entry.timestamp)}
      </span>
    </div>
  );
}

interface EventLogProps {
  entries: LogEntry[];
  maxHeight?: string;
}

export function EventLog({ entries, maxHeight = 'max-h-72' }: EventLogProps) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">No events yet</p>
    );
  }
  return (
    <div className={cn('overflow-y-auto', maxHeight)}>
      {entries.map((e) => (
        <LogRow key={e.id} entry={e} />
      ))}
    </div>
  );
}
