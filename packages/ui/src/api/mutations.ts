import type { TestFlow, PageObject, PlaywrightConfigData, ConfigResponse } from './hooks.js';

export async function saveTestFlow(testId: string, flow: TestFlow): Promise<TestFlow> {
  const res = await fetch(`/api/tests/${testId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flow),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function savePageObject(pageObjectId: string, po: PageObject): Promise<PageObject> {
  const res = await fetch(`/api/page-objects/${pageObjectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(po),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function createPageObject(name: string, directory?: string): Promise<PageObject> {
  const res = await fetch('/api/page-objects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, directory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deletePageObject(pageObjectId: string): Promise<void> {
  const res = await fetch(`/api/page-objects/${pageObjectId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}

export async function deleteTestFile(testId: string): Promise<void> {
  const res = await fetch(`/api/tests/${testId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}

// ─── Config ─────────────────────────────────────────────────────────

export async function saveConfig(config: PlaywrightConfigData): Promise<{ success: boolean; config: PlaywrightConfigData; backupPath: string }> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Test Runner ─────────────────────────────────────────────────────

export interface RunTestParams {
  testFile?: string;
  testName?: string;
  project?: string;
  headed?: boolean;
  workers?: number;
}

export async function runTests(params: RunTestParams): Promise<{ status: string; pid: number }> {
  const res = await fetch('/api/runner/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function stopTests(): Promise<{ status: string }> {
  const res = await fetch('/api/runner/stop', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
