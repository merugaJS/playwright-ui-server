import { useEffect } from 'react';
import { useFlowStore } from '../stores/flowStore.js';

interface ShortcutCallbacks {
  onSave?: () => void;
  onToggleCodePreview?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Ctrl+S / Cmd+S: Save
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y: Redo
 * - Delete / Backspace: Delete selected node (when not in an input)
 */
export function useKeyboardShortcuts(callbacks: ShortcutCallbacks = {}) {
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const deleteSelectedNodes = useFlowStore((s) => s.deleteSelectedNodes);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);
  const isDirty = useFlowStore((s) => s.isDirty);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Ctrl/Cmd + S: Save
      if (mod && e.key === 's') {
        e.preventDefault();
        if (isDirty && callbacks.onSave) {
          callbacks.onSave();
        }
        return;
      }

      // Ctrl/Cmd + Shift + P: Toggle code preview
      if (mod && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (callbacks.onToggleCodePreview) {
          callbacks.onToggleCodePreview();
        }
        return;
      }

      // Ctrl/Cmd + Z: Undo
      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl+Y: Redo
      if ((mod && e.shiftKey && e.key === 'z') || (mod && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Delete/Backspace: Delete selected nodes (bulk or single, only when not in input)
      if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodeIds.size > 1) {
          e.preventDefault();
          deleteSelectedNodes();
          return;
        }
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteNode, deleteSelectedNodes, selectedNodeId, selectedNodeIds, isDirty, callbacks]);
}
