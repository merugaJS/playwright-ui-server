import { useRef, useEffect, useCallback } from 'react';
import type { UseNodeSearchResult } from '../../hooks/useNodeSearch.js';

interface SearchOverlayProps {
  search: UseNodeSearchResult;
  onClose: () => void;
}

/**
 * Search bar overlay displayed at the top of the flow editor canvas.
 * Allows users to search for nodes by type, description, locator, etc.
 * Supports cycling through results with Enter/Shift+Enter and arrow keys.
 */
export function SearchOverlay({ search, onClose }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when the overlay appears
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        search.nextMatch();
        return;
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        search.prevMatch();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        search.nextMatch();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        search.prevMatch();
        return;
      }
    },
    [search, onClose],
  );

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 backdrop-blur-sm">
      {/* Search icon */}
      <svg
        className="w-3.5 h-3.5 text-zinc-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search nodes..."
        className="bg-transparent border-none outline-none text-xs text-zinc-300 placeholder-zinc-600 w-48"
      />

      {/* Result count */}
      {search.isSearching && (
        <span className="text-zinc-500 text-[10px] whitespace-nowrap shrink-0">
          {search.matchCount > 0
            ? `${search.currentMatchIndex + 1} of ${search.matchCount}`
            : 'No matches'}
        </span>
      )}

      {/* Prev / Next buttons */}
      {search.isSearching && search.matchCount > 0 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={search.prevMatch}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800"
            title="Previous match (Shift+Enter)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={search.nextMatch}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800"
            title="Next match (Enter)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800"
        title="Close (Escape)"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
