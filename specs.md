Below is a pragmatic build plan based on the V1 spec we locked. I sized the steps around the actual platform constraints: content scripts run in an isolated world by default, `requestAnimationFrame()` is the right place for repaint-adjacent patching, `ResizeObserver` is the browser primitive for element size changes, `MutationObserver` can watch append-only child-list changes, and moving original nodes with `appendChild()` / `insertBefore()` preserves the original node objects rather than cloning them. Chrome also warns that MV3 service worker globals are lost when the worker shuts down, so the popup state model should be treated as lightweight unless you later move it to `chrome.storage.session`. Overscan is worth adding because virtualized lists can otherwise flash empty space during fast scrolls. ([Chrome for Developers][1])

# 1. Build blueprint

## 1.1 Product target

Build a Chrome MV3 extension that virtualizes only the main ChatGPT transcript by:

* indexing top-level transcript bubbles,
* measuring them,
* replacing offscreen regions with one top spacer and one bottom spacer,
* keeping one mounted middle segment with overscan,
* remounting the original DOM nodes as bubbles re-enter range,
* handling clean tail appends incrementally,
* and rebuilding aggressively on ambiguity.

## 1.2 Engineering principles

1. **DOM is the source of truth.** Do not infer hidden app state.
2. **Move original nodes only.** Do not clone or re-render transcript bubbles.
3. **Fail closed.** If selectors break, mark unavailable and stop.
4. **Small hot-path work.** Scroll event should only do cheap checks; heavy DOM patching goes through `requestAnimationFrame()`. ([MDN][2])
5. **Use platform observers.** `ResizeObserver` for mounted size drift, `MutationObserver` for append-only child-list changes. ([MDN][3])
6. **Prefer rebuild over risky incremental logic.**
7. **Test pure logic separately from DOM behavior.**

## 1.3 Architecture

Three runtime pieces:

* **Content script**

  * transcript detection
  * selector resolution
  * indexing and measurement
  * range calculation
  * DOM patching
  * resize handling
  * append handling
  * streaming pause
  * rebuild logic
  * navigation/session change handling

* **Service worker**

  * per-tab toggle state
  * popup messaging
  * refresh trigger requests

* **Popup**

  * On/Off toggle
  * short status line

## 1.4 Suggested repo structure

```text
extension/
  manifest.json
  src/
    background/
      service-worker.ts
    content/
      index.ts
      bootstrap.ts
      selectors.ts
      session.ts
      state.ts
      transcript-scan.ts
      measure.ts
      prefix-sums.ts
      range.ts
      anchor.ts
      patch.ts
      resize.ts
      append.ts
      streaming.ts
      rebuild.ts
      navigation.ts
      placeholder.ts
      memory-guard.ts
    popup/
      popup.html
      popup.ts
      popup.css
    shared/
      messages.ts
      constants.ts
      types.ts
      utils.ts
  tests/
    unit/
    integration/
    e2e/
```

## 1.5 Test strategy

Use three layers from day one:

* **Unit tests**

  * prefix sums
  * binary search range lookup
  * anchor math
  * append batch validation
  * near-bottom checks
  * conversation path parsing

* **Integration tests**

  * synthetic transcript DOM fixtures
  * spacer insertion
  * patch results
  * remount order
  * resize correction behavior
  * dirty rebuild transitions

* **E2E tests**

  * extension loads
  * popup toggles work
  * transcript detection works on a controlled fixture page
  * later, limited manual validation on ChatGPT itself

This split matters because `getBoundingClientRect()` and scroll/layout behavior are browser-layout concerns, while range math and append validation are pure logic. MDN documents `getBoundingClientRect()` as viewport-relative layout data, and `pushState()` / `popstate` as session-history navigation primitives, which is why browser-level tests are still needed around those edges. ([MDN][4])

---

# 2. Chunking passes

## 2.1 First-pass chunks

A natural first pass gives these large milestones:

1. Extension scaffolding
2. Popup + background state
3. Transcript detection
4. Bubble indexing + measurement
5. Range calculation + spacers
6. Scroll-driven virtualization
7. Resize anchoring
8. Append batching
9. Streaming pause
10. Dirty rebuild + navigation
11. Hardening + performance

