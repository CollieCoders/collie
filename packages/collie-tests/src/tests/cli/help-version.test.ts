import { describe, it } from 'vitest';
import { runCollieCli } from '../../harness/runCli.js';

// TODO: Flesh out CLI flag validation once fixtures are ready.
describe.skip('collie CLI --help / --version output', () => {
  it('prints usage details for --help', async () => {
    await runCollieCli(['--help']);
  });

  it('prints version for --version', async () => {
    await runCollieCli(['--version']);
  });
});
