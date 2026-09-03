/**
 * Small hand-rolled SVG icons for the map editor toolbars. The project has no
 * icon library dependency (see package.json) and these are simple enough
 * (single-color line icons on a 24x24 grid) that adding one wasn't worth it.
 */
type IconProps = { className?: string };

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3l4 4L7 21H3v-4z" />
    </Svg>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 20H8l-6-6 10-10 8 8z" />
      <path d="M6 14l6 6" />
    </Svg>
  );
}

export function LineToolIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="19" r="1.6" />
      <circle cx="19" cy="5" r="1.6" />
      <path d="M6.5 17.5l11-11" />
    </Svg>
  );
}

export function RectangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </Svg>
  );
}

export function EllipseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </Svg>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </Svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </Svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </Svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </Svg>
  );
}

export function ZoomInIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M21 21l-5.5-5.5" />
      <path d="M10 7v6M7 10h6" />
    </Svg>
  );
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M21 21l-5.5-5.5" />
      <path d="M7 10h6" />
    </Svg>
  );
}

export function FitScreenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3H5a2 2 0 0 0-2 2v4" />
      <path d="M15 3h4a2 2 0 0 1 2 2v4" />
      <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
      <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
    </Svg>
  );
}

export function WallIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M3 6v4M21 6v4M3 10h18M3 10v4M9 10v4M15 10v4M3 14h18M3 14v4M21 14v4M3 18h18" />
    </Svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function ShuffleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h4l10 12h4" />
      <path d="M17 6h4v4" />
      <path d="M21 6l-5 5" />
      <path d="M3 18h4l4-4.5" />
    </Svg>
  );
}
