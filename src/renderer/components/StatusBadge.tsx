import React from 'react';
import { cn } from '../lib/utils';

interface StatusBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  active,
  activeLabel = 'Online',
  inactiveLabel = 'Offline',
  size = 'md',
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        active
          ? 'bg-primary-light text-primary border border-primary/25'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full',
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          active ? 'bg-primary animate-pulse' : 'bg-slate-400'
        )}
      />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
