import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Monitor,
  Activity,
  Wifi,
  Layers,
  Printer,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/appStore';
import { StatusBadge } from './StatusBadge';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, end: false },
  { to: '/devices', label: 'Devices', icon: Monitor, end: false },
  { to: '/printers', label: 'Printers', icon: Printer, end: false },
  { to: '/logs', label: 'Event Log', icon: Activity, end: false },
];

export function Sidebar() {
  const { serverRunning, serverIp, serverPort, connectedDevices } = useAppStore();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-surface-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-surface-card">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Offline Hub</p>
          <p className="text-xs text-slate-500">Primary Device</p>
        </div>
      </div>

      {/* Status pill */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="rounded-lg bg-surface-muted px-3 py-2.5 space-y-1.5 border border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Server</span>
            <StatusBadge active={serverRunning} size="sm" />
          </div>
          {serverRunning && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Wifi className="h-3 w-3 text-slate-400" />
              <span className="font-mono">
                {serverIp}:{serverPort}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Devices</span>
            <span className="text-xs font-medium text-slate-800">
              {connectedDevices.length}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-slate-600 hover:bg-surface-muted hover:text-slate-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-4 w-4', isActive ? 'text-primary' : '')}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200">
        <p className="text-xs text-slate-400 text-center">v1.0.0 POC</p>
      </div>
    </aside>
  );
}
