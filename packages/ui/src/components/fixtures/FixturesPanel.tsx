import { useFixtures } from '../../api/hooks.js';

export function FixturesPanel({ collapsed = false }: { collapsed?: boolean }) {
  const { data, isLoading } = useFixtures();

  if (isLoading || !data) {
    return null;
  }

  if (collapsed) {
    return null;
  }

  const { builtIn, custom } = data;

  return (
    <div className="mt-2">
      {/* Custom fixtures */}
      {custom.length > 0 && (
        <div className="mb-3">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Custom</p>
          <div className="space-y-0.5">
            {custom.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 px-2 py-1 rounded text-xs"
              >
                <span className="text-green-400">⚡</span>
                <span className="text-zinc-300 font-mono">{f.name}</span>
                <span className="text-zinc-600 text-[10px] ml-auto truncate max-w-[80px]">
                  {f.filePath}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in fixtures */}
      <div>
        <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Built-in</p>
        <div className="flex flex-wrap gap-1">
          {builtIn.map((f) => (
            <span
              key={f.name}
              className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 text-[10px] font-mono"
              title={f.type}
            >
              {f.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
