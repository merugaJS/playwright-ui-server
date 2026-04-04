import { useState, useEffect, useCallback } from 'react';
import { usePageObject } from '../../api/hooks.js';
import { savePageObject, deletePageObject } from '../../api/mutations.js';
import { useQueryClient } from '@tanstack/react-query';
import type { PageObject, PageObjectLocator, PageObjectMethod } from '../../api/hooks.js';

interface PageObjectEditorProps {
  pageObjectId: string;
  onClose: () => void;
  onDeleted: () => void;
}

const strategyOptions = [
  'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'locator',
];

export function PageObjectEditor({ pageObjectId, onClose, onDeleted }: PageObjectEditorProps) {
  const { data: pageObject, isLoading, error } = usePageObject(pageObjectId);
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<PageObject | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync loaded data into edit state
  useEffect(() => {
    if (pageObject && !editState) {
      setEditState(pageObject);
    }
  }, [pageObject, editState]);

  const isDirty = editState && pageObject
    ? JSON.stringify(editState) !== JSON.stringify(pageObject)
    : false;

  const handleSave = useCallback(async () => {
    if (!editState) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await savePageObject(pageObjectId, editState);
      setEditState(updated);
      queryClient.invalidateQueries({ queryKey: ['pageObjects'] });
      queryClient.setQueryData(['pageObject', pageObjectId], updated);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }, [editState, pageObjectId, queryClient]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this page object? This will remove the file.')) return;
    setDeleting(true);
    try {
      await deletePageObject(pageObjectId);
      queryClient.invalidateQueries({ queryKey: ['pageObjects'] });
      onDeleted();
    } catch (err: any) {
      setSaveError(err.message);
      setDeleting(false);
    }
  }, [pageObjectId, queryClient, onDeleted]);

  // Locator CRUD
  const updateLocator = (index: number, updates: Partial<PageObjectLocator>) => {
    if (!editState) return;
    const locators = [...editState.locators];
    locators[index] = { ...locators[index], ...updates };
    setEditState({ ...editState, locators });
  };

  const addLocator = () => {
    if (!editState) return;
    setEditState({
      ...editState,
      locators: [...editState.locators, { name: 'newLocator', strategy: 'locator', value: '' }],
    });
  };

  const removeLocator = (index: number) => {
    if (!editState) return;
    setEditState({
      ...editState,
      locators: editState.locators.filter((_, i) => i !== index),
    });
  };

  // Method CRUD
  const updateMethod = (index: number, updates: Partial<PageObjectMethod>) => {
    if (!editState) return;
    const methods = [...editState.methods];
    methods[index] = { ...methods[index], ...updates };
    setEditState({ ...editState, methods });
  };

  const addMethod = () => {
    if (!editState) return;
    setEditState({
      ...editState,
      methods: [...editState.methods, { name: 'newMethod', parameters: [], body: '// TODO' }],
    });
  };

  const removeMethod = (index: number) => {
    if (!editState) return;
    setEditState({
      ...editState,
      methods: editState.methods.filter((_, i) => i !== index),
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500 text-sm">Loading page object...</p>
      </div>
    );
  }

  if (error || !editState) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <p className="text-red-400 text-sm">Failed to load page object</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-700 shrink-0">
        <div className="flex items-center px-4 h-10">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-xs mr-3 transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-zinc-300 text-sm font-medium">{editState.name}</span>
          <span className="text-zinc-500 text-xs ml-2">{editState.filePath}</span>

          <div className="ml-auto flex items-center gap-2">
            {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
            {isDirty && <span className="text-amber-500 text-xs">unsaved</span>}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                isDirty
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Class Name */}
        <div className="mb-6">
          <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">Class Name</label>
          <input
            type="text"
            value={editState.name}
            onChange={(e) => setEditState({ ...editState, name: e.target.value })}
            className="w-full max-w-md bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Locators */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-zinc-300 text-sm font-semibold">
              Locators
              <span className="ml-2 text-zinc-500 font-normal text-xs">({editState.locators.length})</span>
            </h3>
            <button
              onClick={addLocator}
              className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors"
            >
              + Add Locator
            </button>
          </div>

          <div className="space-y-3">
            {editState.locators.map((loc, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-xs font-mono">{loc.name}</span>
                  <button
                    onClick={() => removeLocator(i)}
                    className="text-red-500/60 hover:text-red-400 text-xs transition-colors"
                    title="Remove locator"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Name</label>
                    <input
                      type="text"
                      value={loc.name}
                      onChange={(e) => updateLocator(i, { name: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Strategy</label>
                    <select
                      value={loc.strategy}
                      onChange={(e) => updateLocator(i, { strategy: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:border-blue-500"
                    >
                      {strategyOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Value</label>
                  <input
                    type="text"
                    value={loc.value}
                    onChange={(e) => updateLocator(i, { value: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            ))}

            {editState.locators.length === 0 && (
              <p className="text-zinc-600 text-xs text-center py-4">No locators defined yet</p>
            )}
          </div>
        </div>

        {/* Methods */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-zinc-300 text-sm font-semibold">
              Methods
              <span className="ml-2 text-zinc-500 font-normal text-xs">({editState.methods.length})</span>
            </h3>
            <button
              onClick={addMethod}
              className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors"
            >
              + Add Method
            </button>
          </div>

          <div className="space-y-3">
            {editState.methods.map((method, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-xs font-mono">{method.name}()</span>
                  <button
                    onClick={() => removeMethod(i)}
                    className="text-red-500/60 hover:text-red-400 text-xs transition-colors"
                    title="Remove method"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Method Name</label>
                    <input
                      type="text"
                      value={method.name}
                      onChange={(e) => updateMethod(i, { name: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Parameters</label>
                    <input
                      type="text"
                      value={method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}
                      onChange={(e) => {
                        const params = e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
                          const [name, type] = s.split(':').map((p) => p.trim());
                          return { name: name || 'arg', type: type || 'string' };
                        });
                        updateMethod(i, { parameters: params });
                      }}
                      placeholder="email: string, password: string"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-0.5">Body</label>
                  <textarea
                    value={method.body}
                    onChange={(e) => updateMethod(i, { body: e.target.value })}
                    rows={4}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>
              </div>
            ))}

            {editState.methods.length === 0 && (
              <p className="text-zinc-600 text-xs text-center py-4">No methods defined yet</p>
            )}
          </div>
        </div>

        {/* Delete */}
        <div className="border-t border-zinc-800 pt-6">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 text-xs rounded transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete Page Object'}
          </button>
        </div>
      </div>
    </div>
  );
}
