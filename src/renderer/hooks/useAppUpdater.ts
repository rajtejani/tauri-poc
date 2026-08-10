import { useCallback, useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'error';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DISMISS_KEY = (version: string) => `update-toast-dismissed:${version}`;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isPreviewMode(): boolean {
  if (import.meta.env.VITE_PREVIEW_UPDATE_TOAST === 'true') return true;
  try {
    return new URLSearchParams(window.location.search).has('previewUpdateToast');
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function useAppUpdater() {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const preview = isPreviewMode();

  useEffect(() => {
    if (preview) {
      setVersion('dev-preview');
      setPhase('available');
      return;
    }

    if (!isTauriRuntime()) return;

    let cancelled = false;

    const runCheck = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;
        if (sessionStorage.getItem(DISMISS_KEY(update.version))) return;

        updateRef.current = update;
        setVersion(update.version);
        setError(null);
        setPhase('available');
      } catch (err) {
        console.debug('[updater] check skipped:', err);
      }
    };

    void runCheck();
    const timer = window.setInterval(() => void runCheck(), CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview]);

  const dismiss = useCallback(() => {
    if (version) sessionStorage.setItem(DISMISS_KEY(version), '1');
    setPhase('idle');
    setError(null);
  }, [version]);

  const install = useCallback(async () => {
    setError(null);

    if (preview || !updateRef.current) {
      setPhase('downloading');
      for (let pct = 10; pct <= 100; pct += 10) {
        setProgress(pct);
        await sleep(70);
      }
      setPhase('installing');
      await sleep(400);
      setProgress(0);
      setPhase('available');
      return;
    }

    try {
      setPhase('downloading');
      setProgress(0);
      let downloaded = 0;
      let total = 0;

      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
          setPhase('installing');
        }
      });

      setPhase('restarting');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[updater] install failed:', err);
      setError(message);
      setPhase('error');
      setProgress(0);
    }
  }, [preview]);

  return { phase, version, progress, error, preview, dismiss, install };
}
