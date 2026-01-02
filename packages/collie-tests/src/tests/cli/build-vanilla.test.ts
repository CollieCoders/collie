import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';
import fs from 'fs-extra';

const assertCliSuccess = (result: Awaited<ReturnType<typeof runCollieCli>>, label: string) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `[${label}] collie exited with code ${result.exitCode}. Entry ${result.resolvedEntryPath} (${result.resolvedFrom}).\nstdout:\n${result.normalizedStdout}\n\nstderr:\n${result.normalizedStderr}`
    );
  }
};

describe('collie CLI build - vanilla project', () => {
  it('generates output from the vanilla fixture', async () => {
    const project = await createTempProject({ fixtureName: 'vanilla-basic' });

    const result = await runCollieCli(['build', 'src', '--outDir', 'dist', '--quiet'], {
      cwd: project.rootDir
    });
    assertCliSuccess(result, 'build vanilla');

    const outputFile = project.path('dist/components/Welcome.tsx');
    const exists = await fs.pathExists(outputFile);
    expect(exists).toBe(true);

    const contents = await fs.readFile(outputFile, 'utf8');
    expect(contents).toMatch(/export/);
    expect(contents).toMatch(/Hello/i);
  });
});
