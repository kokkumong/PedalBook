# PedalBook

웹에서 실제 규격에 맞춰 페달보드를 배치하고, 모델별 중고 매물과 예상 예산을 확인하는 서비스.

현재 단계: **로컬에서 실행하는 페달 배치 프로토타입**을 구현했습니다. 뮬 및 서버 연동은 다음 단계입니다.

개발 순서: **페달 배치 편집기 → 뮬 페이지 연결 → 참고 시세·예산 → 자동 수집·캐시**. 첫 구현은 로그인이나 외부 연동 없이 배치하고 브라우저에 저장할 수 있는 편집기입니다.

## 프로토타입 실행

Node.js 22 이상에서 실행합니다. 런타임 의존성은 없으며 최초 `npm install`로 Git 훅을 설정합니다.

```sh
npm install
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)을 브라우저에서 엽니다. 다른 포트는 `PORT=3001 npm run dev`처럼 지정할 수 있습니다.

- 보드 크기 프리셋 및 직접 입력
- 샘플 페달 5종 검색·카테고리 필터·클릭/드래그 추가
- 커스텀 페달 이름·크기·색상 입력
- 드래그 및 방향키 이동, 90도 회전, 복제·삭제, 되돌리기·다시 실행
- 확대/축소, 확대 상태에서 배경 드래그로 이동, 그리드·5mm 스냅, 겹침 경고
- 브라우저 자동 저장·복원, JSON 파일 내보내기·불러오기

`R`은 회전, `Delete`는 삭제, 방향키는 1mm 이동, `Shift` + 방향키는 5mm 이동입니다. `⌘/Ctrl+Z`는 되돌리기입니다.

빠른 조작 검증을 위해 프레임워크·외부 의존성 없이 HTML/CSS/JavaScript와 SVG로 구현했습니다. 계획한 Next.js/React Konva 본 구현과는 구분되며, mm 좌표 모델과 JSON 계약을 이후 구현의 기준으로 활용할 수 있습니다. 현재 파일 형식은 프로토타입용으로 `TECHNICAL_DESIGN.md`의 서버용 JSON과 동일하지 않습니다.

## 데이터와 저장 범위

샘플 페달의 배치 규격은 제조사 제공 **가로 × 깊이**를 사용합니다. 제품 높이는 평면 배치의 세로로 사용하지 않습니다. 커넥터·케이블 여유 공간은 별도로 확인해야 합니다.

- [BOSS DS-1](https://www.boss.info/global/products/ds-1/specifications/), [CE-2W](https://www.boss.info/global/products/ce-2w/), [DD-8](https://www.boss.info/global/products/dd-8/), [TU-3](https://www.boss.info/global/products/tu-3/): 73 × 129mm
- [Strymon blueSky V2](https://www.strymon.net/product/bluesky/): 101.6 × 114.3mm

제조사 사진이나 PedalPlayground 이미지를 복제하지 않고 직접 작성한 SVG 일러스트를 사용합니다. 샘플 배치는 조작 예시이며 추천 신호 연결 순서를 의미하지 않습니다.

현재 저장은 이 브라우저·동일 접속 주소의 localStorage만 사용합니다. 주소/포트가 달라지면 저장 공간도 달라집니다. 다른 브라우저/기기로 옮기려면 JSON을 내보내세요. 계정·클라우드 저장, 시세, 뮬 매물 연결은 포함하지 않았습니다.

## 검증

```sh
npm run verify
```

좌표 경계, 회전된 규격, 스냅, 겹침, JSON 복원·입력 검증을 테스트합니다. 초기 DB DDL과 수집 코드는 실행 가능한 편집기와 분리된 설계 예제입니다.

## 협업 규칙

[CONVENTION.md](CONVENTION.md)를 따라 한글 커밋 요약, 이슈 연결, PR 템플릿을 작성합니다. [AGENTS.md](AGENTS.md)는 코딩 에이전트에도 같은 규칙을 적용합니다.

개발 통합 브랜치는 `dev`이며 일반 작업은 `feature/<이슈번호>-<작업명> → dev`, 통합 반영은 `dev → main` PR을 사용합니다. 커밋 훅과 GitHub CI가 문법·테스트, 커밋 메시지, PR 형식을 검사합니다. 사용자 요청 없이 PR을 자동 병합하지 않습니다.

## 설계 문서

- [시스템 설계 및 구현 가이드](docs/TECHNICAL_DESIGN.md)
- [단계별 개발 계획 및 4주 일정](docs/DEVELOPMENT_PLAN.md)
- [PostgreSQL 초기 DDL 예시](db/001_initial.sql)
- [PedalPlayground 이관 예제](examples/import-pedals.mjs)
- [Playwright 수집 어댑터 예제](examples/collect-mule.mjs)

예제의 실행 전제와 검증 범위는 기술 문서를 참고하세요. 특히 뮬의 실제 검색 파라미터와 DOM은 아직 검증하지 않았습니다.