These are still too large for safe codegen.

## 2.2 Second-pass chunks

Break those down into smaller slices that each:

* add one new capability,
* integrate with existing code,
* and end in a testable state.

Final right-sized sequence:

1. Scaffold extension, build tooling, and test harness
2. Add shared constants, message contracts, and path parsing
3. Add popup and service worker toggle flow
4. Add content-script bootstrap and availability reporting
5. Add transcript scanning and 50-bubble activation threshold
6. Add measurement and prefix-sum math
7. Add spacer primitives and one-shot mounted-window patching
8. Add scroll scheduling and binary-search range updates
9. Add anchor math and scroll correction
10. Add `ResizeObserver` integration
11. Add append-only `MutationObserver` batching
12. Add near-bottom follow behavior
13. Add streaming pause and placeholder behavior
14. Add dirty rebuild coordinator
15. Add SPA navigation/session reset
16. Add memory guard, unavailable mode hardening, and final regression/perf coverage

That sequence is small enough to test strongly and big enough to move the project every step.

---

# 3. Final implementation sequence

## Step 1 — Scaffolding and test harness

Deliver a loadable MV3 extension skeleton, TypeScript build, unit test runner, and one browser integration test target.

## Step 2 — Shared contracts

Define message types, constants, pathname regex, and common data types.

## Step 3 — Popup and worker

Add per-tab On/Off preference flow and page refresh behavior.

## Step 4 — Content bootstrap

Detect transcript pages, resolve selectors, and report `On` / `Off` / `Unavailable`.

## Step 5 — Transcript scanning

Find transcript root, find bubbles, enforce 50-bubble activation threshold.

## Step 6 — Measurement core

Measure bubble heights, store ordered bubble records, build prefix sums.

## Step 7 — DOM patch core

Insert top/bottom spacers and patch one mounted middle segment.

## Step 8 — Scroll virtualization

Add cheap scroll handler + rAF scheduler + binary-search visible range.

## Step 9 — Anchor model

Choose anchor bubble, compute offset, and apply correction rules.

## Step 10 — Resize handling

Observe mounted bubbles and update heights + correction safely.

## Step 11 — Append batching

Watch clean tail appends, batch for 150 ms, validate incremental path.

## Step 12 — Bottom follow

If within 200 px of bottom, mount new batch and snap to bottom; otherwise keep detached.

## Step 13 — Streaming mode

Pause mount/unmount during streaming, keep height updates, show placeholder in gaps.

## Step 14 — Dirty rebuild

Full rebuild on edits, rewrites, append validation failure, or structural ambiguity.

## Step 15 — Navigation reset

Patch `pushState` / `replaceState`, listen for `popstate`, destroy and re-init on conversation ID change. ([MDN][5])

## Step 16 — Hardening

Selector-failure inert mode, memory safety guard, regression tests, performance assertions.

---

# 4. Prompt pack for a code-generation LLM

Each prompt below assumes the previous one has already been implemented and committed. Each one ends in a fully wired, testable state. Every prompt is intentionally explicit about integration so there is no orphaned code.

## Prompt 1 — Scaffold the extension and test harness

```text
You are implementing Step 1 of a Chrome MV3 extension project.

Project goal:
Build a Chrome extension that virtualizes the main ChatGPT transcript. This first step must only create the scaffolding, build pipeline, and test harness. Do not implement virtualization logic yet.

Requirements:
1. Create a minimal MV3 extension skeleton with:
   - manifest.json
   - content script entry
   - service worker entry
   - popup entry
2. Use TypeScript throughout.
3. Add a build setup suitable for extension development.
4. Add unit test setup.
5. Add one browser/integration test setup.
6. Add pnpm scripts for:
   - build
   - dev/build-watch if reasonable
   - test
   - test:unit
   - test:integration
7. Keep the runtime code minimal but valid:
   - content script logs a harmless bootstrap message
   - service worker initializes cleanly
   - popup renders a placeholder UI

Implementation constraints:
- Keep the structure aligned to this target:
  - src/background
  - src/content
  - src/popup
  - src/shared
  - tests/unit
  - tests/integration
- Prefer Vitest for unit tests.
- Prefer Playwright for integration tests if you need a browser layer.
- Keep code simple and heavily typed.
- No unused abstractions.

Testing:
- Add at least one unit test that proves the test runner is working.
- Add at least one integration/browser test that proves the browser harness is wired.
- Ensure all tests pass.

Output:
- Implement the code
- Show the resulting file tree
- Explain the chosen tooling briefly
- Show how to run build and test
```

