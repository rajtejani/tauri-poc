import React from 'react';
import {
  Server,
  Database,
  Monitor,
  RefreshCw,
  Wifi,
  Activity,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { EventLog } from '../components/EventLog';
import { TaskList } from '../components/TaskList';
import { DeviceList } from '../components/DeviceCard';

export function DashboardPage() {
  const {
    serverRunning,
    serverPort,
    serverIp,
    dbConnected,
    connectedDevices,
    pendingSyncCount,
    logs,
    totalCount,
    isLoading,
  } = useAppStore();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Initializing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">System Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Offline-first hub — LAN sync active
            </p>
          </div>
          <StatusBadge active={serverRunning} activeLabel="Operational" inactiveLabel="Starting..." />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title="Server"
            value={serverRunning ? 'Running' : 'Stopped'}
            subtitle={serverRunning ? `Port ${serverPort}` : 'Waiting to start'}
            icon={Server}
            accent={serverRunning ? 'emerald' : 'rose'}
            badge={<StatusBadge active={serverRunning} size="sm" />}
          />
          <StatCard
            title="SQLite"
            value={dbConnected ? 'Connected' : 'Offline'}
            subtitle="Local database"
            icon={Database}
            accent={dbConnected ? 'emerald' : 'rose'}
            badge={<StatusBadge active={dbConnected} size="sm" />}
          />
          <StatCard
            title="Connected"
            value={connectedDevices.length}
            subtitle="Devices on LAN"
            icon={Monitor}
            accent="blue"
          />
          <StatCard
            title="Pending Sync"
            value={pendingSyncCount}
            subtitle="Unsynced tasks"
            icon={RefreshCw}
            accent={pendingSyncCount > 0 ? 'amber' : 'slate'}
          />
          <StatCard
            title="IP Address"
            value={serverRunning ? serverIp : '—'}
            subtitle={serverRunning ? `Port ${serverPort}` : 'Server offline'}
            icon={Wifi}
            accent="blue"
          />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Tasks panel */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-slate-800">Tasks</h2>
              <span className="ml-auto text-xs text-slate-400">
                {totalCount.toLocaleString()} total
              </span>
            </div>
            <TaskList />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Connected devices */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Monitor className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-slate-800">Connected Devices</h2>
              </div>
              <DeviceList devices={connectedDevices} />
            </div>

            {/* Event log */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-slate-800">Recent Events</h2>
                <span className="ml-auto text-xs text-slate-400">{logs.length}</span>
              </div>
              <EventLog entries={logs.slice(0, 20)} maxHeight="max-h-64" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
