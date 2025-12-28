import type { ExecaReturnValue } from 'execa';
import { execa } from 'execa';
import { cliBinPath } from './paths.js';
import { normalizeOutput } from './normalize.js';

export interface RunCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

export interface CliRunResult extends ExecaReturnValue<string> {
  normalizedStdout: string;
  normalizedStderr: string;
}

export const runCollieCli = async (
  args: string[] = [],
  options: RunCliOptions = {}
): Promise<CliRunResult> => {
  const result = await execa('node', [cliBinPath, ...args], {
    cwd: options.cwd,
    env: options.env,
    input: options.stdin,
    reject: false
  });

  const normalizedStdout = normalizeOutput(result.stdout ?? '');
  const normalizedStderr = normalizeOutput(result.stderr ?? '');

  return Object.assign(result, { normalizedStdout, normalizedStderr });
};
