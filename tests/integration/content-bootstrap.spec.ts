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

test('mid-session selector failure는 Unavailable로 전환되고 navigation 전까지 inert 상태를 유지한다', async ({
  page,
}) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    ;(window as WindowWithTestState).__detachedScrollContainer =
      document.querySelector<HTMLElement>('[data-cgpt-scroll-container]') ?? undefined
    ;(window as WindowWithTestState).__replaceFixture('missing')

    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const messages = (window as WindowWithTestState).__reportedMessages

        return {
          lastAvailability:
            messages.at(-1) !== undefined && typeof messages.at(-1) === 'object'
              ? (messages.at(-1) as { availability?: string }).availability ?? null
              : null,
          messageCount: messages.length,
        }
      }),
    )
    .toEqual({
      lastAvailability: 'unavailable',
      messageCount: 2,
    })

  const rafCallCount = await page.evaluate(() => (window as WindowWithTestState).__rafCallCount)

  await page.evaluate(() => {
    const detachedScrollContainer = (window as WindowWithTestState).__detachedScrollContainer

    if (detachedScrollContainer === undefined) {
      throw new Error('detached scroll container fixture is missing')
    }

    detachedScrollContainer.scrollTop = 400
    detachedScrollContainer.dispatchEvent(new Event('scroll'))
  })

  expect(await page.evaluate(() => (window as WindowWithTestState).__rafCallCount)).toBe(
    rafCallCount,
  )

  await page.evaluate(async () => {
    history.pushState({}, '', '/c/recovered?fixture=bubble-50-alt')
    ;(window as WindowWithTestState).__replaceFixture('bubble-50-alt')

    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)
        const messages = (window as WindowWithTestState).__reportedMessages

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastAvailability:
            messages.at(-1) !== undefined && typeof messages.at(-1) === 'object'
              ? (messages.at(-1) as { availability?: string }).availability ?? null
              : null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          messageCount: messages.length,
        }
      }),
    )
    .toEqual({
      firstBubbleText: 'Next Bubble 0',
      lastAvailability: 'available',
      lastBubbleText: 'Next Bubble 3',
      messageCount: 3,
    })
})

test('conversation ID가 바뀌면 현재 세션을 폐기하고 새 transcript를 처음부터 다시 초기화한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)
  await scrollToTranscriptPosition(page, 400, {
    firstBubbleText: 'Bubble 2',
    lastBubbleText: 'Bubble 7',
    rafCallCount: 2,
  })

  await page.evaluate(async () => {
    history.pushState({}, '', '/c/next?fixture=bubble-50-alt')
    ;(window as WindowWithTestState).__replaceFixture('bubble-50-alt')

    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)
        const messages = (window as WindowWithTestState).__reportedMessages

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          messageCount: messages.length,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
          scrollTop:
            document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
        }
      }),
    )
    .toEqual({
      firstBubbleText: 'Next Bubble 0',
      lastBubbleText: 'Next Bubble 3',
      messageCount: 2,
      rafCallCount: 3,
      scrollTop: 0,
    })
})

test('비 transcript 경로로 이동하면 활성 세션을 해제하고 idle 상태로 남는다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    history.pushState({}, '', '/g/example')
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)
        const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

        if (scrollContainer !== null) {
          scrollContainer.scrollTop = 300
          scrollContainer.dispatchEvent(new Event('scroll'))
        }

        const messages = (window as WindowWithTestState).__reportedMessages

        return {
          childCount: children.length,
          firstBubbleText: children[0]?.textContent ?? null,
          lastAvailability:
            messages.at(-1) !== undefined && typeof messages.at(-1) === 'object'
              ? (messages.at(-1) as { availability?: string }).availability ?? null
              : null,
          lastBubbleText: children.at(-1)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
        }
      }),
    )
    .toEqual({
      childCount: 50,
      firstBubbleText: 'Bubble 0',
      lastAvailability: 'idle',
      lastBubbleText: 'Bubble 49',
      rafCallCount: 1,
    })
})

