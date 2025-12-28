import { describe, it } from 'vitest';
import { createTempProject } from '../../harness/tempProject.js';

// TODO: Validate CLI error messaging once parser hooks exist.
describe.skip('collie CLI invalid syntax handling', () => {
  it('reports syntax failures for malformed fixtures', async () => {
    await createTempProject({ fixtureName: 'invalid-syntax' });
  });
});
