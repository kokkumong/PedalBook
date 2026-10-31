# PedalBook

실제 규격으로 페달보드를 배치하고, 뮬 매물 찾기와 구매 예산을 함께 계획하는 웹 편집기입니다.

현재 **Next.js·TypeScript·React Konva 배치 편집기, 뮬 장터 이동·검색어 복사, 수동 예산**까지 구현했습니다. 자동 시세 수집과 계정/서버 저장은 후속 단계입니다.

## 실행

Node.js 22.18 이상이 필요합니다. 의존성 버전은 lockfile에 고정하고 `npm install` 시 Git 훅도 설치합니다.

```sh
npm install
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)에서 엽니다. 다른 포트는 `PORT=3001 npm run dev`로 지정합니다. 이전 SVG 프로토타입은 `npm run dev:prototype`으로 별도 실행할 수 있습니다.

- 보드 크기 프리셋·직접 입력, 페달 5종 검색·카테고리 필터
- 커스텀 페달 이름·크기·색상, 클릭/드래그 추가
- 이동·90도 회전·복제·삭제·undo/redo, zoom/pan/fit, 그리드·5mm 스냅·겹침/경계 경고
- 브라우저 자동 저장, 이전 보드 이관, JSON 내보내기/불러오기
- 페달별 뮬 검색어 복사·장터 이동·직접 입력 단가·보유 여부
- 전체 배치 또는 추가 구매 예산, 인스턴스별 합계와 가격 미상 개수

`R` 회전, `Delete` 삭제, 방향키 1mm 이동, `Shift` + 방향키 5mm 이동, `⌘/Ctrl+Z` 되돌리기, `⌘/Ctrl+Shift+Z` 다시 실행을 지원합니다. 목록에서 페달을 선택해 키보드로 조작할 수도 있습니다.

## 데이터와 저장 범위

규격은 제조사의 **가로 × 깊이**입니다. 제품 높이는 평면 배치의 세로가 아닙니다. 커넥터·케이블 공간은 별도로 확인하세요.

- [BOSS DS-1](https://www.boss.info/global/products/ds-1/specifications/), [CE-2W](https://www.boss.info/global/products/ce-2w/), [DD-8](https://www.boss.info/global/products/dd-8/), [TU-3](https://www.boss.info/global/products/tu-3/): 73 × 129mm
- [Strymon blueSky V2](https://www.strymon.net/product/bluesky/): 101.6 × 114.3mm

직접 작성한 SVG 일러스트를 사용합니다. 제조사 사진이나 PedalPlayground 이미지를 복제하지 않았습니다. 샘플 배치는 추천 신호 연결 순서가 아닙니다.

검수된 시장 가격은 아직 없으므로 **시세 정보 없음**을 표시합니다. 직접 입력한 금액은 시장 시세와 구분합니다. 미상 가격을 0원으로 확정하지 않고 누락 개수로 표시하며, 보유 페달은 추가 구매 합계에서 제외합니다. 뮬 검색 파라미터는 미검증 상태이므로 장터 링크와 검색어 복사를 제공합니다.

저장은 이 브라우저·동일 주소의 localStorage를 사용합니다. 주소/포트가 바뀌면 저장 공간도 달라지므로 다른 기기로 옮길 때는 JSON을 내보내세요. 계정·클라우드 저장은 아직 없습니다.

현재 JSON은 `schemaVersion: 2`로, 좌표·규격은 mm, 가격은 원 단위입니다. v1 파일과 `pedalbook.prototype.v1` 저장본을 이관하되 원본 키는 보존합니다. 새 저장본은 `pedalbook.board.v2`에 revision과 함께 기록합니다. 손상·저장 용량 오류·다른 탭 변경 시 자동 저장을 멈추고 파일 백업을 안내합니다. Web Locks 지원 브라우저는 탭 간 쓰기를 직렬화하며, 미지원 환경은 저장 직전 비교로 충돌을 감지합니다. 동시 편집은 한 탭 사용을 권장합니다.

## 구조와 검증

`src/domain/`은 좌표·저장 형식·예산 계산, `src/hooks/`는 저장과 undo 상태, `src/components/`는 UI입니다. 캔버스는 클라이언트에서만 로드합니다.

```sh
npm run verify
npm run build
npm start
```

`verify`는 JavaScript 문법, Next.js 경로 생성·TypeScript 타입, 29개 테스트를 검사합니다. 좌표/회전·이관·JSON 검증·저장 충돌/실패·가격 신선도·예산 계산을 확인합니다. CI는 운영 빌드도 실행합니다. DB DDL과 수집 예제의 실제 외부 연동은 검사하지 않습니다.

## 협업 규칙

[CONVENTION.md](CONVENTION.md)와 [AGENTS.md](AGENTS.md)에 따라 한글 커밋 요약, 이슈 연결, PR 템플릿을 작성합니다. 일반 작업은 `feature/<이슈번호>-<작업명> → dev`, 통합 반영은 `dev → main` PR을 사용합니다. 사용자 요청 없이 병합하지 않습니다.

## 설계 문서

- [기술 설계](docs/TECHNICAL_DESIGN.md)
- [개발 계획과 현재 상태](docs/DEVELOPMENT_PLAN.md)
- [PostgreSQL DDL 예시](db/001_initial.sql)
- [PedalPlayground 이관 예제](examples/import-pedals.mjs)
- [수집 어댑터 예제](examples/collect-mule.mjs)

DB·Redis·수집 예제는 후속 설계이며 실제 시세 데이터가 공급되는 상태는 아닙니다.
