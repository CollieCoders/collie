import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';

interface DoctorDiagnostic {
  id: string;
  check?: string;
  status?: string;
  [key: string]: unknown;
}

describe('collie CLI doctor --json', () => {
  it('reports only passing/warning diagnostics for the Vite fixture', async () => {
    const project = await createTempProject({ fixtureName: 'doctor-vite-basic' });
    const result = await runCollieCli(['doctor', '--json'], { cwd: project.rootDir });

    if (result.exitCode !== 0) {
      throw new Error(
        `collie doctor failed (exit ${result.exitCode}).\nstdout:\n${result.normalizedStdout || '<empty>'}\nstderr:\n${result.normalizedStderr || '<empty>'}`
      );
    }

    const diagnostics = parseDoctorDiagnostics(result.normalizedStdout, result.normalizedStderr);

    const failureEntries = diagnostics.filter((item) => item.status === 'fail');
    expect(failureEntries).toHaveLength(0);

    const observedIds = new Set(diagnostics.map((item) => item.id));
    for (const expectedId of [
      'node-version',
      'compiler-dependency',
      'build-system',
      'vite-config',
      'type-declarations',
      'collie-files',
      'compiler-test'
    ]) {
      expect(observedIds.has(expectedId)).toBe(true);
    }

    const viteConfigEntry = diagnostics.find((item) => item.id === 'vite-config');
    expect(viteConfigEntry).toBeDefined();
    expect(viteConfigEntry?.status).toBe('pass');
  });
});

function parseDoctorDiagnostics(stdout: string, stderr: string): DoctorDiagnostic[] {
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      throw new Error('Doctor output is not an array');
    }
    return parsed as DoctorDiagnostic[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse collie doctor JSON output (${message}).\nstdout:\n${stdout || '<empty>'}\nstderr:\n${stderr || '<empty>'}`
    );
  }
}
