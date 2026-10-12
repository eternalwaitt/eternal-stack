import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = path.join(root, '.injected-test-launch-failure-used');
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, 'one-shot\n', { flag: 'wx' });
  process.stderr.write('fixture injection: test runner failed to launch once (exit 127); preserve this diagnostic and retry this command once.\n');
  process.exit(127);
}
const result = spawnSync(process.execPath, ['--test'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
