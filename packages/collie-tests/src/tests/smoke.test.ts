import { describe, expect, it } from 'vitest';
import { createTempProject } from '../harness/tempProject.js';
import { runCollieCli } from '../harness/runCli.js';

const assertCliSuccess = (result: Awaited<ReturnType<typeof runCollieCli>>, label: string) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `[${label}] collie exited with code ${result.exitCode}. Entry ${result.resolvedEntryPath} (${result.resolvedFrom}).\nstdout:\n${result.normalizedStdout}\n\nstderr:\n${result.normalizedStderr}`
    );
  }
};

describe('collie CLI smoke', () => {
  it('prints help and lists templates', async () => {
    const project = await createTempProject({ fixtureName: 'vanilla-basic' });

    const helpResult = await runCollieCli(['--help'], { cwd: project.rootDir });
    assertCliSuccess(helpResult, '--help');
    expect(helpResult.normalizedStdout).toMatch(/commands:/i);
    expect(helpResult.normalizedStdout).toMatch(/\bcollie build\b/i);

    const listTemplatesResult = await runCollieCli(['create', '--list-templates'], {
      cwd: project.rootDir
    });
    assertCliSuccess(listTemplatesResult, 'create --list-templates');
    expect(listTemplatesResult.normalizedStdout).toMatch(/available templates/i);
  });
});
