import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';

describe('collie CLI invalid syntax handling', () => {
  it('reports syntax failures for malformed fixtures', async () => {
    const project = await createTempProject({ fixtureName: 'invalid-syntax' });
    const fixturePath = 'src/invalid.collie';

    expect(await project.exists(fixturePath)).toBe(true);

    const result = await runCollieCli(['check', fixturePath, '--format', 'text'], {
      cwd: project.rootDir
    });

    const combined = [result.normalizedStdout, result.normalizedStderr].join('\n');

    if (result.exitCode === 0) {
      const tree = await project.tree(5);
      const sections = [
        'Expected collie check to fail but exit code was 0.',
        `CLI entry: ${result.resolvedEntryPath} (resolved from: ${result.resolvedFrom})`,
        '--- stdout ---',
        result.normalizedStdout || '<empty>',
        '--- stderr ---',
        result.normalizedStderr || '<empty>',
        '--- combined ---',
        combined || '<empty>',
        '--- project tree ---',
        tree
      ];
      throw new Error(sections.join('\n'));
    }

    expect(result.exitCode).not.toBe(0);
    expect(combined).toMatch(/invalid(\.collie)?/i);
    expect(combined).toMatch(/(error|failed|unexpected)/i);
  });
});
