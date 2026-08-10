import React from 'react';
import { Monitor, Wifi } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { DeviceList } from '../components/DeviceCard';

export function DevicesPage() {
  const { connectedDevices } = useAppStore();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Monitor className="h-6 w-6 text-primary" />
              Devices
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {connectedDevices.length} device{connectedDevices.length !== 1 ? 's' : ''} connected via LAN
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary-light px-3 py-1.5 text-primary">
            <Wifi className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">LAN Active</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-surface-card p-5 shadow-sm">
          <DeviceList devices={connectedDevices} emptyLabel="Waiting for devices to connect..." />
        </div>

        {/* Connection info */}
        <ConnectionInfo />
      </div>
    </div>
  );
}

function ConnectionInfo() {
  const { serverIp, serverPort } = useAppStore();

  return (
    <div className="rounded-xl border border-slate-200 bg-surface-card p-5 shadow-sm space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">Client Connection Info</h2>
      <p className="text-xs text-slate-500">
        Other devices connect to this hub using Socket.IO on the following address:
      </p>
      <div className="rounded-lg bg-surface-muted border border-slate-200 px-4 py-3">
        <code className="text-sm text-primary font-mono">
          http://{serverIp}:{serverPort}
        </code>
      </div>
      <p className="text-xs text-slate-400">
        Ensure all devices are on the same LAN. No internet connection required.
      </p>
    </div>
  );
}
