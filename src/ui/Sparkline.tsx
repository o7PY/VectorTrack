export function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const w = 200;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height / 2 - (v / max) * (height / 2 - 2)).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1={0} y1={height / 2} x2={w} y2={height / 2} stroke="#27272a" strokeWidth={1} />
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
    </svg>
  );
}
