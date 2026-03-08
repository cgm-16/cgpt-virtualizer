# TODO — ChatGPT Transcript Virtualization Extension (V1)

## Status legend
- [ ] Not started
- [x] Done
- [~] In progress
- [!] Blocked / needs decision

---

## 0. Project setup

- [x] Create MV3 extension scaffold
- [x] Add TypeScript build pipeline
- [x] Add unit test runner
- [x] Add integration/browser test runner
- [x] Add pnpm scripts for build / test / watch
- [x] Add minimal popup, service worker, and content-script entries
- [x] Verify extension loads in Chrome
- [x] Verify test harness runs cleanly

### Acceptance criteria
- [x] `pnpm run build` succeeds
- [x] `pnpm run test` succeeds
- [x] Extension can be loaded unpacked in Chrome

---

## 1. Shared contracts and constants

- [x] Define shared message contracts between popup, worker, and content script
- [x] Add shared runtime status types (`On`, `Off`, `Unavailable`)
- [x] Add transcript session identifier types
- [x] Add constants:
  - [x] activation threshold = 50 bubbles
  - [x] append quiet period = 150 ms
  - [x] near-bottom threshold = 200 px
- [x] Add pathname parser for supported transcript routes
- [x] Add conversation ID extraction from pathname
- [x] Add unit tests for route matching and conversation ID parsing

### Acceptance criteria
- [x] Valid transcript paths parse correctly
- [x] Invalid paths are rejected
- [x] Shared contracts are used by at least popup + worker

---

## 2. Popup and service worker

- [x] Implement popup UI with:
  - [x] On/Off toggle
  - [x] short status line
- [x] Implement service worker per-tab state keyed by `tabId`
- [x] Implement popup -> worker query for current tab state
- [x] Implement popup -> worker toggle update flow
- [x] Implement page refresh when toggling On/Off
- [x] Handle missing active-tab case safely
- [x] Add tests for worker state logic

### Acceptance criteria
- [x] Toggle state updates for active tab
- [x] Toggling refreshes the page
- [x] Popup can show `On`, `Off`, or `Unavailable`

---

## 3. Content-script bootstrap and availability

- [x] Add content-script bootstrap
- [x] Check pathname against transcript route parser
- [x] Add centralized selector registry for:
  - [x] scroll container
  - [x] transcript root
  - [x] transcript bubbles
  - [x] streaming indicator
- [x] Resolve availability state:
  - [x] non-transcript route => idle
  - [x] transcript route + selector failure => `Unavailable`
  - [x] transcript route + selector success => available
- [x] Wire availability reporting into popup/worker flow
- [x] Add integration tests for bootstrap availability states

### Acceptance criteria
- [x] Selector failure reports `Unavailable`
- [x] Non-transcript routes do not activate
- [x] Transcript route can reach available state

---

## 4. Transcript scanning and activation threshold

- [x] Implement transcript scan module
- [x] Resolve transcript root
- [x] Collect matched transcript bubbles in DOM order
- [x] Return scan result object with:
  - [x] transcript root
  - [x] bubbles array
  - [x] bubble count
  - [x] activation eligibility
- [x] Enforce activation threshold at 50 matched bubbles
- [x] Add integration tests for 0 / 49 / 50 bubble cases
- [x] Add tests for bubble ordering

### Acceptance criteria
- [x] 49 bubbles => inactive
- [x] 50 bubbles => eligible
- [x] Bubble ordering is stable and correct

---

## 5. Measurement and prefix sums

- [x] Define `BubbleRecord`
- [x] Add measurement wrapper using `getBoundingClientRect().height`
- [x] Store floating-point heights
- [x] Build prefix-sum array from BubbleRecords
- [x] Implement suffix rebuild from changed index
- [x] Define transcript session state shape
- [x] Wire scan -> records -> measurement -> prefix sums
- [x] Add unit tests for prefix sums and suffix rebuild

### Acceptance criteria
- [x] All eligible bubbles are measured into ordered records
- [x] Prefix sums are correct
- [x] Suffix updates work correctly after a changed index

---

## 6. DOM patching core

