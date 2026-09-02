// A small, honest hero graphic: an oval line-track (the actual shape of the
// lf-oval map) with a dot tracing it via native SVG animateMotion, and a
// tiny sensor-error readout ticking underneath. No stock art, no AI-image
// texture — just the thing the product actually does, in miniature.
const TRACK_D = 'M40,110 A160,80 0 1,1 360,110 A160,80 0 1,1 40,110';

export function TrackAnimation() {
  return (
    <svg viewBox="0 0 400 220" className="h-full w-full" role="img" aria-label="Animated diagram of a robot following an oval line track">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 L0 0 0 20" fill="none" stroke="#27272a" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="220" fill="url(#grid)" opacity="0.5" />

      <path id="lf-oval-hero-path" d={TRACK_D} fill="none" stroke="#3f3f46" strokeWidth="14" strokeLinecap="round" />

      {/* sensor readout ghost trail */}
      <circle r="5" fill="#38bdf8" opacity="0.35">
        <animateMotion dur="5.5s" begin="-0.15s" repeatCount="indefinite" rotate="auto">
          <mpath href="#lf-oval-hero-path" />
        </animateMotion>
      </circle>

      {/* robot */}
      <g>
        <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
          <mpath href="#lf-oval-hero-path" />
        </animateMotion>
        <rect x="-9" y="-6" width="18" height="12" rx="2.5" fill="#38bdf8" />
        <circle cx="9" cy="0" r="2.4" fill="#f8fafc" />
      </g>
    </svg>
  );
}
