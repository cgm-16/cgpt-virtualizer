import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const DIST_DIRECTORY = join(process.cwd(), 'dist')
test('비대상 경로에서는 idle 상태를 보고한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/g/example')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'idle',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('지원 경로에서 필수 선택자가 없으면 Unavailable을 보고한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/missing-selectors?fixture=missing')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'unavailable',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('지원 경로에서 bubble이 threshold 미만이면 inactive를 보고한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/available?fixture=available')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'inactive',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('bubble이 0개일 때 inactive를 보고하고 오류 없이 실행된다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-0?fixture=bubble-0')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'inactive',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('bubble이 49개일 때 inactive를 보고하고 오류 없이 실행된다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-49?fixture=bubble-49')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'inactive',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('bubble이 50개일 때 available을 보고하고 오류 없이 실행된다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & { __reportedMessages: unknown[] }).__reportedMessages),
    )
    .toEqual([
      {
        availability: 'available',
        type: 'runtime/report-content-availability',
      },
    ])
})

test('bubble이 50개일 때 spacer와 전체 mounted range를 초기 패치한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          childCount: children.length,
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          firstChild: children[0]?.getAttribute('data-cgpt-top-spacer') ?? null,
          lastChild: children.at(-1)?.getAttribute('data-cgpt-bottom-spacer') ?? null,
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4600px;',
      childCount: 6,
      firstBubbleText: 'Bubble 0',
      firstChild: '',
      lastBubbleText: 'Bubble 3',
      lastChild: '',
    })
})

test('스크롤로 mounted range가 바뀌면 다음 frame에서만 패치한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      firstBubbleText: 'Bubble 0',
      lastBubbleText: 'Bubble 6',
      rafCallCount: 2,
    })
})

test('range가 바뀌지 않는 scroll은 추가 frame을 예약하지 않는다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))
  })

  await expect
    .poll(async () => page.evaluate(() => (window as WindowWithTestState).__rafCallCount))
    .toBe(2)

  await page.evaluate(async () => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = 280
    scrollContainer.dispatchEvent(new Event('scroll'))

    await new Promise((resolve) => window.setTimeout(resolve, 50))
  })

  expect(await page.evaluate(() => (window as WindowWithTestState).__rafCallCount)).toBe(2)
})

test('mounted bubble resize는 prefix sum과 mounted range를 갱신한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          childCount: children.length,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4600px;',
      childCount: 6,
      lastBubbleText: 'Bubble 3',
      rafCallCount: 1,
    })

  await page.evaluate(() => {
    ;(window as WindowWithTestState).__allBubbles[0]?.setAttribute(
      'style',
      'display: block; height: 250px;',
    )
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          childCount: children.length,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4700px;',
      childCount: 5,
      lastBubbleText: 'Bubble 2',
      rafCallCount: 2,
    })
})

test('detached bubble resize는 관찰되지 않는다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expect
    .poll(async () =>
      page.evaluate(() => ({
        bottomSpacerHeight:
          document.querySelector('[data-cgpt-bottom-spacer]')?.getAttribute('style') ?? null,
        detachedBubbleConnected:
          (window as WindowWithTestState).__allBubbles[10]?.isConnected ?? null,
        rafCallCount: (window as WindowWithTestState).__rafCallCount,
      })),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4600px;',
      detachedBubbleConnected: false,
      rafCallCount: 1,
    })

  await page.evaluate(async () => {
    ;(window as WindowWithTestState).__allBubbles[10]?.setAttribute(
      'style',
      'display: block; height: 250px;',
    )

    await new Promise((resolve) => window.setTimeout(resolve, 100))
  })

  expect(
    await page.evaluate(() => ({
      bottomSpacerHeight:
        document.querySelector('[data-cgpt-bottom-spacer]')?.getAttribute('style') ?? null,
      rafCallCount: (window as WindowWithTestState).__rafCallCount,
    })),
  ).toEqual({
    bottomSpacerHeight: 'height: 4600px;',
    rafCallCount: 1,
  })
})

