import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST, validateCommit, validatePr, validateIssue, linkedIssues } from '../scripts/conventions.mjs';

const prBody = `## 변경 내용

사용자가 실제 규격의 페달보드를 배치하고 저장할 수 있도록 프로토타입과 작업 규칙을 추가합니다.

## 관련 이슈

Close #12

## 체크리스트

${CHECKLIST.map(item => `- [x] ${item}`).join('\n')}

## 검증

- npm run verify 통과. 실제 뮬 수집은 실행하지 않았습니다.
`;
const issueBody = `## 무엇을 하나요

페달을 보드 위에서 이동하고 회전하도록 구현합니다.

## 완료 조건

- [ ] 저장 후 배치를 복원할 수 있습니다.

## 관련 명세

docs/DEVELOPMENT_PLAN.md의 PB-003, PB-005
`;

test('commit permits documented types and Hangul summaries with a separated body', () => {
  for (const type of ['feat', 'fix', 'design', 'refactor', 'docs', 'chore', 'test']) {
    assert.deepEqual(validateCommit(`${type}: 페달 변경\n\n작업 설명\n\nCo-Authored-By: Codex <noreply@openai.com>\n`), []);
  }
});

test('commit rejects English-only summaries, unknown types, missing space and unseparated bodies', () => {
  for (const message of ['feat: add pedals', 'style: 페달 변경', 'feat:페달 변경', 'feat: 페달 변경\n작업 설명']) assert.ok(validateCommit(message).length);
  assert.deepEqual(validateCommit('Merge branch \'dev\''), []);
  assert.deepEqual(validateCommit('Revert "feat: 페달 변경"'), []);
});

test('PR requires the documented sections, real issue reference format and all four checks', () => {
  assert.deepEqual(validatePr('feat: 페달 배치 추가', prBody), []);
  assert.ok(validatePr('feat: 페달 배치 추가', prBody.replace('Close #12', '추후 연결')).length);
  assert.ok(validatePr('feat: 페달 배치 추가', prBody.replace('- [x]', '- [ ]')).length);
  assert.ok(validatePr('feat: 페달 배치 추가', prBody.replace('## 검증', '## 기타')).length);
  assert.ok(validatePr('feat: add board', prBody).length);
});

test('HTML template comments do not count as descriptions, references or completed checks', () => {
  assert.ok(validatePr('feat: 페달 배치 추가', `<!-- ${prBody} -->`).length >= 4);
  assert.deepEqual(linkedIssues('## 관련 이슈\n<!-- Close #99 -->\nClose #12'), [12]);
});

test('empty lists are rejected but real unchecked issue tasks are allowed', () => {
  assert.deepEqual(validateIssue('[FEAT] 페달 배치 추가', issueBody), []);
  assert.deepEqual(validateIssue('[BUG] 한', issueBody), []);
  for (const empty of ['- ', '- [ ] ', '1. ']) {
    assert.ok(validateIssue('[BUG] 배치 수정', `${issueBody}\n${empty}`).length);
    assert.ok(validatePr('fix: 배치 수정', `${prBody}\n${empty}`).length);
  }
});

test('issues require a supported prefix, Hangul and non-comment contents in every required section', () => {
  assert.ok(validateIssue('페달 배치', issueBody).length);
  assert.ok(validateIssue('[FEAT] add pedal', issueBody).length);
  assert.ok(validateIssue('[FEAT] 페달 배치', issueBody.replace('## 관련 명세', '## 기타')).length);
  assert.ok(validateIssue('[FEAT] 페달 배치', '<!-- 충분히 길어도 템플릿 안내일 뿐입니다. -->').length);
});
