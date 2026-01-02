import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'fs-extra';
import { afterEach } from 'vitest';
import { fixturesDir } from './paths.js';

export interface TempProjectOptions {
  fixtureName: string;
  customize?: (projectDir: string) => Promise<void> | void;
}

export interface TempProjectHandle {
  /** Absolute path to the temp workspace root. */
  rootDir: string;
  /** Backward compatible alias for existing helpers. */
  dir: string;
  path: (...segments: string[]) => string;
  read: (relativePath: string) => Promise<string>;
  write: (relativePath: string, contents: string) => Promise<void>;
  exists: (relativePath: string) => Promise<boolean>;
  tree: (maxDepth?: number) => Promise<string>;
  cleanup: () => Promise<void>;
}

const shouldKeepTmp = process.env.KEEP_TEST_TMP === '1';
const trackedProjects = new Set<TempProjectHandle>();
let cleanupHookRegistered = false;

const ensureFixtureExists = async (fixtureName: string): Promise<string> => {
  const absolutePath = resolve(fixturesDir, fixtureName);
  const exists = await fs.pathExists(absolutePath);
  if (!exists) {
    throw new Error(`Fixture \"${fixtureName}\" not found under ${fixturesDir}`);
  }

  return absolutePath;
};

const registerCleanupHook = () => {
  if (cleanupHookRegistered) {
    return;
  }

  cleanupHookRegistered = true;
  afterEach(async () => {
    const pending = Array.from(trackedProjects);
    await Promise.all(pending.map((project) => project.cleanup()));
  });
};

const buildTreeLines = async (
  directory: string,
  depth: number,
  maxDepth: number
): Promise<string[]> => {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(directory);
  entries.sort();

  const lines: string[] = [];
  for (const entry of entries) {
    const absolute = join(directory, entry);
    const stats = await fs.stat(absolute);
    const prefix = '  '.repeat(depth);
    const isDirectory = stats.isDirectory();

    lines.push(`${prefix}${entry}${isDirectory ? '/' : ''}`);
    if (isDirectory) {
      lines.push(...(await buildTreeLines(absolute, depth + 1, maxDepth)));
    }
  }

  return lines;
};

export const createTempProject = async (options: TempProjectOptions): Promise<TempProjectHandle> => {
  const fixturePath = await ensureFixtureExists(options.fixtureName);
  const projectDir = join(tmpdir(), 'collie-tests', randomUUID());

  await fs.ensureDir(projectDir);
  await fs.copy(fixturePath, projectDir, { overwrite: true });

  if (options.customize) {
    await options.customize(projectDir);
  }

  const handle: TempProjectHandle = {
    rootDir: projectDir,
    dir: projectDir,
    path: (...segments: string[]) => resolve(projectDir, ...segments),
    read: async (relativePath: string) => fs.readFile(resolve(projectDir, relativePath), 'utf8'),
    write: async (relativePath: string, contents: string) => {
      const targetPath = resolve(projectDir, relativePath);
      await fs.ensureDir(dirname(targetPath));
      await fs.writeFile(targetPath, contents);
    },
    exists: (relativePath: string) => fs.pathExists(resolve(projectDir, relativePath)),
    tree: async (maxDepth = 3) => {
      const lines = await buildTreeLines(projectDir, 0, maxDepth);
      return ['.', ...lines].join('\n');
    },
    cleanup: async () => {
      trackedProjects.delete(handle);
      if (shouldKeepTmp) {
        return;
      }

      await fs.remove(projectDir);
    }
  };

  trackedProjects.add(handle);
  registerCleanupHook();

  return handle;
};
