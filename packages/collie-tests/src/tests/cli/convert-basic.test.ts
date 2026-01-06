import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';
import fs from 'fs-extra';

type RunResult = Awaited<ReturnType<typeof runCollieCli>>;

interface CheckDiagnostic {
  severity?: string;
}

interface CheckResult {
  errorCount: number;
  warningCount: number;
  diagnostics: CheckDiagnostic[];
}

const FIXTURE_NAME = 'convert-basic';
const INPUT_PATH = 'src/Input.tsx';
const OUTPUT_PATH = 'src/Input.collie';

const formatDebugInfo = (result: RunResult, label: string, snippet?: string): string => {
  const lines = [
    `[${label}] exit ${result.exitCode}`,
    `stdout:\n${result.normalizedStdout || '<empty>'}`,
    `stderr:\n${result.normalizedStderr || '<empty>'}`
  ];
  if (snippet !== undefined) {
    lines.push(`output snippet:\n${snippet || '<empty>'}`);
  }
  return lines.join('\n');
};

const parseCheckJson = (result: RunResult, label: string): CheckResult => {
  try {
    return JSON.parse(result.normalizedStdout) as CheckResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[${label}] failed to parse JSON output (${message}).\n${formatDebugInfo(result, label)}`);
  }
};

/*
  collie convert writes to a sibling .collie file only when --write is provided.
  Without --write it prints the converted template to stdout.
*/

describe('collie CLI convert - basic', () => {
  it('converts a TSX file to Collie and produces a checkable template', async () => {
    const project = await createTempProject({ fixtureName: FIXTURE_NAME });

    const convertResult = await runCollieCli(['convert', '--write', INPUT_PATH], { cwd: project.rootDir });
    if (convertResult.exitCode !== 0) {
      throw new Error(`convert failed.\n${formatDebugInfo(convertResult, 'convert --write')}`);
    }

    expect(convertResult.normalizedStdout).toContain(`Converted ${INPUT_PATH}`);
    expect(convertResult.normalizedStdout).toContain(OUTPUT_PATH);

    const outputAbsolute = project.path(OUTPUT_PATH);
    const outputExists = await fs.pathExists(outputAbsolute);
    expect(outputExists).toBe(true);

    const outputContents = await fs.readFile(outputAbsolute, 'utf8');
    expect(outputContents.length).toBeGreaterThan(0);
    expect(outputContents).toContain('props');
    expect(outputContents).toContain('{{ name }}');

    const checkResult = await runCollieCli(['check', OUTPUT_PATH, '--format', 'json'], {
      cwd: project.rootDir
    });

    const snippet = outputContents.slice(0, 400);
    if (checkResult.exitCode !== 0) {
      throw new Error(`check failed for converted output.\n${formatDebugInfo(checkResult, 'check --format json', snippet)}`);
    }

    const parsed = parseCheckJson(checkResult, 'check --format json');
    expect(parsed.errorCount).toBe(0);
    const hasErrors = parsed.diagnostics.some((diag) => diag.severity === 'error');
    expect(hasErrors).toBe(false);
  });
});
