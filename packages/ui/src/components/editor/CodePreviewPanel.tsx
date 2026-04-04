import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useFlowStore } from '../../stores/flowStore.js';
import { generateTestCode } from '../../utils/generateCode.js';

// Keywords to highlight in the generated TypeScript code
const KEYWORDS = new Set([
  'import', 'from', 'export', 'const', 'let', 'var', 'async', 'await',
  'function', 'return', 'if', 'else', 'for', 'of', 'in', 'while',
  'test', 'expect', 'describe', 'beforeEach', 'afterEach',
]);

interface CodePreviewPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Applies basic syntax highlighting to a line of TypeScript code.
 * Returns an array of React elements with appropriate coloring.
 */
function highlightLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let i = 0;

  while (i < line.length) {
    // Comments: // ...
    if (line[i] === '/' && line[i + 1] === '/') {
      parts.push(
        <span key={i} className="text-zinc-500 italic">{line.slice(i)}</span>
      );
      return parts;
    }

    // Strings: single-quoted
    if (line[i] === "'") {
      let end = i + 1;
      while (end < line.length && line[end] !== "'") {
        if (line[end] === '\\') end++; // skip escaped chars
        end++;
      }
      end++; // include closing quote
      parts.push(
        <span key={i} className="text-amber-400">{line.slice(i, end)}</span>
      );
      i = end;
      continue;
    }

    // Strings: backtick
    if (line[i] === '`') {
      let end = i + 1;
      while (end < line.length && line[end] !== '`') {
        if (line[end] === '\\') end++;
        end++;
      }
      end++;
      parts.push(
        <span key={i} className="text-amber-400">{line.slice(i, end)}</span>
      );
      i = end;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s,(=:]/.test(line[i - 1]))) {
      let end = i;
      while (end < line.length && /[\d.]/.test(line[end])) end++;
      parts.push(
        <span key={i} className="text-purple-400">{line.slice(i, end)}</span>
      );
      i = end;
      continue;
    }

    // Words: check if keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let end = i;
      while (end < line.length && /[a-zA-Z0-9_$.]/.test(line[end])) end++;
      const word = line.slice(i, end);

      // Check for compound keywords like "test.describe"
      const baseParts = word.split('.');
      const isKeyword = baseParts.some(p => KEYWORDS.has(p));

      if (isKeyword) {
        parts.push(
          <span key={i} className="text-blue-400 font-medium">{word}</span>
        );
      } else {
        parts.push(<span key={i}>{word}</span>);
      }
      i = end;
      continue;
    }

    // Operators and punctuation
    parts.push(<span key={i}>{line[i]}</span>);
    i++;
  }

  return parts;
}

export function CodePreviewPanel({ isOpen, onToggle }: CodePreviewPanelProps) {
  const getTestFlowForSave = useFlowStore((s) => s.getTestFlowForSave);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const testFlow = useFlowStore((s) => s.testFlow);
  const activeTestIndex = useFlowStore((s) => s.activeTestIndex);
  const [copied, setCopied] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const codeRef = useRef<HTMLPreElement>(null);

  // Generate code from the current flow state with 300ms debounce.
  // Recompute when nodes, edges, testFlow, or activeTestIndex change.
  useEffect(() => {
    const timer = setTimeout(() => {
      const flow = getTestFlowForSave();
      if (!flow) {
        setGeneratedCode('// No test flow loaded');
        return;
      }
      setGeneratedCode(generateTestCode(flow));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, testFlow, activeTestIndex, getTestFlowForSave]);

  const codeLines = useMemo(() => generatedCode.split('\n'), [generatedCode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
    } catch {
      // Fallback
      const area = document.createElement('textarea');
      area.value = generatedCode;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      setCopied(true);
    }
  }, [generatedCode]);

  // Reset "copied" state after 2 seconds
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!isOpen) return null;

  return (
    <div className="border-t border-zinc-700 bg-zinc-900 flex flex-col shrink-0" style={{ height: '256px' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs font-mono">&lt;/&gt;</span>
          <span className="text-zinc-400 text-xs font-medium">Code Preview</span>
          <span className="text-zinc-600 text-[10px]">{codeLines.length} lines</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 text-[10px] rounded transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            title="Copy code to clipboard"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onToggle}
            className="px-1.5 py-0.5 text-xs rounded transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            title="Close code preview"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto">
        <pre
          ref={codeRef}
          className="text-xs leading-5 text-zinc-300 p-3 min-w-0"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', tabSize: 2 }}
        >
          <table className="border-collapse">
            <tbody>
              {codeLines.map((line, idx) => (
                <tr key={idx} className="hover:bg-zinc-800/50">
                  <td className="text-zinc-600 text-right pr-4 select-none align-top w-8" style={{ minWidth: '2rem' }}>
                    {idx + 1}
                  </td>
                  <td className="whitespace-pre">
                    {highlightLine(line)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </pre>
      </div>
    </div>
  );
}
