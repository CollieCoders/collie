import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';

describe('collie CLI invalid syntax handling', () => {
  it('reports syntax failures for malformed fixtures', async () => {
    const project = await createTempProject({ fixtureName: 'invalid-syntax' });

    const result = await runCollieCli(
      ['check', 'src/invalid.collie', '--format', 'text'],
      { cwd: project.rootDir }
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.normalizedStderr).toMatch(/invalid/i);
    expect(result.normalizedStderr).toMatch(/error/i);
  });
});