## Prompt 2 — Add shared contracts and pathname parsing

```text
You are implementing Step 2 of the project.

Current state:
- MV3 extension skeleton exists
- TypeScript build works
- Unit and integration test harnesses are wired

Goal:
Add shared contracts and core constants for the virtualization project, without adding DOM virtualization behavior yet.

Requirements:
1. Create strongly typed shared message contracts between popup, service worker, and content script.
2. Add shared constants for:
   - activation threshold = 50 bubbles
   - append quiet period = 150 ms
   - near-bottom threshold = 200 px
3. Add a pathname parser module that:
   - accepts a pathname string
   - determines whether it matches the supported ChatGPT transcript route
   - extracts the conversation ID if it matches
4. Keep this parser pure and unit-testable.
5. Add shared types for:
   - popup status
   - extension runtime availability
   - transcript session identifiers
6. Wire the parser and constants into a small bootstrap usage point so they are not orphaned.

Implementation constraints:
- Keep all pure logic in src/shared or another clearly reusable location.
- No DOM dependencies in the route parser.
- Add clear type names and avoid `any`.

Testing:
- Add unit tests for:
  - matching valid transcript paths
  - rejecting invalid paths
  - extracting conversation IDs correctly
  - constants availability
- Keep integration tests passing.

Output:
- Implement the code
- Show the new shared API surface
- Summarize test coverage added in this step
```

## Prompt 3 — Implement popup and service worker toggle flow

```text
You are implementing Step 3 of the project.

Current state:
- Extension scaffold exists
- Shared message contracts and route parsing exist

Goal:
Implement the popup and service worker toggle flow for a per-tab On/Off preference, including page refresh behavior.

Requirements:
1. Popup must show:
   - a single On/Off toggle
   - a short status line
2. Service worker must:
   - store per-tab preference in memory keyed by tabId
   - answer popup queries for current tab state
   - accept toggle changes from popup
3. Toggling On or Off must trigger a refresh of the active tab.
4. Content script does not need real virtualization yet, but the popup-service worker flow must be fully functional.
5. Define a minimal status model:
   - On
   - Off
   - Unavailable
6. Use the shared message contracts from earlier steps.

Implementation constraints:
- Keep service worker logic small and explicit.
- Do not add persistent storage yet.
- Handle missing active-tab cases safely.
- Do not leave dead messaging code.

Testing:
- Add unit tests for the service worker state container logic if you isolate it.
- Add an integration test for popup <-> worker message flow where practical.
- Keep previous tests passing.

Output:
- Implement the code
- Explain message flow between popup and worker
- List any assumptions made for active-tab handling
```

## Prompt 4 — Add content-script bootstrap and availability reporting

```text
You are implementing Step 4 of the project.

Current state:
- Popup and worker toggle flow exists
- Shared route parsing exists

Goal:
Implement the content-script bootstrap layer that determines whether the current page is a supported transcript page and reports basic availability/state back to the extension flow.

Requirements:
1. Content script should:
   - inspect window.location.pathname
   - use the shared route parser
   - decide whether the page is a candidate transcript page
2. Add a selector registry module with placeholder exact selectors for:
   - scroll container
   - transcript root
   - transcript bubbles
   - streaming indicator
3. Implement a bootstrap status resolver that can report:
   - Off
   - On
   - Unavailable
4. For now:
   - if the route does not match, remain idle
   - if the route matches but required selectors do not match, report Unavailable
   - if the route matches and selectors match, report On-capable
5. Wire this state to the popup through existing messaging paths.

Implementation constraints:
- Keep selector access centralized.
- Do not implement virtualization yet.
- Structure bootstrap so later steps can extend it rather than replace it.

Testing:
- Add integration tests around:
  - matching route + missing selectors => Unavailable
  - non-transcript route => idle/no activation
- Add unit tests for selector resolution helpers if they are pure enough.

Output:
- Implement the code
- Show how availability is derived
- Note where exact selectors need to be filled in for real-world use
```

