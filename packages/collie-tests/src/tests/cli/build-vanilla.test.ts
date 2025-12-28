import { describe, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';

// TODO: Implement once the CLI build command contract is finalized.
describe.skip('collie CLI build - vanilla project', () => {
  it('generates output from the vanilla fixture', async () => {
    await createTempProject({ fixtureName: 'vanilla-basic' });
  });
});
