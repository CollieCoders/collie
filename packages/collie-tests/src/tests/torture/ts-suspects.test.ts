import { describe, it } from 'vitest';
import { parseTypescriptSnippet } from '../../harness/tsParse.js';
import { typecheckWithTsconfig } from '../../harness/tsTypecheck.js';
import { fixturesDir } from '../../harness/paths.js';
import { resolve } from 'node:path';

// TODO: Replace placeholders with meaningful torture assertions.
describe.skip('TypeScript torture suspects', () => {
  it('parses a synthetic snippet that uses satisfies + template literals', () => {
    parseTypescriptSnippet('type Demo<T> = T extends string ? T : never satisfies string');
  });

  it('prepares a tsconfig from the torture fixtures', () => {
    const tsconfigPath = resolve(fixturesDir, 'torture-ts', 'tsconfig.json');
    typecheckWithTsconfig({ tsconfigPath });
  });
});
