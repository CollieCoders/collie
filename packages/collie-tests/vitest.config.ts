/**
 * Vitest configuration for collie-tests.
 *
 * ⚠️ This file intentionally avoids legacy Vitest options.
 * Codex/Copilot/Roo Code/Claude/automation MUST NOT reintroduce 
 * `poolOptions` or replace `sequence.concurrent = false`.
 *
 * Compatible with Vitest 4.x only.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/smoke.test.ts', 'src/tests/cli/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    isolate: true,
    pool: 'forks', // IMPORTANT: Do NOT add poolOptions. It is not supported by vitest 4+
    sequence: { concurrent: false } // Do NOT change, remove, or replace this
  }
});
