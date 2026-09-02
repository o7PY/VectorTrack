import { useStore } from '../store/useStore';

export function ModeTabs() {
  const mode = useStore((s) => s.mode);
  const selectMode = useStore((s) => s.selectMode);

  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-800">
      {(['line', 'maze'] as const).map((m) => (
        <button
          key={m}
          onClick={() => selectMode(m)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === m ? 'bg-sky-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
          }`}
        >
          {m === 'line' ? 'Line Follower' : 'Maze Solver'}
        </button>
      ))}
    </div>
  );
}