## Prompt 5 — Add transcript scanning and activation threshold

```text
You are implementing Step 5 of the project.

Current state:
- Content script can detect transcript-route eligibility
- Selector registry exists
- Popup and worker flow exists

Goal:
Implement transcript scanning and the activation threshold logic.

Requirements:
1. Add a transcript scan module that:
   - resolves transcript root
   - collects all matched transcript bubble elements in DOM order
2. Enforce activation threshold:
   - activate virtualization only if matched bubble count >= 50
3. Expose a clean scan result object with:
   - transcriptRoot
   - bubbles[]
   - bubbleCount
   - activationEligible
4. Wire this into content bootstrap so the content script can distinguish:
   - route matched but not enough bubbles
   - route matched and enough bubbles
5. Do not add spacers or mutation yet.
6. Keep the result strongly typed and reusable.

Implementation constraints:
- Bubble order must be explicit and stable for later indexing.
- Avoid hidden singleton state; pass scan results explicitly.
- Keep it easy to unit test with synthetic DOM fixtures.

Testing:
- Add integration tests with synthetic transcript fixtures for:
  - 0 bubbles
  - 49 bubbles
  - 50 bubbles
  - correct bubble ordering
- Keep prior tests passing.

Output:
- Implement the code
- Show the scan result type
- Explain how activation threshold now affects runtime behavior
```

## Prompt 6 — Add measurement and prefix-sum math

```text
You are implementing Step 6 of the project.

Current state:
- Transcript scanning exists
- Activation threshold exists

Goal:
Implement ordered bubble records, initial measurement, and prefix-sum support.

Requirements:
1. Introduce a BubbleRecord type that stores:
   - internal index/id
   - original node reference
   - measuredHeight
   - mounted
   - pinned
2. Add a measurement module that:
   - measures a bubble with getBoundingClientRect().height
   - returns floating-point heights
3. Add a prefix-sum module that:
   - builds cumulative heights from BubbleRecords
   - supports rebuilding from scratch
   - supports updating from a changed index onward
4. Add a session-state structure for the transcript model.
5. Wire scanning -> bubble records -> measurement -> prefix sums into content bootstrap for eligible transcripts.
6. No DOM patching yet.

Implementation constraints:
- Keep measurement isolated behind a tiny function.
- Prefix-sum logic must be pure and unit-tested.
- Do not use magic numbers other than constants.

Testing:
- Add unit tests for:
  - prefix-sum generation
  - suffix rebuild from changed index
  - measurement wrapper behavior with mocked DOMRects
- Add integration tests that confirm records are created in correct order and measured into state.

Output:
- Implement the code
- Show the key state shape
- Summarize what is now ready for actual virtualization
```

## Prompt 7 — Add spacers and one-shot mounted-window patching

```text
You are implementing Step 7 of the project.

Current state:
- Bubble records exist
- Measurements and prefix sums exist
- No actual virtualization patching yet

Goal:
Implement the DOM patch core:
- one top spacer
- one bottom spacer
- one mounted middle segment
- one-shot patching for an explicitly supplied range

Requirements:
1. Add creation helpers for top and bottom spacers.
2. Add a patch function that:
   - accepts a target [start, end] mounted range
   - computes top and bottom spacer heights from prefix sums
   - rebuilds the mounted middle segment in a DocumentFragment
   - removes old mounted middle nodes
   - inserts the new mounted segment between spacers
3. Bubble nodes must be moved, not cloned.
4. Update BubbleRecord.mounted flags accordingly.
5. Add a small bootstrap integration path that can run one initial patch for testing purposes.

Implementation constraints:
- Keep the patch function deterministic.
- Ensure order is preserved.
- Use original nodes only.

Testing:
- Add integration tests that verify:
  - spacers are inserted
  - correct nodes are mounted for a requested range
  - off-range nodes are detached
  - DOM order is preserved
- Add unit tests for spacer height calculation if separated.

Output:
- Implement the code
- Explain the patch algorithm
- Show how original node reuse is preserved
```