test('같은 conversation ID의 네비게이션 신호는 파괴적 재초기화를 일으키지 않는다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)
  await scrollToTranscriptPosition(page, 400, {
    firstBubbleText: 'Bubble 2',
    lastBubbleText: 'Bubble 7',
    rafCallCount: 2,
  })

  await page.evaluate(async () => {
    history.replaceState({}, '', '/c/bubble-50?fixture=bubble-50&view=details')
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          childCount: children.length,
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          messageCount: (window as WindowWithTestState).__reportedMessages.length,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
          scrollTop:
            document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
        }
      }),
    )
    .toEqual({
      childCount: 8,
      firstBubbleText: 'Bubble 2',
      lastBubbleText: 'Bubble 7',
      messageCount: 1,
      rafCallCount: 2,
      scrollTop: 400,
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

test('streaming 중 scroll은 mounted range 패치를 멈춘다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')

    if (scrollContainer === null || streamingIndicator === null) {
      throw new Error('streaming fixture is missing')
    }

    streamingIndicator.removeAttribute('hidden')
    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))

    await new Promise((resolve) => window.setTimeout(resolve, 50))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
        }
      }),
    )
    .toEqual({
      firstBubbleText: 'Bubble 0',
      lastBubbleText: 'Bubble 3',
    })
})

test('streaming gap에 진입하면 placeholder를 표시하고 종료 시 제거한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')

    if (scrollContainer === null || streamingIndicator === null) {
      throw new Error('streaming fixture is missing')
    }

    streamingIndicator.removeAttribute('hidden')
    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))

    await new Promise((resolve) => window.setTimeout(resolve, 50))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')

        return {
          lastBubbleText:
            transcriptRoot === null
              ? null
              : Array.from(transcriptRoot.children).at(-2)?.textContent ?? null,
          placeholderEdge:
            transcriptRoot?.querySelector('[data-cgpt-streaming-gap-placeholder]')?.getAttribute(
              'data-cgpt-streaming-gap-edge',
            ) ?? null,
        }
      }),
    )
    .toEqual({
      lastBubbleText: 'Bubble 3',
      placeholderEdge: 'bottom',
    })

  await page.evaluate(() => {
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')

    if (streamingIndicator === null) {
      throw new Error('streaming indicator fixture is missing')
    }

    streamingIndicator.setAttribute('hidden', '')
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          lastBubbleText: children.at(-2)?.textContent ?? null,
          placeholderCount:
            transcriptRoot?.querySelectorAll('[data-cgpt-streaming-gap-placeholder]').length ?? 0,
        }
      }),
    )
    .toEqual({
      lastBubbleText: 'Bubble 6',
      placeholderCount: 0,
    })
})

test('streaming 중 resize는 anchor correction을 계속 적용한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')

    if (scrollContainer === null || streamingIndicator === null) {
      throw new Error('streaming fixture is missing')
    }

    streamingIndicator.removeAttribute('hidden')
    scrollContainer.scrollTop = 250
    scrollContainer.dispatchEvent(new Event('scroll'))

    await new Promise((resolve) => window.setTimeout(resolve, 50))
  })

  const beforeResize = await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
    const anchorBubble = (window as WindowWithTestState).__allBubbles[2]
    const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')

    if (scrollContainer === null || anchorBubble === undefined || transcriptRoot === null) {
      throw new Error('streaming resize fixture is missing')
    }

    return {
      anchorOffset:
        anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
      lastBubbleText: Array.from(transcriptRoot.children).at(-2)?.textContent ?? null,
      scrollTop: scrollContainer.scrollTop,
    }
  })

  expect(beforeResize).toEqual({
    anchorOffset: -50,
    lastBubbleText: 'Bubble 3',
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
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')

        if (scrollContainer === null || anchorBubble === undefined || transcriptRoot === null) {
          throw new Error('streaming resize fixture is missing')
        }

        return {
          anchorOffset:
            anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          lastBubbleText: Array.from(transcriptRoot.children).at(-2)?.textContent ?? null,
          scrollTop: scrollContainer.scrollTop,
        }
      }),
    )
    .toEqual({
      anchorOffset: -50,
      lastBubbleText: 'Bubble 3',
      scrollTop: 275,
    })
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

