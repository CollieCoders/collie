import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';

type RunResult = Awaited<ReturnType<typeof runCollieCli>>;

interface CheckDiagnostic {
  severity?: string;
  message?: string;
  code?: string;
  file?: string;
  span?: {
    start?: { line?: number; col?: number };
  };
}

interface CheckResult {
  totalFiles: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  diagnostics: CheckDiagnostic[];
  errorCount: number;
  warningCount: number;
}

const FIXTURE_NAME = 'check-warnings';
const TEMPLATE_PATH = 'src/warnings.collie';

const formatDebugInfo = (result: RunResult, label: string): string =>
  [
    `[${label}] exit ${result.exitCode}`,
    `stdout:\n${result.normalizedStdout || '<empty>'}`,
    `stderr:\n${result.normalizedStderr || '<empty>'}`
  ].join('\n');

const parseCheckJson = (result: RunResult, label: string): CheckResult => {
  try {
    const parsed = JSON.parse(result.normalizedStdout) as CheckResult;
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[${label}] failed to parse JSON output (${message}).\n${formatDebugInfo(result, label)}`);
  }
};

/*
  collie check supports --format text|json plus --no-warnings and --max-warnings.
  Exit code is non-zero only for errors or when warnings exceed --max-warnings.
  The compiler currently emits errors only (no warning-class diagnostics), so this fixture asserts a clean run.
*/

describe('collie CLI check - warnings contract', () => {
  it('returns clean JSON diagnostics for a valid file', async () => {
    const project = await createTempProject({ fixtureName: FIXTURE_NAME });

    const result = await runCollieCli(['check', TEMPLATE_PATH, '--format', 'json'], { cwd: project.rootDir });

    if (result.exitCode !== 0) {
      throw new Error(`check expected exit code 0.\n${formatDebugInfo(result, 'check --format json')}`);
    }

    const checkResult = parseCheckJson(result, 'check --format json');

    expect(checkResult.totalFiles).toBe(1);
    expect(checkResult.errorCount).toBe(0);
    expect(checkResult.warningCount).toBe(0);
    expect(Array.isArray(checkResult.diagnostics)).toBe(true);
    expect(checkResult.diagnostics).toHaveLength(0);
  });
});
