import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocatorSuggestions, type LocatorSuggestion } from '../../hooks/useLocatorSuggestions.js';

interface LocatorAutocompleteProps {
  /** Current input value */
  value: string;
  /** Called when the text input changes */
  onChange: (value: string) => void;
  /** Called when a suggestion is selected */
  onSelect: (suggestion: LocatorSuggestion) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional CSS classes for the wrapper */
  className?: string;
}

/**
 * Autocomplete input that suggests locators from page objects.
 * Supports keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 */
export function LocatorAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search locators...',
  className = '',
}: LocatorAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { suggestions, isLoading } = useLocatorSuggestions(value);

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || !isOpen) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const wrapper = inputRef.current?.parentElement;
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = useCallback(
    (suggestion: LocatorSuggestion) => {
      onSelect(suggestion);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (suggestions[highlightedIndex]) {
            selectSuggestion(suggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, suggestions, highlightedIndex, selectSuggestion],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const showDropdown = isOpen && (suggestions.length > 0 || isLoading);

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls="locator-suggestions-list"
      />

      {showDropdown && (
        <ul
          ref={listRef}
          id="locator-suggestions-list"
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl"
        >
          {isLoading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-zinc-500 text-xs">Loading locators...</li>
          )}
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.pageObjectId}-${suggestion.name}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={`px-3 py-2 cursor-pointer text-xs transition-colors ${
                index === highlightedIndex
                  ? 'bg-blue-600/20 text-zinc-200'
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(e) => {
                // Prevent input blur before selection fires
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-200 truncate">
                  {suggestion.name}
                </span>
                <span className="text-zinc-600 text-[10px] shrink-0">
                  {suggestion.pageObject}
                </span>
              </div>
              <div className="text-zinc-500 text-[10px] font-mono mt-0.5 truncate">
                {suggestion.selector}
              </div>
            </li>
          ))}
          {!isLoading && suggestions.length === 0 && value.trim() && (
            <li className="px-3 py-2 text-zinc-500 text-xs">No matching locators</li>
          )}
        </ul>
      )}
    </div>
  );
}
