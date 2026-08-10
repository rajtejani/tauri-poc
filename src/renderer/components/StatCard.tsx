import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  accent?: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
  badge?: React.ReactNode;
}

const accentMap = {
  emerald: 'from-primary-light to-surface-card border-primary/20 bg-surface-card',
  blue: 'from-primary-light/70 to-surface-card border-primary/15 bg-surface-card',
  amber: 'from-amber-50 to-surface-card border-amber-100 bg-surface-card',
  rose: 'from-rose-50 to-surface-card border-rose-100 bg-surface-card',
  slate: 'from-slate-50 to-surface-card border-slate-200 bg-surface-card',
};

const iconBgMap = {
  emerald: 'bg-primary-light text-primary',
  blue: 'bg-primary/10 text-primary',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'slate',
  badge,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-gradient-to-br p-5 transition-all duration-200',
        'hover:shadow-md hover:shadow-primary/10 hover:-translate-y-0.5',
        accentMap[accent]
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('rounded-lg p-2.5', iconBgMap[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        {badge}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-600">{title}</p>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-400 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
