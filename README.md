# cgpt-virtualizer

`cgpt-virtualizer`는 긴 ChatGPT 대화에서 transcript bubble DOM을 가상화하는 Chrome MV3 확장 프로그램입니다. 화면 밖 bubble을 live DOM 밖으로 이동시키고, 다시 보일 때 같은 DOM 노드를 재장착하는 방식으로 스크롤 비용과 DOM 압력을 줄이는 것을 목표로 합니다.

## 현재 구현 상태

- 확장은 `https://chatgpt.com/*`에 주입되지만 실제 초기화는 `/c/:conversationId` 경로에서만 시도합니다.
- transcript bubble이 50개 이상일 때만 가상화를 활성화합니다.
- 팝업은 탭별 On/Off 토글과 `On` / `Off` / `Unavailable` 상태를 제공합니다.
- 현재 selector registry는 테스트 fixture 기준의 placeholder 선택자를 사용합니다. 그래서 실제 ChatGPT DOM에서는 `Unavailable` 상태가 나올 수 있습니다.

## 런타임 구성

### Popup

- 파일: `src/popup.ts`, `src/popup-view.ts`
- 역할: 현재 탭의 상태를 조회하고 On/Off 토글을 서비스 워커에 전달합니다.

### Service worker

- 파일: `src/worker.ts`, `src/background/*`
- 역할: `tabId` 기준으로 탭별 설정과 콘텐츠 가용성 상태를 메모리에 유지하고, 토글 시 현재 탭을 새로고침합니다.

### Content script

- 진입점: `src/content.ts`
- 세부 모듈:
  - `startup.ts`: 현재 탭 활성화 여부를 확인하고 콘텐츠 런타임을 시작합니다.
  - `bootstrap.ts`: selector 해석, transcript 스캔, 세션 상태 초기화, observer 연결을 담당합니다.
  - `scroll.ts`, `patch.ts`, `range.ts`: mounted range 계산과 spacer 기반 DOM 패치를 수행합니다.
  - `resize.ts`, `anchor.ts`: mounted bubble 높이 변경과 읽기 위치 보정을 처리합니다.
  - `append.ts`, `bottom-follow.ts`: tail append 배치와 near-bottom follow를 처리합니다.
  - `streaming.ts`, `placeholder.ts`: streaming 중 mount/unmount 일시 중단과 안내 placeholder를 처리합니다.
  - `rebuild.ts`, `failure.ts`, `navigation.ts`: dirty rebuild, mid-session selector failure, SPA 네비게이션 리셋을 담당합니다.

### Shared contracts

- 파일: `src/shared/*`
- 역할: popup, worker, content script가 공통으로 쓰는 메시지 타입, 상태 타입, 경로 파서, 상수를 정의합니다.

## 핵심 동작

- transcript bubble 측정값을 prefix sum으로 유지하고, 현재 스크롤 위치 기준 mounted range를 이진 탐색으로 계산합니다.
- mounted range 바깥은 top spacer와 bottom spacer 높이로 대체합니다.
- overscan은 위아래 각각 1 viewport입니다.
- clean tail append는 150ms quiet period로 배치하고, 사용자가 바닥에서 200px 이내면 append 뒤 정확한 bottom으로 다시 맞춥니다.
- 불확실한 DOM 구조 변경이 감지되면 공격적으로 full rebuild를 수행합니다.
- detached node 압력이 임계값을 넘으면 해당 탭의 가상화를 끄고 새로고침으로 복구합니다.

## 저장소 구조

```text
.
├── public/manifest.json      # MV3 manifest 원본
├── src/
│   ├── background/           # popup/content 메시지를 처리하는 worker 로직
│   ├── content/              # transcript 가상화 런타임
│   ├── shared/               # 메시지 계약, 상수, 경로 파서, 타입
│   ├── popup.ts              # popup 진입점
│   ├── popup-view.ts         # popup view model
│   ├── content.ts            # content script 진입점
│   └── worker.ts             # service worker 진입점
├── tests/
│   ├── unit/                 # 순수 로직과 DOM 단위 테스트
│   └── integration/          # Playwright 기반 브라우저 통합 테스트
├── specs.md                  # 구현 순서와 세부 설계 메모
├── whitepaper.md             # V1 동작 원칙과 제약
└── todo.md                   # 작업 체크리스트
```

## 개발 명령

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run watch
pnpm test
pnpm run test:unit
pnpm run test:integration
```

- `pnpm run build`: `dist/`에 `manifest.json`, `content.js`, `popup.html`, `popup.js`, `worker.js`를 생성합니다.
- `pnpm run watch`: 개발 중 `dist/`를 계속 다시 빌드합니다.
- `pnpm test`: unit + integration 테스트를 순서대로 실행합니다.

## 문서

- [Chrome에서 확장 로드하기](docs/chrome-extension-loading.md)
- [구현 계획과 세부 스펙](specs.md)
- [V1 제품 원칙](whitepaper.md)
