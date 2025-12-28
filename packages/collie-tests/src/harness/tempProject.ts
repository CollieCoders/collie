import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'fs-extra';
import { fixturesDir } from './paths.js';

export interface TempProjectOptions {
  fixtureName: string;
  customize?: (projectDir: string) => Promise<void> | void;
}

export interface TempProjectHandle {
  dir: string;
  cleanup: () => Promise<void>;
}

const ensureFixtureExists = async (fixtureName: string): Promise<string> => {
  const absolutePath = resolve(fixturesDir, fixtureName);
  const exists = await fs.pathExists(absolutePath);
  if (!exists) {
    throw new Error(`Fixture \"${fixtureName}\" not found under ${fixturesDir}`);
  }

  return absolutePath;
};

export const createTempProject = async (options: TempProjectOptions): Promise<TempProjectHandle> => {
  const fixturePath = await ensureFixtureExists(options.fixtureName);
  const projectDir = join(tmpdir(), `collie-tests-${randomUUID()}`);

  await fs.ensureDir(projectDir);
  await fs.copy(fixturePath, projectDir, { overwrite: true });

  if (options.customize) {
    await options.customize(projectDir);
  }

  return {
    dir: projectDir,
    cleanup: async () => {
      await fs.remove(projectDir);
    }
  };
};