## Prompt 8 — Add scroll scheduling and binary-search range updates

```text
You are implementing Step 8 of the project.

Current state:
- One-shot patching exists
- Prefix sums exist
- No live scroll-driven virtualization yet

Goal:
Add scroll-driven virtualization with a cheap scroll-path check and rAF-based patching.

Requirements:
1. Add a range calculator that:
   - takes scrollTop, viewportHeight, overscanTopPx, overscanBottomPx
   - uses binary search on prefix sums
   - returns target mounted [start, end]
2. Add overscan:
   - 1 viewport above
   - 1 viewport below
3. Add a scroll scheduler:
   - cheap check in the scroll event
   - queue actual patching in requestAnimationFrame
4. Track current mounted range in state.
5. On first activation, compute initial range and patch it.
6. Ensure no duplicate rAF jobs are queued at once.

Implementation constraints:
- Keep the scroll event handler very small.
- Put heavy work in the scheduled frame.
- Use constants for overscan policy.

Testing:
- Add unit tests for:
  - binary-search range lookup
  - overscan-adjusted range results
- Add integration tests for:
  - initial patch on activation
  - scroll causing range changes
  - no-op scroll when range does not change

Output:
- Implement the code
- Explain the scheduler and range lookup
- Show how this integrates with the existing patch function
```

## Prompt 9 — Add anchor math and scroll correction

```text
You are implementing Step 9 of the project.

Current state:
- Scroll-driven range patching exists
- Mounted range updates are working

Goal:
Add anchor selection and anchor-based scroll correction primitives.

Requirements:
1. Add an anchor module that:
   - finds the first mounted bubble intersecting the viewport
   - computes the stored anchor offset
2. Add correction helpers that:
   - accumulate scroll delta for size changes above the anchor
   - ignore size changes below the anchor
3. Do not wire ResizeObserver yet; just build the anchor and correction primitives and integrate them into the patch frame flow where appropriate.
4. Ensure the system behaves safely when no valid anchor exists.

Implementation constraints:
- Keep anchor selection logic explicit and testable.
- Avoid direct dependence on unrelated state.
- No ResizeObserver in this step.

Testing:
- Add unit tests for:
  - anchor selection from synthetic rects
  - offset calculation
  - correction accumulation rules
  - no-anchor fallback
- Add integration tests for a simple patch flow that recomputes anchor information.

Output:
- Implement the code
- Explain the anchor model
- Show where ResizeObserver will hook in next
```

## Prompt 10 — Add ResizeObserver integration

```text
You are implementing Step 10 of the project.

Current state:
- Anchor primitives exist
- Scroll scheduling and patching exist

Goal:
Add ResizeObserver on mounted bubbles only, and wire size changes into height cache updates, prefix-sum updates, and anchor-preserving correction.

Requirements:
1. Add a ResizeObserver manager that:
   - observes mounted bubbles only
   - unobserves detached bubbles
2. On resize callback:
   - remeasure the target
   - ignore changes < 1 px
   - update BubbleRecord height
   - rebuild prefix sums from changed index onward
   - accumulate anchor correction when applicable
3. Schedule any needed patch/range recalculation after size updates.
4. Ensure observer lifecycle stays in sync with the mounted window.

Implementation constraints:
- Keep observer registration logic centralized.
- Avoid observing detached nodes.
- Prevent resize loops as much as practical.

Testing:
- Add unit tests for the “ignore delta < 1 px” rule and prefix-sum update logic.
- Add integration tests for:
  - mounted bubble resize updates state
  - detached bubble is not observed
  - anchor-preserving correction path is exercised

Output:
- Implement the code
- Explain observer lifecycle and resize update flow
- Confirm how mounted-only observation is enforced
```

## Prompt 11 — Add append-only MutationObserver batching