test('anchor 위 bubble resize는 읽기 위치를 유지한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      lastBubbleText: 'Bubble 6',
      rafCallCount: 2,
    })

  const beforeResize = await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
    const anchorBubble = (window as WindowWithTestState).__allBubbles[2]

    if (scrollContainer === null || anchorBubble === undefined) {
      throw new Error('anchor fixture is missing')
    }

    return {
      anchorOffset:
        anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
      scrollTop: scrollContainer.scrollTop,
    }
  })

  expect(beforeResize).toEqual({
    anchorOffset: -50,
    scrollTop: 250,
  })

  await page.evaluate(() => {
    ;(window as WindowWithTestState).__allBubbles[0]?.setAttribute(
      'style',
      'display: block; height: 125px;',
    )
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
        const anchorBubble = (window as WindowWithTestState).__allBubbles[2]

        if (scrollContainer === null || anchorBubble === undefined) {
          throw new Error('anchor fixture is missing')
        }

        return {
          anchorOffset:
            anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
          scrollTop: scrollContainer.scrollTop,
        }
      }),
    )
    .toEqual({
      anchorOffset: -50,
      rafCallCount: 2,
      scrollTop: 275,
    })
})

function renderFixtureHtml(requestPath: string): string {
  const url = new URL(`http://fixture${requestPath}`)
  const fixture = url.searchParams.get('fixture')

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>content bootstrap fixture</title>
  </head>
  <body>
    ${renderFixtureBody(fixture)}
    <script>
      window.__reportedMessages = []
      window.__rafCallCount = 0
      window.__allBubbles = Array.from(document.querySelectorAll('[data-cgpt-transcript-bubble]'))
      const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = function requestAnimationFrameWrapper(callback) {
        window.__rafCallCount += 1
        return originalRequestAnimationFrame(callback)
      }
      window.chrome = {
        runtime: {
          lastError: undefined,
          onMessage: {
            addListener() {},
          },
          sendMessage(message, callback) {
            window.__reportedMessages.push(message)

            if (typeof callback === 'function') {
              callback(undefined)
            }
          },
        },
        tabs: {
          query() {},
          reload() {},
        },
      }
    </script>
    <script type="module" src="/dist/content.js"></script>
  </body>
</html>`
}

function renderBubbles(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `<article data-cgpt-transcript-bubble style="display: block; height: 100px;">Bubble ${index}</article>`,
  ).join('\n          ')
}

function renderFixtureBody(fixture: string | null): string {
  if (fixture === 'available') {
    return `
      <main data-cgpt-scroll-container style="height: 200px; overflow-y: auto;">
        <section data-cgpt-transcript-root>
          <article data-cgpt-transcript-bubble style="display: block; height: 100px;">Bubble</article>
        </section>
        <div data-cgpt-streaming-indicator hidden></div>
      </main>
    `
  }

  if (fixture === 'missing') {
    return `
      <main data-cgpt-scroll-container></main>
    `
  }

  if (fixture === 'bubble-0' || fixture === 'bubble-49' || fixture === 'bubble-50') {
    const count = fixture === 'bubble-0' ? 0 : fixture === 'bubble-49' ? 49 : 50
    return `
      <main data-cgpt-scroll-container style="height: 200px; overflow-y: auto;">
        <section data-cgpt-transcript-root>
          ${renderBubbles(count)}
        </section>
        <div data-cgpt-streaming-indicator hidden></div>
      </main>
    `
  }

  return '<main></main>'
}

function contentTypeFor(assetPath: string): string {
  if (assetPath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8'
  }

  if (assetPath.endsWith('.css')) {
    return 'text/css; charset=utf-8'
  }

  return 'application/octet-stream'
}

async function installFixtureRoutes(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.startsWith('/dist/')) {
      const assetPath = normalize(join(DIST_DIRECTORY, url.pathname.replace('/dist/', '')))

      if (!assetPath.startsWith(DIST_DIRECTORY)) {
        await route.fulfill({ body: 'forbidden', status: 403 })
        return
      }

      try {
        const asset = await readFile(assetPath)
        await route.fulfill({
          body: asset,
          contentType: contentTypeFor(assetPath),
          status: 200,
        })
      } catch {
        await route.fulfill({
          body: 'not found',
          status: 404,
        })
      }

      return
    }

    await route.fulfill({
      body: renderFixtureHtml(`${url.pathname}${url.search}`),
      contentType: 'text/html; charset=utf-8',
      status: 200,
    })
  })
}

async function expectInitialMountedWindow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      firstBubbleText: 'Bubble 0',
      lastBubbleText: 'Bubble 3',
      rafCallCount: 1,
    })
}

interface WindowWithTestState extends Window {
  __allBubbles: HTMLElement[]
  __rafCallCount: number
}
