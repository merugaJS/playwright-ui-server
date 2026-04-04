import { useState } from 'react';
import type { PlaywrightProjectConfig, ProjectUse } from '../../api/hooks.js';

interface ProjectListProps {
  projects: PlaywrightProjectConfig[];
  onChange: (projects: PlaywrightProjectConfig[]) => void;
}

const BROWSER_OPTIONS = ['chromium', 'firefox', 'webkit'] as const;

export function ProjectList({ projects, onChange }: ProjectListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleUpdate = (index: number, updated: PlaywrightProjectConfig) => {
    const next = [...projects];
    next[index] = updated;
    onChange(next);
  };

  const handleAdd = () => {
    const name = `project-${projects.length + 1}`;
    onChange([...projects, { name, use: { browserName: 'chromium' } }]);
    setExpandedIndex(projects.length);
  };

  const handleRemove = (index: number) => {
    const next = projects.filter((_, i) => i !== index);
    onChange(next);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Projects
        </label>
        <button
          onClick={handleAdd}
          className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
        >
          + Add Project
        </button>
      </div>

      {projects.length === 0 && (
        <p className="text-zinc-500 text-xs py-2">
          No projects configured. Add one to test across multiple browsers.
        </p>
      )}

      <div className="space-y-1">
        {projects.map((project, index) => (
          <ProjectItem
            key={index}
            project={project}
            expanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
            onChange={(updated) => handleUpdate(index, updated)}
            onRemove={() => handleRemove(index)}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectItem({
  project,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  project: PlaywrightProjectConfig;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: PlaywrightProjectConfig) => void;
  onRemove: () => void;
}) {
  const use = project.use ?? {};
  const browserLabel = use.device ?? use.browserName ?? 'default';

  const handleUseChange = (partial: Partial<ProjectUse>) => {
    onChange({ ...project, use: { ...use, ...partial } });
  };

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="text-zinc-500 text-[10px] w-3 shrink-0">
          {expanded ? '\u25BC' : '\u25B6'}
        </button>
        <span className="text-zinc-300 text-sm font-mono flex-1 truncate">{project.name}</span>
        <span className="text-zinc-500 text-xs">{browserLabel}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-1"
          title="Remove project"
        >
          ✕
        </button>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-700/50 space-y-3">
          {/* Name */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Name</label>
            <input
              type="text"
              value={project.name}
              onChange={(e) => onChange({ ...project, name: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Browser */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Browser</label>
            <select
              value={use.browserName ?? ''}
              onChange={(e) => handleUseChange({ browserName: (e.target.value || undefined) as ProjectUse['browserName'] })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">Default</option>
              {BROWSER_OPTIONS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Device */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Device (optional)</label>
            <input
              type="text"
              value={use.device ?? ''}
              onChange={(e) => handleUseChange({ device: e.target.value || undefined })}
              placeholder="e.g., iPhone 13, Pixel 5"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Viewport */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Viewport</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={use.viewport?.width ?? ''}
                onChange={(e) => {
                  const w = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  if (w !== undefined && !isNaN(w)) {
                    handleUseChange({ viewport: { width: w, height: use.viewport?.height ?? 720 } });
                  } else {
                    handleUseChange({ viewport: undefined });
                  }
                }}
                placeholder="Width"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
              />
              <span className="text-zinc-500 self-center">x</span>
              <input
                type="number"
                value={use.viewport?.height ?? ''}
                onChange={(e) => {
                  const h = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  if (h !== undefined && !isNaN(h)) {
                    handleUseChange({ viewport: { width: use.viewport?.width ?? 1280, height: h } });
                  } else {
                    handleUseChange({ viewport: undefined });
                  }
                }}
                placeholder="Height"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Test Dir (project-level) */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Test Dir (optional)</label>
            <input
              type="text"
              value={project.testDir ?? ''}
              onChange={(e) => onChange({ ...project, testDir: e.target.value || undefined })}
              placeholder="e.g., ./tests/mobile"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
