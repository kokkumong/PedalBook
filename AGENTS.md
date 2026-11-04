# PedalBook 작업 규칙

이 저장소에서 코드를 작성하거나 GitHub 작업을 수행하기 전에 [CONVENTION.md](CONVENTION.md)를 읽고 따릅니다. 사용자의 명시적 지시가 프로젝트 규칙보다 우선합니다.

- 현재 단계는 Next.js/TypeScript + React Konva 배치 편집기와 뮬 이동·수동 예산입니다. DB·계정·자동 수집은 후속 범위입니다.
- 일반 작업은 `feature/<이슈번호>-<작업명>`에서 수행하고 `dev`로 PR을 만듭니다. `dev → main` PR은 통합/반영 요청에 사용합니다. 최초 초기화 예외는 CONVENTION.md를 따릅니다.
- 커밋/PR 제목은 허용 타입 + 한글 요약을 사용합니다. Codex 커밋에는 실제 공동 작성자 trailer를 추가합니다.
- 커밋 전 `npm run verify`를 실행하고 실패를 해결합니다. UI·의존성·프레임워크 변경은 `npm run build`도 검증합니다. `.githooks`를 설치하고 훅을 우회하지 않습니다.
- 이슈/PR 템플릿의 필수 절과 네 개 체크리스트를 유지하고, 실제 이슈를 연결합니다. 검증 결과는 수행한 범위만 적습니다.
- PR 생성 요청으로 병합까지 수행하지 않습니다. 사용자 요청 없이 main 직접 커밋/푸시, force push, 원격 브랜치 삭제를 하지 않습니다.
- 규격/저장 좌표는 mm를 사용하고 화면 배율과 분리합니다. 배치/회전·저장 형식을 바꿀 때 관련 테스트와 문서를 함께 검토합니다.
- 비밀값, 개인 보드 export, 수집 원본, 미허가 이미지/데이터를 커밋하지 않습니다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
