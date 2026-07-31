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
  emerald: 'from-emerald-50 to-emerald-50/20 border-emerald-100 bg-white',
  blue: 'from-rose-50 to-rose-50/20 border-rose-100 bg-white',
  amber: 'from-amber-50 to-amber-50/20 border-amber-100 bg-white',
  rose: 'from-rose-50 to-rose-50/20 border-rose-100 bg-white',
  slate: 'from-slate-50 to-slate-50/20 border-slate-200 bg-white',
};

const iconBgMap = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-primary/10 text-primary',
  amber: 'bg-amber-50 text-amber-600',
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
        'hover:shadow-md hover:shadow-slate-200/50 hover:-translate-y-0.5',
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
