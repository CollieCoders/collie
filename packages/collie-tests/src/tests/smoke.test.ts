import { describe, it } from 'vitest';
import { createTempProject } from '../harness/tempProject.js';
import { runCollieCli } from '../harness/runCli.js';

// Placeholder smoke suite to show how helpers can be composed.
describe.skip('collie smoke suite', () => {
  it('spins up a vanilla fixture and runs the CLI help command', async () => {
    const project = await createTempProject({ fixtureName: 'vanilla-basic' });

    try {
      await runCollieCli(['--help'], { cwd: project.dir });
      // TODO: add assertions once fixtures + CLI flow are ready.
    } finally {
      await project.cleanup();
    }
  });
});
