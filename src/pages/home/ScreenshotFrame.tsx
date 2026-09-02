export function ScreenshotFrame({ src, path, caption }: { src: string; path: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/20">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
        <span className="ml-2 truncate rounded bg-neutral-950 px-2 py-0.5 font-mono text-[10px] text-neutral-500">{path}</span>
      </div>
      <img src={src} alt={caption} className="block w-full" loading="lazy" />
      <figcaption className="border-t border-neutral-800 px-3 py-2 text-xs text-neutral-500">{caption}</figcaption>
    </figure>
  );
}