test('streaming 종료 시 pending append batch를 즉시 flush한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')

    if (streamingIndicator === null || transcriptRoot === null) {
      throw new Error('streaming append fixture is missing')
    }

    streamingIndicator.removeAttribute('hidden')

    const first = document.createElement('article')
    first.setAttribute('data-cgpt-transcript-bubble', '')
    first.setAttribute('style', 'display: block; height: 100px;')
    first.textContent = 'Bubble 50'

    const second = document.createElement('article')
    second.setAttribute('data-cgpt-transcript-bubble', '')
    second.setAttribute('style', 'display: block; height: 100px;')
    second.textContent = 'Bubble 51'

    ;(window as WindowWithTestState).__tailAppendNodes = [first, second]

    transcriptRoot.append(first)
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    transcriptRoot.append(second)
    await new Promise((resolve) => window.setTimeout(resolve, 200))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => ({
        detachedTailBubbleCount:
          (window as WindowWithTestState).__tailAppendNodes.filter((node) => !node.isConnected).length,
        transcriptChildCount:
          document.querySelector('[data-cgpt-transcript-root]')?.children.length ?? 0,
      })),
    )
    .toEqual({
      detachedTailBubbleCount: 0,
      transcriptChildCount: 8,
    })

  await page.evaluate(() => {
    const streamingIndicator = document.querySelector<HTMLElement>('[data-cgpt-streaming-indicator]')

    if (streamingIndicator === null) {
      throw new Error('streaming indicator fixture is missing')
    }

    streamingIndicator.setAttribute('hidden', '')
  })

  await expect
    .poll(async () =>
      page.evaluate(() => ({
        detachedTailBubbleCount:
          (window as WindowWithTestState).__tailAppendNodes.filter((node) => !node.isConnected).length,
        transcriptChildCount:
          document.querySelector('[data-cgpt-transcript-root]')?.children.length ?? 0,
      })),
    )
    .toEqual({
      detachedTailBubbleCount: 2,
      transcriptChildCount: 6,
    })
})

test('near-bottom append는 새 tail을 mount하고 exact bottom으로 따라간다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = 4800
    scrollContainer.dispatchEvent(new Event('scroll'))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
          scrollTop:
            document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 0px;',
      lastBubbleText: 'Bubble 49',
      rafCallCount: 2,
      scrollTop: 4800,
    })

  await page.evaluate(async () => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')

    if (transcriptRoot === null) {
      throw new Error('transcript root fixture is missing')
    }

    const first = document.createElement('article')
    first.setAttribute('data-cgpt-transcript-bubble', '')
    first.setAttribute('style', 'display: block; height: 100px;')
    first.textContent = 'Bubble 50'

    const second = document.createElement('article')
    second.setAttribute('data-cgpt-transcript-bubble', '')
    second.setAttribute('style', 'display: block; height: 100px;')
    second.textContent = 'Bubble 51'

    ;(window as WindowWithTestState).__tailAppendNodes = [first, second]

    transcriptRoot.append(first)
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    transcriptRoot.append(second)
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          childCount: children.length,
          detachedTailBubbleCount:
            (window as WindowWithTestState).__tailAppendNodes.filter((node) => !node.isConnected).length,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          scrollTop:
            document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
        }
      }),
    )
    .toEqual({
      childCount: 6,
      detachedTailBubbleCount: 0,
      lastBubbleText: 'Bubble 51',
      scrollTop: 5000,
    })
})

test('non-near-bottom append burst는 detached tail로 남는다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)

  await page.evaluate(async () => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')

    if (transcriptRoot === null) {
      throw new Error('transcript root fixture is missing')
    }

    const first = document.createElement('article')
    first.setAttribute('data-cgpt-transcript-bubble', '')
    first.setAttribute('style', 'display: block; height: 100px;')
    first.textContent = 'Bubble 50'

    const second = document.createElement('article')
    second.setAttribute('data-cgpt-transcript-bubble', '')
    second.setAttribute('style', 'display: block; height: 100px;')
    second.textContent = 'Bubble 51'

    ;(window as WindowWithTestState).__tailAppendNodes = [first, second]

    transcriptRoot.append(first)
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    transcriptRoot.append(second)
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          childCount: children.length,
          detachedTailBubbleCount:
            (window as WindowWithTestState).__tailAppendNodes.filter((node) => !node.isConnected).length,
          rafCallCount: (window as WindowWithTestState).__rafCallCount,
          scrollTop:
            document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4800px;',
      childCount: 6,
      detachedTailBubbleCount: 2,
      rafCallCount: 2,
      scrollTop: 0,
    })
})

