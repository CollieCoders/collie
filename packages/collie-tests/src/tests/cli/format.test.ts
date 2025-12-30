import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';

type RunResult = Awaited<ReturnType<typeof runCollieCli>>;
interface DebugContext {
  before?: string;
  after?: string;
}

const FIXTURE_NAME = 'format-basic';
const TEMPLATE_PATH = 'src/unformatted.collie';

const formatDebugInfo = (result: RunResult, label: string, context?: DebugContext): string => {
  const lines = [
    `[${label}] exit ${result.exitCode}`,
    `stdout:\n${result.normalizedStdout || '<empty>'}`,
    `stderr:\n${result.normalizedStderr || '<empty>'}`
  ];
  if (context?.before !== undefined && context?.after !== undefined) {
    lines.push(`before length: ${context.before.length} chars`);
    lines.push(`after length: ${context.after.length} chars`);
  }
  return lines.join('\n');
};

const assertCliSuccess = (result: RunResult, label: string, context?: DebugContext): void => {
  if (result.exitCode === 0) {
    return;
  }
  throw new Error(`${label} did not exit cleanly.\n${formatDebugInfo(result, label, context)}`);
};

const assertStdoutIncludes = (
  result: RunResult,
  label: string,
  expected: string,
  context?: DebugContext
): void => {
  if (result.normalizedStdout.includes(expected)) {
    return;
  }
  throw new Error(`[${label}] expected stdout to include "${expected}".\n${formatDebugInfo(result, label, context)}`);
};

const assertCheckFailure = (result: RunResult, label: string, context?: DebugContext): void => {
  if (result.exitCode === 1) {
    return;
  }
  throw new Error(`${label} expected exit code 1 when formatting was needed.\n${formatDebugInfo(result, label, context)}`);
};

/*
  `collie format --write` mutates files and prints "Formatted N file(s)".
  `--check` exits 1 when formatting is needed and logs the ✖ summary plus "Run: collie format --write to fix".
  Running format without --write streams formatted text to stdout (unused here).
*/

describe('collie CLI format', () => {
  it('formats files on disk and is idempotent when run repeatedly', async () => {
    const project = await createTempProject({ fixtureName: FIXTURE_NAME });
    const originalContents = await project.read(TEMPLATE_PATH);

    const firstResult = await runCollieCli(['format', '--write', TEMPLATE_PATH], { cwd: project.rootDir });
    const firstContents = await project.read(TEMPLATE_PATH);
    assertCliSuccess(firstResult, 'format --write (first run)', {
      before: originalContents,
      after: firstContents
    });
    assertStdoutIncludes(firstResult, 'format --write (first run)', 'Formatted 1 file', {
      before: originalContents,
      after: firstContents
    });

    expect(firstContents).not.toBe(originalContents);

    const secondResult = await runCollieCli(['format', '--write', TEMPLATE_PATH], { cwd: project.rootDir });
    const secondContents = await project.read(TEMPLATE_PATH);
    assertCliSuccess(secondResult, 'format --write (second run)', {
      before: firstContents,
      after: secondContents
    });
    assertStdoutIncludes(secondResult, 'format --write (second run)', 'Formatted 0 files', {
      before: firstContents,
      after: secondContents
    });

    expect(secondContents).toBe(firstContents);
  });

  it('does not write files when --check detects formatting issues', async () => {
    const project = await createTempProject({ fixtureName: FIXTURE_NAME });
    const originalContents = await project.read(TEMPLATE_PATH);

    const checkResult = await runCollieCli(['format', '--check', TEMPLATE_PATH], { cwd: project.rootDir });
    assertCheckFailure(checkResult, 'format --check', {
      before: originalContents,
      after: originalContents
    });
    assertStdoutIncludes(checkResult, 'format --check', '✖ 1 file need formatting', {
      before: originalContents,
      after: originalContents
    });
    assertStdoutIncludes(checkResult, 'format --check', 'Run: collie format --write to fix', {
      before: originalContents,
      after: originalContents
    });

    const afterCheck = await project.read(TEMPLATE_PATH);
    expect(afterCheck).toBe(originalContents);
  });
});
