import React from 'react';
import { Gift } from 'lucide-react';
import { useAppUpdater, type UpdatePhase } from '../hooks/useAppUpdater';

function statusMessage(phase: UpdatePhase, progress: number, error: string | null): string {
  switch (phase) {
    case 'downloading':
      return progress > 0 ? `Downloading update… ${progress}%` : 'Downloading update…';
    case 'installing':
      return 'Installing update…';
    case 'restarting':
      return 'Restarting…';
    case 'error':
      return error || 'Update failed';
    default:
      return 'New update available';
  }
}

export function UpdateToast() {
  const { phase, version, progress, error, dismiss, install } = useAppUpdater();

  if (phase === 'idle') return null;

  const busy = phase === 'downloading' || phase === 'installing' || phase === 'restarting';
  const message = statusMessage(phase, progress, error);

  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[200]">
      <div
        className="pointer-events-auto flex items-center gap-5 rounded-[14px] bg-primary py-2.5 pl-3.5 pr-2.5 text-[13px] text-surface-card shadow-[0_10px_32px_rgba(15,77,56,0.35)] animate-slide-up"
        role="status"
        aria-live="polite"
        title={version ? `Version ${version}` : undefined}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Gift className="h-[18px] w-[18px] shrink-0 text-surface-card" strokeWidth={1.75} />
          <span className="whitespace-nowrap tracking-[-0.01em]">{message}</span>
        </div>

        {!busy && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md px-2.5 py-1.5 text-[13px] text-surface-card/90 transition-colors hover:text-surface-card"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-lg bg-surface-card px-3 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary-light active:bg-surface-muted"
            >
              {phase === 'error' ? 'Retry' : 'Install Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
