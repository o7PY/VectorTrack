import { useStore } from '../store/useStore';
import { lineAlgorithms, mazeAlgorithms } from '../algorithms/registry';

export function AlgorithmSelect() {
  const mode = useStore((s) => s.mode);
  const algorithmId = useStore((s) => s.algorithmId);
  const selectAlgorithm = useStore((s) => s.selectAlgorithm);
  const algorithms = mode === 'line' ? lineAlgorithms : mazeAlgorithms;

  return (
    <select
      value={algorithmId}
      onChange={(e) => selectAlgorithm(e.target.value)}
      className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
    >
      {algorithms.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