test('mid-list removal은 dirty rebuild를 트리거하고 surviving anchor 위치를 복원한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)
  await scrollToTranscriptPosition(page, 400, {
    firstBubbleText: 'Bubble 2',
    lastBubbleText: 'Bubble 7',
    rafCallCount: 2,
  })

  expect(
    await page.evaluate(() => {
      const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
      const anchorBubble = (window as WindowWithTestState).__allBubbles[4]

      if (scrollContainer === null || anchorBubble === undefined) {
        throw new Error('dirty rebuild anchor fixture is missing')
      }

      return {
        anchorOffset:
          anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
        scrollTop: scrollContainer.scrollTop,
      }
    }),
  ).toEqual({
    anchorOffset: 0,
    scrollTop: 400,
  })

  await page.evaluate(() => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')
    const removedBubble = (window as WindowWithTestState).__allBubbles[3]

    if (transcriptRoot === null || removedBubble === undefined) {
      throw new Error('dirty rebuild removal fixture is missing')
    }

    transcriptRoot.removeChild(removedBubble)
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const anchorBubble = (window as WindowWithTestState).__allBubbles[4]
        const removedBubble = (window as WindowWithTestState).__allBubbles[3]
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        if (scrollContainer === null || anchorBubble === undefined) {
          throw new Error('dirty rebuild anchor fixture is missing')
        }

        return {
          anchorOffset:
            anchorBubble.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          childCount: children.length,
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
          removedConnected: removedBubble?.isConnected ?? null,
          scrollTop: scrollContainer.scrollTop,
        }
      }),
    )
    .toEqual({
      anchorOffset: 0,
      childCount: 8,
      firstBubbleText: 'Bubble 1',
      lastBubbleText: 'Bubble 7',
      removedConnected: false,
      scrollTop: 300,
    })
})

test('anchor bubble가 사라지면 dirty rebuild는 raw scrollTop fallback을 사용한다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)
  await scrollToTranscriptPosition(page, 400, {
    firstBubbleText: 'Bubble 2',
    lastBubbleText: 'Bubble 7',
    rafCallCount: 2,
  })

  await page.evaluate(() => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')
    const removedAnchor = (window as WindowWithTestState).__allBubbles[4]

    if (transcriptRoot === null || removedAnchor === undefined) {
      throw new Error('dirty rebuild fallback fixture is missing')
    }

    transcriptRoot.removeChild(removedAnchor)
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const removedAnchor = (window as WindowWithTestState).__allBubbles[4]
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        if (scrollContainer === null) {
          throw new Error('dirty rebuild fallback fixture is missing')
        }

        return {
          childCount: children.length,
          firstBubbleText: children[1]?.textContent ?? null,
          removedConnected: removedAnchor?.isConnected ?? null,
          scrollTop: scrollContainer.scrollTop,
        }
      }),
    )
    .toEqual({
      childCount: 8,
      firstBubbleText: 'Bubble 2',
      removedConnected: false,
      scrollTop: 400,
    })
})