```text
You are implementing Step 11 of the project.

Current state:
- Scroll virtualization and ResizeObserver integration exist

Goal:
Add append-only transcript synchronization using MutationObserver on the transcript root with childList-only watching.

Requirements:
1. Add a MutationObserver on the transcript root with childList monitoring only.
2. Accept incremental append-only updates only when:
   - one or more new matched bubbles are added at the very end
   - there are no removals
   - no earlier structural changes are detected
3. Batch valid appends behind a 150 ms quiet timer.
4. Store pending appended node references in order.
5. On batch commit:
   - append BubbleRecords
   - measure them
   - extend prefix sums
   - update state cleanly
6. If validation fails, do not guess; hand off to a later dirty rebuild path.

Implementation constraints:
- Keep append validation explicit.
- Do not silently accept ambiguous mutations.
- Observer must be easy to disconnect and recreate later.

Testing:
- Add unit tests for append validation logic.
- Add integration tests for:
  - clean tail append accepted
  - removal causes rejection
  - non-tail insertion causes rejection
  - quiet timer batching combines bursts

Output:
- Implement the code
- Explain append validation and batching
- Show how pending appends are represented in state
```

## Prompt 12 — Add near-bottom follow behavior

```text
You are implementing Step 12 of the project.

Current state:
- Clean append batching exists
- Pending append batches can be committed

Goal:
Implement near-bottom behavior for append commits.

Requirements:
1. Add a helper that determines whether the viewport is within 200 px of the transcript bottom.
2. On append batch commit:
   - if within 200 px of bottom:
     - mount the new append batch into the active window
     - snap the viewport to the exact bottom
   - otherwise:
     - keep appended bubbles detached under the bottom spacer
3. Keep this behavior integrated with the existing range and patch flow.
4. Do not add a “new messages below” indicator in this step.

Implementation constraints:
- Near-bottom check should be explicit and unit-testable.
- Bottom snap should happen only in the near-bottom case.
- Preserve consistency with existing patch scheduling.

Testing:
- Add unit tests for near-bottom detection.
- Add integration tests for:
  - append while near bottom => bottom follow
  - append while not near bottom => detached under spacer
  - bottom spacer reflects appended content when not followed

Output:
- Implement the code
- Explain the near-bottom decision path
- Show where append commit now diverges by viewport position
```

## Prompt 13 — Add streaming pause and placeholder behavior

```text
You are implementing Step 13 of the project.

Current state:
- Append batching and near-bottom behavior exist
- Virtualization is active during normal operation

Goal:
Add streaming-aware pause behavior.

Requirements:
1. Add exact-selector-based streaming detection.
2. While streaming is active:
   - pause mount/unmount changes
   - keep ResizeObserver-driven height updates active
   - keep anchor correction active
   - keep appends pending instead of committing them
3. If the user scrolls into an unmounted region while streaming:
   - show a small inline informational placeholder at the edge of the mounted region
4. When streaming ends:
   - clear the placeholder
   - fold pending appends into the immediate next recompute-and-patch

Implementation constraints:
- Keep streaming state centralized.
- Do not guess if the selector is missing; follow the current spec.
- Placeholder should be purely informational.

Testing:
- Add integration tests for:
  - mount/unmount pause while streaming
  - resize updates still applying while streaming
  - placeholder appearing when needed
  - pending append batch committing after streaming ends

Output:
- Implement the code
- Explain how streaming gates patch behavior
- Show how pending appends are resumed after streaming
```

## Prompt 14 — Add dirty rebuild coordinator

```text
You are implementing Step 14 of the project.

Current state:
- Incremental append path exists
- Streaming path exists

Goal:
Add a full dirty rebuild coordinator for ambiguous or unsafe transcript changes.

Requirements:
1. Add a rebuild coordinator that can be triggered for:
   - mid-thread edits
   - rewrite/regenerate flows
   - invalid pending append validation
   - structural transcript mutations that are not safe tail appends
2. Rebuild flow must:
   - capture current anchor if possible
   - disconnect observers
   - discard detached cache
   - discard BubbleRecords and measurements
   - rescan live transcript DOM
   - remeasure all bubbles
   - rebuild prefix sums
   - restore scroll position from anchor if the same DOM node survives
   - otherwise fall back to raw scrollTop
   - recreate observers
3. Wire rebuild into already-existing mutation failure paths.

Implementation constraints:
- Rebuild must be destructive and simple, not incremental.
- Keep observer disconnect/reconnect explicit.
- Do not attempt branch-aware transcript modeling.

Testing:
- Add integration tests for:
  - dirty rebuild after synthetic mid-list mutation
  - anchor restoration when original node survives
  - fallback to raw scrollTop when anchor node does not survive
  - observers being reattached after rebuild

Output:
- Implement the code
- Explain rebuild phases and state reset
- Show all trigger points currently wired into rebuild
```

