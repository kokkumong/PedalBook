import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';

if (process.env.CI) {
  console.log('CI에서는 로컬 Git 훅 설정을 생략합니다.');
  process.exit(0);
}
const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (git.status !== 0) {
  console.log('Git checkout이 아니므로 훅 설정을 생략합니다.');
  process.exit(0);
}
if (git.stdout.trim() !== process.cwd()) throw new Error('저장소 최상위 디렉터리에서 실행하세요.');
for (const hook of ['pre-commit', 'commit-msg']) chmodSync(`.githooks/${hook}`, 0o755);
const result = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Git 훅 설정에 실패했습니다.');
console.log('PedalBook Git 훅 설정 완료: .githooks');
