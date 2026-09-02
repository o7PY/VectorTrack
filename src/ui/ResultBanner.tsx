import { useStore } from '../store/useStore';

export function ResultBanner() {
  const status = useStore((s) => s.status);
  const dismissed = useStore((s) => s.resultBannerDismissed);
  const dismiss = useStore((s) => s.dismissResultBanner);

  if (dismissed) return null;
  if (status.outcome !== 'success' && status.outcome !== 'failed') return null;

  const success = status.outcome === 'success';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2 shadow-lg backdrop-blur ${
          success ? 'border-emerald-700 bg-emerald-950/80 text-emerald-200' : 'border-rose-700 bg-rose-950/80 text-rose-200'
        }`}
      >
        <span className="text-sm font-semibold">{success ? 'Success' : 'Failed'}</span>
        <span className="text-sm">{success ? `${(status.elapsedMs / 1000).toFixed(2)}s` : status.reason}</span>
        <button onClick={dismiss} className="ml-1 text-sm opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}
