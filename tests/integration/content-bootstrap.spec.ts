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
          firstChild: children[0]?.getAttribute('data-cgpt-top-spacer') ?? null,
          lastChild: children.at(-1)?.getAttribute('data-cgpt-bottom-spacer') ?? null,
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
        }
      }),
    )
    .toEqual({
      childCount: 52,
      firstBubbleText: 'Bubble 0',
      firstChild: '',
      lastBubbleText: 'Bubble 49',
      lastChild: '',
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
    (_, index) => `<article data-cgpt-transcript-bubble>Bubble ${index}</article>`,
  ).join('\n          ')
}

function renderFixtureBody(fixture: string | null): string {
  if (fixture === 'available') {
    return `
      <main data-cgpt-scroll-container>
        <section data-cgpt-transcript-root>
          <article data-cgpt-transcript-bubble>Bubble</article>
        </section>
      </main>
      <div data-cgpt-streaming-indicator hidden></div>
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
      <main data-cgpt-scroll-container>
        <section data-cgpt-transcript-root>
          ${renderBubbles(count)}
        </section>
      </main>
      <div data-cgpt-streaming-indicator hidden></div>
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