- [x] Create top spacer helper
- [x] Create bottom spacer helper
- [x] Implement one-shot patch function for explicit `[start, end]` range
- [x] Compute spacer heights from prefix sums
- [x] Build mounted middle segment in `DocumentFragment`
- [x] Remove old mounted middle nodes
- [x] Insert new mounted segment between spacers
- [x] Update `BubbleRecord.mounted`
- [x] Preserve DOM order
- [x] Add integration tests for patching behavior

### Acceptance criteria
- [x] Top and bottom spacers are inserted correctly
- [x] Requested range mounts correctly
- [x] Out-of-range nodes are detached
- [x] Mounted DOM order is preserved

---

## 7. Scroll virtualization

- [x] Implement binary-search range calculator
- [x] Add overscan:
  - [x] 1 viewport above
  - [x] 1 viewport below
- [x] Add current mounted range tracking
- [x] Add cheap scroll-path boundary check
- [x] Add `requestAnimationFrame` patch scheduler
- [x] Prevent duplicate queued patch frames
- [x] Run initial range computation and patch on activation
- [x] Add unit tests for range lookup
- [x] Add integration tests for scroll-triggered range changes

### Acceptance criteria
- [x] Initial activation mounts the expected range
- [x] Scroll updates mounted range when needed
- [x] No-op scroll does not schedule unnecessary work

---

## 8. Anchor model and scroll correction

- [ ] Implement anchor selection:
  - [ ] first mounted bubble intersecting viewport
- [ ] Implement anchor offset calculation
- [ ] Implement correction accumulation rules
- [ ] Handle no-anchor fallback safely
- [ ] Integrate anchor recomputation into patch frame flow
- [ ] Add unit tests for anchor math and correction logic

### Acceptance criteria
- [ ] Anchor bubble selection is correct
- [ ] Offset calculation is correct
- [ ] No-anchor case behaves safely

---

## 9. ResizeObserver integration

- [ ] Add `ResizeObserver` manager
- [ ] Observe mounted bubbles only
- [ ] Unobserve detached bubbles
- [ ] Re-measure resized mounted bubbles
- [ ] Ignore height deltas `< 1px`
- [ ] Update BubbleRecord height
- [ ] Rebuild prefix-sum suffix from changed index
- [ ] Apply anchor-preserving correction where needed
- [ ] Schedule patch if range boundaries change
- [ ] Add integration tests for resize behavior

### Acceptance criteria
- [ ] Mounted bubble resize updates state
- [ ] Detached bubbles are not observed
- [ ] Anchor-preserving correction is applied when appropriate

---

## 10. Append-only mutation handling

- [ ] Add `MutationObserver` on transcript root with `childList` only
- [ ] Validate clean append-only tail updates:
  - [ ] appended matched bubbles at transcript tail
  - [ ] no removals
  - [ ] no earlier structural edits
- [ ] Add pending append node tracking
- [ ] Add 150 ms quiet-period batching
- [ ] On valid commit:
  - [ ] append BubbleRecords
  - [ ] measure new nodes
  - [ ] extend prefix sums
- [ ] On invalid append pattern:
  - [ ] route to dirty rebuild path
- [ ] Add unit tests for append validation
- [ ] Add integration tests for append batching

### Acceptance criteria
- [ ] Clean tail appends are accepted incrementally
- [ ] Invalid append patterns are rejected
- [ ] Append bursts batch correctly

---

## 11. Near-bottom follow behavior

- [ ] Add near-bottom helper using 200 px threshold
- [ ] On append commit:
  - [ ] if near bottom => mount batch and snap to exact bottom
  - [ ] else => keep appended bubbles detached under bottom spacer
- [ ] Add tests for near-bottom detection
- [ ] Add integration tests for both append outcomes

### Acceptance criteria
- [ ] Near-bottom appends follow the bottom
- [ ] Non-near-bottom appends remain detached
- [ ] Bottom spacer reflects detached appended content correctly

---

## 12. Streaming behavior

- [ ] Add exact-selector-based streaming detection
- [ ] While streaming:
  - [ ] pause mount/unmount
  - [ ] keep resize handling active
  - [ ] keep anchor correction active
  - [ ] keep append batches pending
- [ ] Add inline informational placeholder for scrolling into unmounted region during streaming
- [ ] On streaming end:
  - [ ] clear placeholder
  - [ ] fold pending append batch into immediate recompute-and-patch
- [ ] Add integration tests for streaming pause behavior

