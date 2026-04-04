import type { FlattenedNode } from '../../hooks/useVirtualFileTree.js';
import { TrendIndicator } from '../runner/RunHistoryPanel.js';
import type { TrendStatus } from '../../hooks/useRunHistory.js';

/** Fixed height (in px) for every file-tree row. */
export const FILE_TREE_ITEM_HEIGHT = 30;

interface FileTreeItemProps {
  node: FlattenedNode;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleDir: (dir: string) => void;
  trend?: TrendStatus;
}

export function FileTreeItem({
  node,
  isSelected,
  onSelect,
  onDelete,
  onToggleDir,
  trend,
}: FileTreeItemProps) {
  if (node.type === 'directory') {
    return (
      <div
        style={{ height: FILE_TREE_ITEM_HEIGHT }}
        className="flex items-center"
      >
        <button
          onClick={() => onToggleDir(node.directory)}
          className="text-zinc-500 text-xs px-2 py-1 truncate hover:text-zinc-300 transition-colors w-full text-left flex items-center gap-1"
        >
          <span className="text-[10px] w-3 inline-block">
            {node.expanded ? '\u25BC' : '\u25B6'}
          </span>
          {node.directory}/
        </button>
      </div>
    );
  }

  const file = node.file!;
  return (
    <div
      style={{ height: FILE_TREE_ITEM_HEIGHT }}
      className="group/file relative flex items-center"
    >
      <button
        onClick={onSelect}
        className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors truncate pr-7 flex items-center gap-1.5 ${
          isSelected
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <span className="truncate">{file.fileName}</span>
        {trend && trend !== 'unknown' && <TrendIndicator trend={trend} />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-1 opacity-0 group-hover/file:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity text-[10px] p-1 rounded hover:bg-red-900/30"
        title={`Delete ${file.fileName}`}
      >
        &#x2715;
      </button>
    </div>
  );
}
