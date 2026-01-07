import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const packageRoot = resolve(moduleDir, '..', '..');
export const repoRoot = resolve(packageRoot, '..', '..');
export const fixturesDir = resolve(packageRoot, 'fixtures');
export const testsDir = resolve(packageRoot, 'src', 'tests');
export const cliPackageDir = resolve(repoRoot, 'packages', 'cli');
export const cliPackageJsonPath = resolve(cliPackageDir, 'package.json');