### Acceptance criteria
- [ ] Mount/unmount pauses during streaming
- [ ] Resize updates still apply during streaming
- [ ] Placeholder appears when needed
- [ ] Pending appends commit after streaming ends

---

## 13. Dirty rebuild coordinator

- [ ] Implement full rebuild coordinator
- [ ] Trigger rebuild for:
  - [ ] mid-thread edits
  - [ ] rewrite/regenerate flows
  - [ ] invalid append validation
  - [ ] unsafe structural transcript changes
- [ ] Rebuild flow must:
  - [ ] capture anchor if possible
  - [ ] disconnect observers
  - [ ] discard detached cache
  - [ ] discard BubbleRecords and measurements
  - [ ] rescan live transcript DOM
  - [ ] remeasure all bubbles
  - [ ] rebuild prefix sums
  - [ ] restore scroll via surviving anchor node when possible
  - [ ] otherwise fall back to raw `scrollTop`
  - [ ] recreate observers
- [ ] Add integration tests for rebuild scenarios

### Acceptance criteria
- [ ] Dirty rebuild restores a valid transcript session
- [ ] Surviving anchor restores position when possible
- [ ] Fallback to raw `scrollTop` works safely

---

## 14. SPA navigation and session reset

- [ ] Patch `history.pushState`
- [ ] Patch `history.replaceState`
- [ ] Listen for `popstate`
- [ ] Re-run pathname parsing on navigation events
- [ ] Detect conversation ID changes
- [ ] On conversation ID change:
  - [ ] fully destroy old session state
  - [ ] disconnect observers
  - [ ] discard cache and measurements
  - [ ] initialize new session from scratch
- [ ] Stay idle on non-transcript routes
- [ ] Add integration tests for navigation/session reset

### Acceptance criteria
- [ ] Conversation ID change triggers full session reset
- [ ] Same conversation ID does not trigger destructive reset
- [ ] Non-transcript routes stay idle

---

## 15. Failure handling and unavailable mode

- [ ] Implement startup selector failure => `Unavailable`
- [ ] Implement mid-session selector failure => stop virtualization + go inert
- [ ] Keep content script inert until refresh or navigation after selector failure
- [ ] Wire `Unavailable` status into popup
- [ ] Add regression tests for unavailable behavior

### Acceptance criteria
- [ ] Selector failure is surfaced clearly
- [ ] Virtualization stops safely on mid-session failure
- [ ] Popup reflects `Unavailable`

---

## 16. Memory guard

- [ ] Add detached-cache pressure heuristic
- [ ] Define internal safety threshold
- [ ] On threshold exceeded:
  - [ ] disable virtualization for the tab
  - [ ] trigger restore-through-refresh behavior
- [ ] Add tests for memory guard path

### Acceptance criteria
- [ ] Memory guard can be triggered in tests
- [ ] Trigger path disables virtualization safely
- [ ] Restore-through-refresh path is wired

---

## 17. Regression and performance coverage

- [ ] Add regression tests for:
  - [ ] selector failure
  - [ ] memory guard
  - [ ] unavailable popup state
  - [ ] on/off toggle flow
  - [ ] dirty rebuild after unsafe mutation
  - [ ] streaming resume path
- [ ] Add performance/debug instrumentation hooks
- [ ] Add at least one assertion around mounted window size / mounted bubble count
- [ ] Run full test suite cleanly

### Acceptance criteria
- [ ] Full test suite passes
- [ ] Mounted window remains bounded as expected
- [ ] Debug instrumentation can be enabled in development

---

## 18. Final manual validation

- [ ] Load unpacked extension in Chrome
- [ ] Verify popup toggle behavior on ChatGPT tab
- [ ] Verify non-transcript pages remain idle
- [ ] Verify long transcript activates virtualization
- [ ] Verify scrolling remains stable
- [ ] Verify appended content behaves correctly near bottom and away from bottom
- [ ] Verify streaming pause behavior manually
- [ ] Verify refresh restores cleanly when toggled
- [ ] Verify selector-failure handling strategy in a controlled dev scenario

### Ship checklist
- [ ] Build is reproducible
- [ ] Tests pass locally
- [ ] No orphaned modules
- [ ] No dead message contracts
- [ ] Logging is gated behind debug mode
- [ ] README/setup notes added
