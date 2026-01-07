import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempProject } from '../../harness/tempProject.js';
import { repoRoot } from '../../harness/paths.js';

const linkWorkspaceNodeModules = async (projectDir: string): Promise<void> => {
  const source = path.join(repoRoot, 'node_modules');
  const destination = path.join(projectDir, 'node_modules');

  if (!(await fs.pathExists(source))) {
    throw new Error(`Workspace node_modules missing at ${source}`);
  }

  if (await fs.pathExists(destination)) {
    return;
  }

  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.ensureSymlink(source, destination, type);
};

const testFileDir = path.dirname(fileURLToPath(import.meta.url));

const findWorkspaceRoot = async (startDir: string): Promise<string> => {
  let current = startDir;
  const rootDir = path.parse(current).root;

  while (true) {
    if (await fs.pathExists(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    if (current === rootDir) {
      break;
    }

    current = path.dirname(current);
  }

  throw new Error(`pnpm-workspace.yaml not found when searching from ${startDir}`);
};

const buildTreeLines = async (
  directory: string,
  depth: number,
  maxDepth: number
): Promise<string[]> => {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  for (const entry of entries) {
    const prefix = '  '.repeat(depth);
    const name = entry.name + (entry.isDirectory() ? '/' : '');
    lines.push(`${prefix}${name}`);

    if (entry.isDirectory()) {
      lines.push(
        ...(await buildTreeLines(path.join(directory, entry.name), depth + 1, maxDepth))
      );
    }
  }

  return lines;
};

const renderDistTree = async (distDir: string): Promise<string> => {
  if (!(await fs.pathExists(distDir))) {
    return 'dist/ (missing)';
  }

  const lines = await buildTreeLines(distDir, 0, 3);
  return ['dist/', ...lines].join('\n');
};

const findJsFiles = async (
  directory: string,
  depth = 0,
  maxDepth = 4
): Promise<string[]> => {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const matches: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findJsFiles(absolute, depth + 1, maxDepth)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      matches.push(absolute);
    }
  }

  return matches;
};

const formatSection = (label: string, value: string): string => {
  const trimmed = value.trim();
  return `${label}:\n${trimmed ? trimmed : '<empty>'}`;
};

const formatErrorDetails = (error: unknown): string => {
  if (!error) {
    return '<none>';
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

const assertViteBuild = async (
  distDir: string,
  workspaceRoot: string,
  tempProjectRoot: string,
  buildError?: unknown
): Promise<void> => {
  const distExists = await fs.pathExists(distDir);
  const jsFiles = distExists ? await findJsFiles(distDir) : [];
  const hasJs = jsFiles.length > 0;

  if (buildError || !distExists || !hasJs) {
    const distTree = await renderDistTree(distDir);
    const details = [
      '[vite-basic] vite build failed',
      `workspace root: ${workspaceRoot}`,
      `temp project root: ${tempProjectRoot}`,
      formatSection('error', formatErrorDetails(buildError)),
      `dist tree:\n${distTree}`
    ].join('\n\n');
    throw new Error(details);
  }

  expect(distExists).toBe(true);
  expect(hasJs).toBe(true);
};

describe.skip('vite integration - basic', () => {
  it('builds a Collie-powered Vite fixture', async () => {
    const project = await createTempProject({
      fixtureName: 'vite-basic',
      customize: linkWorkspaceNodeModules
    });

    const workspaceRoot = await findWorkspaceRoot(testFileDir);
    let buildError: unknown;

    let build: typeof import('vite').build;
    try {
      ({ build } = await import('vite'));
    } catch (error) {
      throw new Error(
        [
          '[vite-basic] unable to import the Vite build API.',
          'Ensure `vite` is installed as a devDependency at the workspace root.',
          `Original error: ${formatErrorDetails(error)}`
        ].join('\n')
      );
    }

    try {
      await build({
        root: project.rootDir,
        logLevel: 'silent',
        build: {
          outDir: 'dist',
          emptyOutDir: true
        }
      });
    } catch (error) {
      buildError = error;
    }

    await assertViteBuild(
      path.join(project.rootDir, 'dist'),
      workspaceRoot,
      project.rootDir,
      buildError
    );
  });
});
