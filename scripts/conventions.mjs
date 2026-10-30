import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const commitPattern = /^(feat|fix|design|refactor|docs|chore|test): (\S.*)$/;
const hangul = /[가-힣]/;
export const CHECKLIST = [
  'CONVENTION.md와 개발 단계에 맞게 변경했습니다.',
  'npm run verify를 통과했습니다.',
  '관련 문서·테스트의 수정 필요 여부를 확인했습니다.',
  '비밀값·개인 데이터·미허가 자료가 포함되지 않았습니다.',
];
const normalize = text => String(text ?? '').replace(/\r\n/g, '\n');
const withoutComments = text => normalize(text).replace(/<!--[\s\S]*?-->/g, '');
const emptyList = /^\s*(?:[-*+]\s*(?:\[[ xX]\]\s*)?|\d+\.\s*)$/m;

export function validateTitle(title) {
  const match = normalize(title).match(commitPattern);
  return match && hangul.test(match[2]) ? [] : ['제목은 <타입>: <한글을 포함한 요약> 형식이어야 합니다.'];
}

export function validateCommit(message) {
  const lines = normalize(message).trimEnd().split('\n');
  if (/^(Merge |Revert ")/.test(lines[0])) return [];
  const errors = validateTitle(lines[0]);
  if (lines.length > 1 && lines[1].trim()) errors.push('커밋 요약과 본문 사이에 빈 줄이 필요합니다.');
  return errors;
}

export function section(body, title) {
  const lines = withoutComments(body).split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${title}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^##\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function linkedIssues(body) {
  return [...section(body, '관련 이슈').matchAll(/\bClose\s+#([1-9]\d*)\b/gi)].map(match => Number(match[1]));
}

export function validatePr(title, body) {
  const errors = validateTitle(title), text = withoutComments(body);
  if (section(text, '변경 내용').replace(/\s/g, '').length < 20) errors.push('변경 내용에 공백을 제외한 20자 이상의 설명이 필요합니다.');
  if (!linkedIssues(text).length) errors.push('관련 이슈에 Close #번호를 적어야 합니다.');
  const list = section(text, '체크리스트').split('\n').map(line => line.trim());
  for (const item of CHECKLIST) if (!list.some(line => line === `- [x] ${item}` || line === `- [X] ${item}`)) errors.push(`체크리스트 확인 필요: ${item}`);
  if (!section(text, '검증')) errors.push('검증 절에 실제 실행한 명령과 결과를 적어야 합니다.');
  if (emptyList.test(text)) errors.push('본문에 빈 목록 항목을 남길 수 없습니다.');
  return errors;
}

export function validateIssue(title, body) {
  const errors = [], text = withoutComments(body);
  const match = normalize(title).match(/^\[(FEAT|BUG)\] (\S.*)$/);
  if (!match || !hangul.test(match[2])) errors.push('이슈 제목은 [FEAT] 또는 [BUG] 접두어와 한글 요약이 필요합니다.');
  for (const name of ['무엇을 하나요', '완료 조건', '관련 명세']) if (!section(text, name)) errors.push(`필수 절이 비어 있습니다: ${name}`);
  if (emptyList.test(text)) errors.push('본문에 빈 목록 항목을 남길 수 없습니다.');
  return errors;
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git 명령 실패');
  return result.stdout;
}
function main() {
  const [mode, ...args] = process.argv.slice(2);
  let errors = [];
  if (mode === 'commit-file') errors = validateCommit(readFileSync(args[0], 'utf8'));
  else if (mode === 'commits') {
    const [base, head = 'HEAD'] = args;
    if (!/^[a-f\d]{40}$/i.test(base ?? '') || !/^(?:HEAD|[a-f\d]{40})$/i.test(head)) throw new Error('커밋 검사는 base SHA와 head SHA 또는 HEAD가 필요합니다.');
    const hashes = git(['rev-list', `${base}..${head}`]).trim().split('\n').filter(Boolean);
    for (const hash of hashes) errors.push(...validateCommit(git(['show', '-s', '--format=%B', hash])).map(message => `${hash.slice(0, 7)}: ${message}`));
    console.log(`커밋 메시지 검사: ${hashes.length}개`);
  } else if (mode === 'pr-file') {
    errors = validatePr(args[0] ?? '', readFileSync(args[1], 'utf8'));
  } else if (mode === 'pr-event' || mode === 'issue-event') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (mode === 'pr-event') errors = validatePr(event.pull_request?.title, event.pull_request?.body);
    else errors = validateIssue(event.issue?.title, event.issue?.body);
  } else throw new Error('지원 모드: commit-file, commits, pr-file, pr-event, issue-event');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('컨벤션 검사 통과');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
