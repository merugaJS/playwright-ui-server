import { useState, useCallback } from 'react';
import { useConfig } from '../../api/hooks.js';
import { saveConfig } from '../../api/mutations.js';
import { useQueryClient } from '@tanstack/react-query';
import { showToast } from '../ui/Toast.js';

interface EditableConfig {
  testDir: string;
  baseURL: string;
  timeout: string;
  retries: string;
  workers: string;
  outputDir: string;
}

export function ConfigEditor({ onClose }: { onClose: () => void }) {
  const { data: configResponse, isLoading } = useConfig();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableConfig | null>(null);

  // Initialize form from config data
  const config = configResponse?.config;
  if (config && !form) {
    setForm({
      testDir: config.testDir ?? './tests',
      baseURL: config.baseURL ?? '',
      timeout: config.timeout !== undefined ? String(config.timeout) : '',
      retries: config.retries !== undefined ? String(config.retries) : '',
      workers: config.workers !== undefined ? String(config.workers) : '',
      outputDir: config.outputDir ?? '',
    });
  }

  const handleChange = useCallback((field: keyof EditableConfig, value: string) => {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form || !config) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        testDir: form.testDir || undefined,
        baseURL: form.baseURL || undefined,
        outputDir: form.outputDir || undefined,
      };
      if (form.timeout) updates.timeout = parseInt(form.timeout, 10);
      if (form.retries) updates.retries = parseInt(form.retries, 10);
      if (form.workers) {
        const num = parseInt(form.workers, 10);
        updates.workers = isNaN(num) ? form.workers : num;
      }

      await saveConfig(updates as any);
      queryClient.invalidateQueries({ queryKey: ['config'] });
      showToast('Config saved. Backup created.', 'success');
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [form, config, queryClient]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500 text-sm">Loading config...</p>
      </div>
    );
  }

  if (!configResponse?.configPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-400 text-sm mb-2">No Playwright config file found</p>
          <button onClick={onClose} className="text-blue-400 text-sm hover:text-blue-300">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-700 px-4 h-10 flex items-center shrink-0">
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm mr-3">&larr;</button>
        <span className="text-zinc-300 text-sm font-medium">Playwright Config</span>
        <span className="text-zinc-600 text-xs ml-2">{configResponse.configPath}</span>
        <div className="ml-auto">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-5">
          <Field label="Test Directory" value={form?.testDir ?? ''} onChange={(v) => handleChange('testDir', v)} placeholder="./tests" />
          <Field label="Base URL" value={form?.baseURL ?? ''} onChange={(v) => handleChange('baseURL', v)} placeholder="http://localhost:3000" />
          <Field label="Timeout (ms)" value={form?.timeout ?? ''} onChange={(v) => handleChange('timeout', v)} placeholder="30000" type="number" />
          <Field label="Retries" value={form?.retries ?? ''} onChange={(v) => handleChange('retries', v)} placeholder="0" type="number" />
          <Field label="Workers" value={form?.workers ?? ''} onChange={(v) => handleChange('workers', v)} placeholder="e.g. 4 or 50%" />
          <Field label="Output Directory" value={form?.outputDir ?? ''} onChange={(v) => handleChange('outputDir', v)} placeholder="test-results" />

          {/* Projects (read-only display) */}
          {config?.projects && config.projects.length > 0 && (
            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-2">Projects</label>
              <div className="space-y-1">
                {config.projects.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5">
                    <span className="text-zinc-300 text-sm font-mono">{p.name}</span>
                    {p.testDir && <span className="text-zinc-600 text-xs">dir: {p.testDir}</span>}
                  </div>
                ))}
              </div>
              <p className="text-zinc-600 text-[10px] mt-1">Projects are read-only. Edit playwright.config.ts directly for project changes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-zinc-400 text-xs font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}
