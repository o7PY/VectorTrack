import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

/**
 * Drives the sim forward once per animation frame via the store's
 * fixed-timestep engine.
 *
 * Skips ticking entirely while the document is hidden (backgrounded tab,
 * minimized window). Browsers throttle requestAnimationFrame heavily for
 * hidden tabs (sometimes to ~1/s or less) — without this guard, the dt
 * clamp below (needed to avoid a "spiral of death" catch-up burst) means a
 * backgrounded run silently crawls in confusing slow motion rather than
 * cleanly pausing, so switching back looks like the sim broke rather than
 * that it waited.
 */
export function useSimulationLoop(): void {
  const rafRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    function frame(t: number): void {
      if (document.hidden) {
        lastRef.current = null;
      } else {
        if (lastRef.current !== null) {
          const dt = Math.min(0.25, (t - lastRef.current) / 1000);
          useStore.getState().tick(dt);
        }
        lastRef.current = t;
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
}
