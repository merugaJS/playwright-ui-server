import { describe, it, expect } from 'vitest';
import { isRunning, stopTests } from '../test-runner.js';

describe('test-runner', () => {
  describe('isRunning', () => {
    it('returns false initially when no tests have been started', () => {
      expect(isRunning()).toBe(false);
    });
  });

  describe('stopTests', () => {
    it('returns false when nothing is running', () => {
      const result = stopTests();
      expect(result).toBe(false);
    });
  });
});
