# Chrome에서 확장 로드하기

이 문서는 현재 저장소를 실제 Chrome 세션에 unpacked extension으로 로드하는 절차를 설명합니다. 목적은 `dist/` 산출물을 Chrome에 직접 불러오고, 팝업 상태와 기본 동작을 수동으로 확인할 수 있게 만드는 것입니다.

## 사전 준비

- Google Chrome
- Node.js
- pnpm
- 이 저장소의 로컬 체크아웃

## 1. 의존성 설치

```bash
pnpm install --frozen-lockfile
```

잠금 파일 기준으로 의존성을 설치합니다.

## 2. 확장 빌드

```bash
pnpm run build
```

빌드가 끝나면 `dist/` 아래에 Chrome이 읽을 unpacked extension 산출물이 생깁니다.

- `dist/manifest.json`
- `dist/content-page.js`
- `dist/content.js`
- `dist/popup.html`
- `dist/popup.js`
- `dist/worker.js`

현재 빌드는 런타임별로 분리되어 있습니다.

- `content-page.js`: MAIN world에서 SPA 네비게이션 브리지를 설치합니다.
- `content.js`: classic content script로 transcript 가상화 런타임을 실행합니다.
- `worker.js`: MV3 module service worker로 popup/content 메시지를 처리합니다.

개발 중 자동 재빌드가 필요하면 다음 명령을 별도 터미널에서 실행합니다.

```bash
pnpm run watch
```

## 3. Chrome에 unpacked extension 로드

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 클릭합니다.
4. 이 저장소 루트가 아니라 `dist/` 디렉터리를 선택합니다.
5. 카드 목록에 `cgpt-virtualizer`가 추가되면 로드가 끝난 것입니다.

`dist/`가 아니라 저장소 루트를 선택하면 Chrome이 `manifest.json`을 찾지 못하므로 로드에 실패합니다.

## 4. 기본 확인

1. 필요하면 확장 아이콘을 툴바에 고정합니다.
2. `https://chatgpt.com/c/<conversation-id>` 형태의 대화 페이지를 엽니다.
3. 확장 팝업을 열어 토글과 상태 줄을 확인합니다.

상태 해석은 다음과 같습니다.

- `On`: 현재 탭에서 가상화가 켜져 있고, 콘텐츠 런타임이 사용 가능 상태입니다.
- `Off`: 토글이 꺼져 있거나, 지원 경로가 아니거나, transcript bubble 수가 50개 미만이라 활성화되지 않았습니다.
- `Unavailable`: selector 해석에 실패했거나 현재 세션에서 콘텐츠 런타임을 계속 진행할 수 없는 상태입니다.

현재 코드의 selector registry는 실제 ChatGPT DOM 선택자가 아니라 테스트 fixture용 placeholder를 사용합니다. 그래서 확장을 Chrome에 정상 로드하더라도 live `chatgpt.com`에서는 `Unavailable`이 보일 수 있습니다. 이 문서는 로드 절차를 설명하는 문서이며, live 사이트 호환성 보장을 의미하지 않습니다.

## 5. 코드 변경 후 다시 반영하기

1. `pnpm run watch`로 `dist/`를 다시 빌드합니다.
2. `chrome://extensions`로 돌아갑니다.
3. `cgpt-virtualizer` 카드에서 새로고침 버튼을 눌러 확장을 다시 로드합니다.
4. ChatGPT 탭도 새로고침해서 새 content script를 적용합니다.

팝업에서 On/Off를 바꾸면 서비스 워커가 현재 탭을 새로고침하므로, 토글 이후에는 페이지가 다시 로드되는 것이 정상입니다.

## 6. 자동 검증 방식

`pnpm run test:integration`은 Playwright가 Chromium persistent context에 `dist/`를 unpacked extension으로 직접 로드하는 방식으로 실행합니다. 즉, 테스트도 수동 로드 절차와 같은 확장 설정 환경을 사용하며, `content.js`를 별도 HTML에 module script로 주입하지 않습니다.

## 7. 자주 겪는 문제

### 확장이 로드되지 않음

- `pnpm run build`가 성공했는지 확인합니다.
- `dist/manifest.json`이 존재하는지 확인합니다.
- Chrome에서 선택한 디렉터리가 저장소 루트가 아니라 `dist/`인지 확인합니다.

### 팝업이 계속 `Off`로 보임

- 현재 URL이 `/c/:conversationId` 형태인지 확인합니다.
- transcript bubble 수가 50개 이상인지 확인합니다.
- 토글이 실제로 켜져 있는지 확인합니다.

### 팝업이 `Unavailable`로 보임

- 현재 구현은 placeholder selector를 사용하므로 live ChatGPT DOM에서는 이 상태가 정상일 수 있습니다.
- mid-session selector failure가 발생하면 같은 페이지 세션에서는 inert 상태를 유지하므로 탭을 새로고침합니다.

### 코드 변경이 Chrome에 반영되지 않음

- `pnpm run watch` 또는 `pnpm run build`가 끝났는지 확인합니다.
- `chrome://extensions`에서 확장 카드의 새로고침 버튼을 눌렀는지 확인합니다.
- ChatGPT 탭 자체도 새로고침했는지 확인합니다.
