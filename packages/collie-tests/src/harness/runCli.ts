import { readFile } from 'node:fs/promises';
import fs from 'fs-extra';
import { resolve } from 'node:path';
import { execa } from 'execa';
import { cliPackageDir, cliPackageJsonPath, repoRoot } from './paths.js';
import { normalizeCliOutput } from './normalize.js';
type ExecaResult = Awaited<ReturnType<typeof execa>>;

export interface RunCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
}

export type CliRunResult = ExecaResult & {
  normalizedStdout: string;
  normalizedStderr: string;
  resolvedEntryPath: string;
  resolvedFrom: ResolvedCliEntry['sourceField'];
}

interface CliPackageJson {
  bin?: string | Record<string, string>;
  main?: string;
  exports?: string | Record<string, unknown>;
}

interface ResolvedCliEntry {
  entryPath: string;
  binField?: string | Record<string, string>;
  sourceField: 'bin' | 'main' | 'exports';
}

let cachedEntry: ResolvedCliEntry | null = null;
let hasBuiltCli = false;
let pendingBuild: Promise<void> | null = null;

const readCliPackageJson = async (): Promise<CliPackageJson> => {
  const raw = await readFile(cliPackageJsonPath, 'utf8');
  return JSON.parse(raw) as CliPackageJson;
};

const pickEntryFromBin = (bin: CliPackageJson['bin']): string | undefined => {
  if (!bin) {
    return undefined;
  }

  if (typeof bin === 'string') {
    return bin;
  }

  const preferred = bin.collie ?? Object.values(bin)[0];
  return preferred;
};

const pickEntryFromExports = (exportsField: CliPackageJson['exports']): string | undefined => {
  if (!exportsField) {
    return undefined;
  }

  if (typeof exportsField === 'string') {
    return exportsField;
  }

  if (typeof exportsField === 'object') {
    const dotExport = (exportsField as Record<string, unknown>)['.'];
    if (typeof dotExport === 'string') {
      return dotExport;
    }

    if (typeof dotExport === 'object' && dotExport !== null) {
      const typedExport = dotExport as Record<string, string>;
      return typedExport.import ?? typedExport.default ?? typedExport.require;
    }
  }

  return undefined;
};

export const resolveCliEntry = async (): Promise<ResolvedCliEntry> => {
  if (cachedEntry) {
    return cachedEntry;
  }

  const pkg = await readCliPackageJson();
  const candidates: Array<{ field: ResolvedCliEntry['sourceField']; path?: string }> = [];

  const binEntry = pickEntryFromBin(pkg.bin);
  if (binEntry) {
    candidates.push({ field: 'bin', path: binEntry });
  }

  if (typeof pkg.main === 'string') {
    candidates.push({ field: 'main', path: pkg.main });
  }

  const exportEntry = pickEntryFromExports(pkg.exports);
  if (exportEntry) {
    candidates.push({ field: 'exports', path: exportEntry });
  }

  for (const candidate of candidates) {
    if (!candidate.path) {
      continue;
    }

    const absoluteEntry = resolve(cliPackageDir, candidate.path);
    if (await fs.pathExists(absoluteEntry)) {
      cachedEntry = {
        entryPath: absoluteEntry,
        binField: pkg.bin,
        sourceField: candidate.field
      };
      return cachedEntry;
    }
  }

  const tried = candidates.map((candidate) => `${candidate.field}: ${candidate.path ?? 'n/a'}`).join(', ');
  throw new Error(
    `Unable to resolve Collie CLI entry. Tried -> ${tried || 'no candidates'}. Ensure the CLI package is built.`
  );
};

export const ensureCliBuilt = async (): Promise<void> => {
  if (hasBuiltCli) {
    return;
  }

  if (!pendingBuild) {
    pendingBuild = execa('pnpm', ['-C', repoRoot, '--filter', '@collie-lang/cli', 'build'], {
      stdio: 'inherit'
    })
      .then(() => {
        hasBuiltCli = true;
        cachedEntry = null;
      })
      .finally(() => {
        pendingBuild = null;
      });
  }

  await pendingBuild;
};

export const runCollieCli = async (
  args: string[] = [],
  options: RunCliOptions = {}
): Promise<CliRunResult> => {
  let entry: ResolvedCliEntry;

  try {
    entry = await resolveCliEntry();
  } catch (initialError) {
    const message = initialError instanceof Error ? initialError.message : String(initialError);
    if (!message.includes('Unable to resolve Collie CLI entry')) {
      throw initialError;
    }

    await ensureCliBuilt();
    entry = await resolveCliEntry();
  }

  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    CI: process.env.CI ?? '1',
    ...options.env
  };

  const result = await execa('node', [entry.entryPath, ...args], {
    cwd: options.cwd,
    env,
    input: options.stdin,
    reject: false,
    timeout: options.timeoutMs
  });

  const normalizedStdout = normalizeCliOutput(result.stdout ?? '');
  const normalizedStderr = normalizeCliOutput(result.stderr ?? '');

  return Object.assign(result, {
    normalizedStdout,
    normalizedStderr,
    resolvedEntryPath: entry.entryPath,
    resolvedFrom: entry.sourceField
  });
};
