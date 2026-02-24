import { describe, expect, it, vi } from 'vitest';
import { parseCli } from '../src/cli.js';

// The CLI test is intentionally minimal since Commander is difficult to mock properly.
// The key behavior we're verifying is that the module loads and exports parseCli correctly.

vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

describe('CLI Module', () => {
  describe('parseCli', () => {
    it('should return parsed CLI result with expected shape', () => {
      const result = parseCli();
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('args');
      expect(result).toHaveProperty('globalOpts');
      expect(typeof result.command).toBe('string');
      expect(typeof result.args).toBe('object');
      expect(typeof result.globalOpts).toBe('object');
    });
  });
});