## Prompt 15 — Add SPA navigation/session reset

```text
You are implementing Step 15 of the project.

Current state:
- Dirty rebuild logic exists
- Transcript session state exists

Goal:
Add session reset on SPA navigation when the conversation ID changes.

Requirements:
1. Patch history.pushState and history.replaceState.
2. Listen for popstate.
3. Re-run pathname parsing when navigation signals occur.
4. If the conversation ID changes:
   - fully destroy old virtualization state
   - disconnect transcript observers
   - discard detached cache and measurements
   - initialize the new session from scratch
5. If the new path is not a supported transcript path:
   - stay idle until another path change occurs

Implementation constraints:
- Keep global navigation hooks centralized.
- Avoid duplicate patching of history methods.
- Ensure destroy/init ordering is safe.

Testing:
- Add integration tests for:
  - conversation ID change resets session
  - non-transcript route disables active virtualization
  - same conversation ID does not trigger destructive reinit
- Keep all earlier tests passing.

Output:
- Implement the code
- Explain navigation hook installation
- Show the session reset lifecycle
```

## Prompt 16 — Hardening, memory guard, and final test coverage

```text
You are implementing Step 16 of the project.

Current state:
- Core virtualization, append handling, streaming, rebuilds, and navigation all exist

Goal:
Harden the implementation for V1 and finish the test plan.

Requirements:
1. Add selector-failure inert behavior:
   - startup failure => Unavailable
   - mid-session failure => stop virtualization and remain inert until refresh/navigation
2. Add a memory guard:
   - estimate detached-cache pressure using a simple internal heuristic
   - when threshold is exceeded:
     - disable virtualization for the tab
     - trigger restore-through-refresh path according to the spec
3. Add final popup status wiring for Unavailable.
4. Add regression tests covering:
   - selector failure
   - memory guard path
   - unavailable state in popup
   - full on/off toggle flow
5. Add lightweight performance instrumentation hooks or debug logging points that can be enabled in development.

Implementation constraints:
- Keep the memory guard heuristic simple and explicit.
- Do not add persistence beyond the current design.
- Do not introduce heuristic selector recovery in V1.

Testing:
- Add the regression tests above.
- Add at least one performance-oriented integration test or assertion around mounted bubble count/window size.
- Ensure the whole test suite passes.

Output:
- Implement the code
- Summarize the final runtime behavior
- Provide a checklist of what is complete vs what remains future work
```

---

# 5. Suggested implementation notes for the developer

A few pragmatic notes before coding:

* Use synthetic DOM fixtures heavily for transcript integration tests. It will save time and reduce brittleness.
* Keep selector definitions in exactly one module.
* Keep range math pure and separately tested.
* Treat rebuild as the “safety escape hatch,” not a failure.
* Avoid over-abstracting until after Step 10 or later.
* Keep debug logging behind a flag from the beginning.

If you want, I can turn this next into a **checklist version for a human developer** or a **single consolidated master prompt plus these step prompts**.

[1]: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts?utm_source=chatgpt.com "Manifest - content scripts  |  Chrome Extensions  |  Chrome for Developers"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame?utm_source=chatgpt.com "Window: requestAnimationFrame() method - Web APIs | MDN"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver?utm_source=chatgpt.com "ResizeObserver - Web APIs | MDN"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect?utm_source=chatgpt.com "Element: getBoundingClientRect() method - Web APIs | MDN"
[5]: https://developer.mozilla.org/docs/Web/API/History/pushState?utm_source=chatgpt.com "History: pushState() method - Web APIs | MDN"
