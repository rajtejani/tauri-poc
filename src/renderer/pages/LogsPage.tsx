import React from 'react';
import { Activity } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { EventLog } from '../components/EventLog';

export function LogsPage() {
  const { logs } = useAppStore();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Event Log
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {logs.length} events recorded this session
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <EventLog entries={logs} maxHeight="max-h-[calc(100vh-240px)]" />
        </div>
      </div>
    </div>
  );
}
