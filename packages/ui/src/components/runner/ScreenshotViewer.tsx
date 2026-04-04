import { useState } from 'react';

interface ScreenshotViewerProps {
  screenshots: string[];
  traceFile?: string;
  onViewTrace?: (tracePath: string) => void;
}

/**
 * Displays failure screenshot thumbnails with click-to-expand modal.
 * Also shows a "View Trace" button if a trace file is available.
 */
export function ScreenshotViewer({ screenshots, traceFile, onViewTrace }: ScreenshotViewerProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  if (screenshots.length === 0 && !traceFile) return null;

  const handleImageError = (screenshotPath: string) => {
    setImageErrors((prev) => new Set(prev).add(screenshotPath));
  };

  return (
    <div className="mt-2 space-y-2">
      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div>
          <p className="text-zinc-500 text-[10px] font-semibold mb-1">Failure Screenshots</p>
          <div className="flex flex-wrap gap-2">
            {screenshots.map((screenshotPath) => (
              <ScreenshotThumbnail
                key={screenshotPath}
                screenshotPath={screenshotPath}
                hasError={imageErrors.has(screenshotPath)}
                onImageError={() => handleImageError(screenshotPath)}
                onClick={() => setExpandedImage(screenshotPath)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Trace viewer button */}
      {traceFile && (
        <div>
          <button
            onClick={() => onViewTrace?.(traceFile)}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] bg-purple-900/30 hover:bg-purple-900/50 border border-purple-800/40 text-purple-300 rounded transition-colors"
          >
            <span>&#9654;</span>
            View Trace
          </button>
          <span className="text-zinc-600 text-[10px] ml-2">{traceFile}</span>
        </div>
      )}

      {/* Fullscreen modal */}
      {expandedImage && (
        <ScreenshotModal
          screenshotPath={expandedImage}
          onClose={() => setExpandedImage(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function ScreenshotThumbnail({
  screenshotPath,
  hasError,
  onImageError,
  onClick,
}: {
  screenshotPath: string;
  hasError: boolean;
  onImageError: () => void;
  onClick: () => void;
}) {
  const imageUrl = `/api/artifacts/screenshot?path=${encodeURIComponent(screenshotPath)}`;
  const fileName = screenshotPath.split('/').pop() ?? screenshotPath;

  if (hasError) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-32 h-20 bg-zinc-800 border border-zinc-700 rounded flex items-center justify-center">
          <span className="text-zinc-600 text-[10px] text-center px-1">
            Screenshot not found
          </span>
        </div>
        <span className="text-zinc-600 text-[10px] truncate max-w-[128px] mt-0.5" title={screenshotPath}>
          {fileName}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={onClick}
        className="w-32 h-20 bg-zinc-800 border border-zinc-700 rounded overflow-hidden hover:border-zinc-500 transition-colors cursor-pointer"
        title="Click to view full size"
      >
        <img
          src={imageUrl}
          alt={`Failure screenshot: ${fileName}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={onImageError}
        />
      </button>
      <span className="text-zinc-600 text-[10px] truncate max-w-[128px] mt-0.5" title={screenshotPath}>
        {fileName}
      </span>
    </div>
  );
}

function ScreenshotModal({
  screenshotPath,
  onClose,
}: {
  screenshotPath: string;
  onClose: () => void;
}) {
  const imageUrl = `/api/artifacts/screenshot?path=${encodeURIComponent(screenshotPath)}`;
  const fileName = screenshotPath.split('/').pop() ?? screenshotPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-7 h-7 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors z-10"
          title="Close"
        >
          &#x2715;
        </button>

        {/* Full-size image */}
        <img
          src={imageUrl}
          alt={`Failure screenshot: ${fileName}`}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded border border-zinc-700"
        />

        {/* File path */}
        <p className="text-zinc-400 text-xs mt-2 max-w-[90vw] truncate">{screenshotPath}</p>
      </div>
    </div>
  );
}
