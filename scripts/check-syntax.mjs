import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let count = 0;
for (const directory of ['prototype', 'examples', 'scripts', 'tests']) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(js|mjs)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${entry.name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log(`JavaScript 문법 검사 통과: ${count}개 파일`);
