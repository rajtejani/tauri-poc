import React from 'react';
import { Monitor, Smartphone, Tablet, HelpCircle, Wifi } from 'lucide-react';
import type { Device } from '../../shared/types';
import { cn } from '../lib/utils';
import { formatTimestamp } from '../../shared/utils';

const deviceIcons = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
};

interface DeviceCardProps {
  device: Device;
}

export function DeviceCard({ device }: DeviceCardProps) {
  const Icon = deviceIcons[device.type] ?? HelpCircle;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all px-4 py-3">
      <div
        className={cn(
          'rounded-lg p-2',
          device.connected
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-slate-100 text-slate-400'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{device.name}</p>
        <p className="text-xs text-slate-400 capitalize">{device.type}</p>
      </div>
      <div className="flex items-center gap-2">
        {device.connected && (
          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <span className="text-xs text-slate-400">
          {formatTimestamp(device.lastSeen)}
        </span>
      </div>
    </div>
  );
}

interface DeviceListProps {
  devices: Device[];
  emptyLabel?: string;
}

export function DeviceList({ devices, emptyLabel = 'No devices connected' }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <Wifi className="h-8 w-8 mb-2 text-slate-300 opacity-80" />
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {devices.map((d) => (
        <DeviceCard key={d.id} device={d} />
      ))}
    </div>
  );
}