test('dirty rebuild 뒤에도 append observer가 다시 연결된다', async ({ page }) => {
  await installFixtureRoutes(page)
  await page.goto('http://fixture.test/c/bubble-50?fixture=bubble-50')

  await expectInitialMountedWindow(page)
  await scrollToTranscriptPosition(page, 400, {
    firstBubbleText: 'Bubble 2',
    lastBubbleText: 'Bubble 7',
    rafCallCount: 2,
  })

  await page.evaluate(() => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')
    const removedBubble = (window as WindowWithTestState).__allBubbles[3]

    if (transcriptRoot === null || removedBubble === undefined) {
      throw new Error('dirty rebuild append fixture is missing')
    }

    transcriptRoot.removeChild(removedBubble)
  })

  await expect
    .poll(async () =>
      page.evaluate(() => ({
        scrollTop:
          document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')?.scrollTop ?? null,
      })),
    )
    .toEqual({
      scrollTop: 300,
    })

  await page.evaluate(async () => {
    const transcriptRoot = document.querySelector<HTMLElement>('[data-cgpt-transcript-root]')

    if (transcriptRoot === null) {
      throw new Error('dirty rebuild append fixture is missing')
    }

    const appendedBubble = document.createElement('article')
    appendedBubble.setAttribute('data-cgpt-transcript-bubble', '')
    appendedBubble.setAttribute('style', 'display: block; height: 100px;')
    appendedBubble.textContent = 'Bubble 50'

    ;(window as WindowWithTestState).__tailAppendNodes = [appendedBubble]

    transcriptRoot.append(appendedBubble)
    await new Promise((resolve) => window.setTimeout(resolve, 200))
  })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector('[data-cgpt-transcript-root]')
        const children = transcriptRoot === null ? [] : Array.from(transcriptRoot.children)

        return {
          bottomSpacerHeight: children.at(-1)?.getAttribute('style') ?? null,
          childCount: children.length,
          detachedTailBubbleCount:
            (window as WindowWithTestState).__tailAppendNodes.filter((node) => !node.isConnected).length,
        }
      }),
    )
    .toEqual({
      bottomSpacerHeight: 'height: 4300px;',
      childCount: 8,
      detachedTailBubbleCount: 1,
    })
})

function renderFixtureHtml(requestPath: string): string {
  const url = new URL(`http://fixture${requestPath}`)
  const fixture = url.searchParams.get('fixture')
  const fixtureBodies = {
    available: renderFixtureBody('available'),
    'bubble-0': renderFixtureBody('bubble-0'),
    'bubble-49': renderFixtureBody('bubble-49'),
    'bubble-50': renderFixtureBody('bubble-50'),
    'bubble-50-alt': renderFixtureBody('bubble-50-alt'),
    missing: renderFixtureBody('missing'),
  }

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
      window.__fixtureBodies = ${JSON.stringify(fixtureBodies)}
      window.__tailAppendNodes = []
      window.__replaceFixture = function replaceFixture(nextFixture) {
        document.body.innerHTML = window.__fixtureBodies[nextFixture] ?? '<main></main>'
        window.__allBubbles = Array.from(document.querySelectorAll('[data-cgpt-transcript-bubble]'))
        window.__tailAppendNodes = []
      }
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

function renderBubbles(count: number, labelPrefix = 'Bubble'): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `<article data-cgpt-transcript-bubble style="display: block; height: 100px;">${labelPrefix} ${index}</article>`,
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

  if (
    fixture === 'bubble-0' ||
    fixture === 'bubble-49' ||
    fixture === 'bubble-50' ||
    fixture === 'bubble-50-alt'
  ) {
    const count = fixture === 'bubble-0' ? 0 : fixture === 'bubble-49' ? 49 : 50
    const labelPrefix = fixture === 'bubble-50-alt' ? 'Next Bubble' : 'Bubble'

    return `
      <main data-cgpt-scroll-container style="height: 200px; overflow-y: auto;">
        <section data-cgpt-transcript-root>
          ${renderBubbles(count, labelPrefix)}
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

async function scrollToTranscriptPosition(
  page: Page,
  scrollTop: number,
  expectedWindow: {
    firstBubbleText: string
    lastBubbleText: string
    rafCallCount: number
  },
): Promise<void> {
  await page.evaluate((nextScrollTop) => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-cgpt-scroll-container]')

    if (scrollContainer === null) {
      throw new Error('scroll container fixture is missing')
    }

    scrollContainer.scrollTop = nextScrollTop
    scrollContainer.dispatchEvent(new Event('scroll'))
  }, scrollTop)

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
    .toEqual(expectedWindow)
}

interface WindowWithTestState extends Window {
  __allBubbles: HTMLElement[]
  __detachedScrollContainer?: HTMLElement
  __fixtureBodies: Record<string, string>
  __rafCallCount: number
  __replaceFixture(fixture: string): void
  __reportedMessages: unknown[]
  __tailAppendNodes: HTMLElement[]
}
