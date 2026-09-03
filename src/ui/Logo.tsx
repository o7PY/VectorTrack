export default function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      {/* mz-intro's real generated wall layout (see MazeDiagram.tsx), baked to static coordinates */}
      <path
        d="M8 8 L14 8 M8 14 L14 14 M8 8 L8 14 M14 8 L20 8 M14 14 L20 14 M20 8 L26 8 M26 8 L26 14 M26 8 L32 8 M26 14 L32 14 M32 8 L38 8 M32 14 L38 14 M38 8 L44 8 M38 14 L44 14 M44 8 L50 8 M44 14 L50 14 M50 8 L56 8 M56 8 L56 14 M8 14 L8 20 M14 20 L20 20 M20 14 L20 20 M20 20 L26 20 M26 20 L32 20 M32 20 L38 20 M38 20 L44 20 M44 20 L50 20 M56 14 L56 20 M8 20 L8 26 M20 26 L26 26 M32 20 L32 26 M38 26 L44 26 M50 20 L50 26 M56 20 L56 26 M8 32 L14 32 M8 26 L8 32 M14 26 L14 32 M14 32 L20 32 M26 26 L26 32 M32 26 L32 32 M38 26 L38 32 M50 26 L50 32 M56 26 L56 32 M8 32 L8 38 M20 38 L26 38 M26 32 L26 38 M26 38 L32 38 M32 32 L32 38 M38 32 L38 38 M44 32 L44 38 M44 38 L50 38 M50 32 L50 38 M56 32 L56 38 M8 38 L8 44 M14 38 L14 44 M14 44 L20 44 M20 38 L20 44 M26 44 L32 44 M32 44 L38 44 M38 38 L38 44 M38 44 L44 44 M44 44 L50 44 M50 44 L56 44 M56 38 L56 44 M8 44 L8 50 M14 50 L20 50 M20 50 L26 50 M26 44 L26 50 M32 50 L38 50 M38 50 L44 50 M50 44 L50 50 M56 44 L56 50 M8 56 L14 56 M8 50 L8 56 M14 56 L20 56 M20 56 L26 56 M26 56 L32 56 M32 50 L32 56 M32 56 L38 56 M38 56 L44 56 M44 56 L50 56 M50 56 L56 56 M56 50 L56 56"
        fill="none"
        stroke="#334155"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <g transform="skewX(-10)">
        <path
          d="M20 14 L31 47 L42 24 L49 24"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M49 17 L60 24 L49 31 Z" fill="#38bdf8" />
      </g>
    </svg>
  );
}
