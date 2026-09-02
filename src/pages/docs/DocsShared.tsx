import type { ReactNode } from 'react';

export function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-20 border-b border-neutral-800 pb-3 pt-14 first:pt-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-sky-500">{eyebrow}</span>
      <h2 className="mt-1 text-2xl font-bold text-neutral-50">{title}</h2>
    </div>
  );
}

export function SubSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 pt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-3 flex flex-col gap-4 text-[15px] leading-relaxed text-neutral-300">{children}</div>
    </div>
  );
}

export function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
      {title && (
        <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[11px] text-neutral-500">{title}</div>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed text-sky-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="inline-block max-w-full self-start overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
      <img src={src} alt={alt} className="block max-w-full" loading="lazy" />
      <figcaption className="border-t border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-500">{caption}</figcaption>
    </figure>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-800">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/60">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold text-neutral-300">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-neutral-900 last:border-0 even:bg-neutral-900/30">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-neutral-400">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
