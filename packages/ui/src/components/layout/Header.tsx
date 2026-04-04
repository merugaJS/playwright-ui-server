export function Header() {
  return (
    <header className="h-14 bg-zinc-900 border-b border-zinc-700 flex items-center px-5 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🎭</span>
        <h1 className="text-white font-semibold text-lg">Playwright UI Server</h1>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-zinc-400 text-sm">v0.1.0</span>
      </div>
    </header>
  );
}
