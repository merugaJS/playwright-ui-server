import { useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useVirtualFileTree } from '../../hooks/useVirtualFileTree.js';
import { FileTreeItem, FILE_TREE_ITEM_HEIGHT } from './FileTreeItem.js';
import type { TestFileInfo } from '../../hooks/useVirtualFileTree.js';
import { useAllRunHistories } from '../../hooks/useRunHistory.js';
import type { TrendStatus } from '../../hooks/useRunHistory.js';

interface FileTreeProps {
  files: TestFileInfo[];
  selectedId: string | null;
  onSelect: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
}

const OVERSCAN = 8;

export function FileTree({ files, selectedId, onSelect, onDelete }: FileTreeProps) {
  const { flatNodes, toggleDir, scrollOffset } = useVirtualFileTree(files);
  const { data: historiesData } = useAllRunHistories();

  // Build a map of testFilePath -> trend for quick lookup
  const trendMap = useMemo<Record<string, TrendStatus>>(() => {
    const map: Record<string, TrendStatus> = {};
    if (historiesData?.histories) {
      for (const h of historiesData.histories) {
        map[h.testFilePath] = h.trend;
      }
    }
    return map;
  }, [historiesData]);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => FILE_TREE_ITEM_HEIGHT,
    overscan: OVERSCAN,
  });

  // Restore scroll position when the component re-mounts (panel switch)
  useEffect(() => {
    if (parentRef.current && scrollOffset.current > 0) {
      parentRef.current.scrollTop = scrollOffset.current;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist scroll position on scroll
  const handleScroll = () => {
    if (parentRef.current) {
      scrollOffset.current = parentRef.current.scrollTop;
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    // Find the currently selected index
    const currentIdx = flatNodes.findIndex(
      (n) => n.type === 'file' && n.file?.id === selectedId
    );

    let nextIdx = currentIdx;
    const direction = e.key === 'ArrowDown' ? 1 : -1;

    // Walk in the desired direction, skipping directory headers
    for (let i = currentIdx + direction; i >= 0 && i < flatNodes.length; i += direction) {
      const node = flatNodes[i];
      if (node.type === 'file' && node.file) {
        nextIdx = i;
        break;
      }
    }

    if (nextIdx !== currentIdx && nextIdx >= 0) {
      const node = flatNodes[nextIdx];
      if (node.file) {
        onSelect(node.file);
        virtualizer.scrollToIndex(nextIdx, { align: 'auto' });
      }
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="max-h-[60vh] overflow-y-auto focus:outline-none"
      role="listbox"
      aria-label="Test files"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const node = flatNodes[virtualRow.index];
          return (
            <div
              key={node.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: FILE_TREE_ITEM_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FileTreeItem
                node={node}
                isSelected={node.type === 'file' && node.file?.id === selectedId}
                onSelect={() => node.file && onSelect(node.file)}
                onDelete={() => node.file && onDelete(node.file)}
                onToggleDir={toggleDir}
                trend={node.type === 'file' && node.file ? trendMap[node.file.filePath] : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
