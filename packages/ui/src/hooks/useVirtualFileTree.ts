import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export interface TestFileInfo {
  id: string;
  filePath: string;
  fileName: string;
  directory: string;
}

export interface FlattenedNode {
  /** Unique key for React */
  key: string;
  type: 'directory' | 'file';
  directory: string;
  /** Present only when type === 'file' */
  file?: TestFileInfo;
  /** Whether the directory node is currently expanded */
  expanded?: boolean;
}

/**
 * Takes an array of test files, groups them by directory, and produces a
 * flattened array of visible nodes (directories + their children when expanded).
 *
 * Returns helpers used by the virtualised FileTree component.
 */
export function useVirtualFileTree(files: TestFileInfo[]) {
  // Track which directories are expanded (all expanded by default)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  // Preserve scroll position across panel switches
  const scrollOffset = useRef(0);

  // Group files by directory
  const groups = useMemo(() => {
    const map = new Map<string, TestFileInfo[]>();
    for (const file of files) {
      const dir = file.directory;
      if (!map.has(dir)) map.set(dir, []);
      map.get(dir)!.push(file);
    }
    return map;
  }, [files]);

  // Build flattened visible-node list
  const flatNodes: FlattenedNode[] = useMemo(() => {
    const nodes: FlattenedNode[] = [];
    for (const [dir, dirFiles] of groups.entries()) {
      const expanded = !collapsedDirs.has(dir);
      nodes.push({
        key: `dir:${dir}`,
        type: 'directory',
        directory: dir,
        expanded,
      });
      if (expanded) {
        for (const file of dirFiles) {
          nodes.push({
            key: `file:${file.id}`,
            type: 'file',
            directory: dir,
            file,
          });
        }
      }
    }
    return nodes;
  }, [groups, collapsedDirs]);

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  // Reset collapsed dirs when the file list changes dramatically
  // (e.g., filter applied that removes all dirs)
  const prevDirCount = useRef(groups.size);
  useEffect(() => {
    if (groups.size !== prevDirCount.current) {
      prevDirCount.current = groups.size;
    }
  }, [groups.size]);

  return {
    flatNodes,
    toggleDir,
    scrollOffset,
  };
}
