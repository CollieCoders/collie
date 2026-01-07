import { describe, expect, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';
import { runCollieCli } from '../../harness/runCli.js';
import { parseTypescriptSnippet } from '../../harness/tsParse.js';
import fs from 'fs-extra';
import path from 'node:path';

type RunResult = Awaited<ReturnType<typeof runCollieCli>>;

const FIXTURE_NAME = 'nasty-tsx';
const OUTPUT_RELATIVE = 'dist/nasty.tsx';

const formatDebugInfo = (result: RunResult, label: string, extra: string[] = []): string => {
  return [
    `[${label}] exit ${result.exitCode}`,
    `stdout:\n${result.normalizedStdout || '<empty>'}`,
    `stderr:\n${result.normalizedStderr || '<empty>'}`,
    ...extra
  ].join('\n');
};

const formatSnippet = (contents: string, maxLength = 300): string => {
  if (contents.length <= maxLength) {
    return contents;
  }
  return `${contents.slice(0, maxLength)}...`;
};

const listFiles = async (directory: string): Promise<string[]> => {
  const results: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      results.push(...nested.map((child) => path.join(entry.name, child)));
    } else {
      results.push(entry.name);
    }
  }
  return results.sort();
};

const assertOutputIncludes = (output: string, token: string, label: string, debug: string): void => {
  if (output.includes(token)) {
    return;
  }
  throw new Error(`[${label}] expected output to include "${token}".\n${debug}`);
};

const assertOutputMatches = (output: string, pattern: RegExp, label: string, debug: string): void => {
  if (pattern.test(output)) {
    return;
  }
  throw new Error(`[${label}] expected output to match ${pattern}.\n${debug}`);
};

describe('collie CLI build - nasty tsx suspects', () => {
  it('emits TSX that preserves spread, conditionals, and mapped keys', async () => {
    const project = await createTempProject({ fixtureName: FIXTURE_NAME });

    const buildResult = await runCollieCli(['build', 'src', '--outDir', 'dist', '--quiet'], {
      cwd: project.rootDir
    });

    if (buildResult.exitCode !== 0) {
      const tree = await project.tree(5);
      throw new Error(
        formatDebugInfo(buildResult, 'build nasty-tsx', [`project tree:\n${tree}`])
      );
    }

    const outputPath = project.path(OUTPUT_RELATIVE);
    const outputExists = await fs.pathExists(outputPath);
    if (!outputExists) {
      const distPath = project.path('dist');
      const distExists = await fs.pathExists(distPath);
      const emittedFiles = distExists ? await listFiles(distPath) : [];
      throw new Error(
        formatDebugInfo(buildResult, 'build nasty-tsx', [
          `dist exists: ${distExists}`,
          `emitted files: ${emittedFiles.join(', ') || '<none>'}`
        ])
      );
    }

    const outputContents = await fs.readFile(outputPath, 'utf8');
    const snippet = formatSnippet(outputContents, 300);
    const debug = formatDebugInfo(buildResult, 'build nasty-tsx', [`output snippet:\n${snippet}`]);

    expect(outputContents.length).toBeGreaterThan(0);
    assertOutputIncludes(outputContents, '...panelProps', 'build output', debug);
    assertOutputMatches(outputContents, /\&\&/, 'build output', debug);
    assertOutputMatches(outputContents, /\.map\(/, 'build output', debug);
    assertOutputMatches(outputContents, /key=\{item\.id\}/, 'build output', debug);

    const parseResult = parseTypescriptSnippet(outputContents, { fileName: 'nasty.tsx' });
    if (parseResult.diagnostics.length > 0) {
      const messages = parseResult.diagnostics
        .map((diag) => diag.messageText)
        .map((message) => (typeof message === 'string' ? message : message.messageText));
      throw new Error(
        `[parse nasty.tsx] expected no syntax diagnostics.\n${messages.join('\n')}\n${debug}`
      );
    }
  });
});
