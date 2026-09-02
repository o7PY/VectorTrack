import { useState } from 'react';
import { useStore } from '../store/useStore';

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const resetAllProgress = useStore((s) => s.resetAllProgress);
  const showSensorOverlay = useStore((s) => s.showSensorOverlay);
  const toggleSensorOverlay = useStore((s) => s.toggleSensorOverlay);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        title="Settings"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-neutral-800 bg-neutral-900 p-2 text-sm shadow-xl">
          <label className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-neutral-800">
            <span className="text-neutral-300">Sensor overlay</span>
            <input type="checkbox" checked={showSensorOverlay} onChange={toggleSensorOverlay} />
          </label>
          <div className="my-1.5 border-t border-neutral-800" />
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded px-1.5 py-1 text-left text-rose-400 hover:bg-rose-950/40"
            >
              Reset all progress…
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded bg-rose-950/30 p-1.5">
              <span className="text-xs text-rose-300">Erase all tuned gains, best times, and completion?</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    resetAllProgress();
                    setConfirming(false);
                    setOpen(false);
                  }}
                  className="flex-1 rounded bg-rose-700 px-1.5 py-1 text-white hover:bg-rose-600"
                >
                  Reset
                </button>
                <button onClick={() => setConfirming(false)} className="flex-1 rounded bg-neutral-800 px-1.5 py-1 text-neutral-300 hover:bg-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
