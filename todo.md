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

- [ ] Implement popup UI with:
  - [ ] On/Off toggle
  - [ ] short status line
- [ ] Implement service worker per-tab state keyed by `tabId`
- [ ] Implement popup -> worker query for current tab state
- [ ] Implement popup -> worker toggle update flow
- [ ] Implement page refresh when toggling On/Off
- [ ] Handle missing active-tab case safely
- [ ] Add tests for worker state logic

### Acceptance criteria
- [ ] Toggle state updates for active tab
- [ ] Toggling refreshes the page
- [ ] Popup can show `On`, `Off`, or `Unavailable`

---

## 3. Content-script bootstrap and availability

- [ ] Add content-script bootstrap
- [ ] Check pathname against transcript route parser
- [ ] Add centralized selector registry for:
  - [ ] scroll container
  - [ ] transcript root
  - [ ] transcript bubbles
  - [ ] streaming indicator
- [ ] Resolve availability state:
  - [ ] non-transcript route => idle
  - [ ] transcript route + selector failure => `Unavailable`
  - [ ] transcript route + selector success => available
- [ ] Wire availability reporting into popup/worker flow
- [ ] Add integration tests for bootstrap availability states

### Acceptance criteria
- [ ] Selector failure reports `Unavailable`
- [ ] Non-transcript routes do not activate
- [ ] Transcript route can reach available state

---

## 4. Transcript scanning and activation threshold

- [ ] Implement transcript scan module
- [ ] Resolve transcript root
- [ ] Collect matched transcript bubbles in DOM order
- [ ] Return scan result object with:
  - [ ] transcript root
  - [ ] bubbles array
  - [ ] bubble count
  - [ ] activation eligibility
- [ ] Enforce activation threshold at 50 matched bubbles
- [ ] Add integration tests for 0 / 49 / 50 bubble cases
- [ ] Add tests for bubble ordering

### Acceptance criteria
- [ ] 49 bubbles => inactive
- [ ] 50 bubbles => eligible
- [ ] Bubble ordering is stable and correct

---

## 5. Measurement and prefix sums

- [ ] Define `BubbleRecord`
- [ ] Add measurement wrapper using `getBoundingClientRect().height`
- [ ] Store floating-point heights
- [ ] Build prefix-sum array from BubbleRecords
- [ ] Implement suffix rebuild from changed index
- [ ] Define transcript session state shape
- [ ] Wire scan -> records -> measurement -> prefix sums
- [ ] Add unit tests for prefix sums and suffix rebuild

### Acceptance criteria
- [ ] All eligible bubbles are measured into ordered records
- [ ] Prefix sums are correct
- [ ] Suffix updates work correctly after a changed index

---

## 6. DOM patching core

- [ ] Create top spacer helper
- [ ] Create bottom spacer helper
- [ ] Implement one-shot patch function for explicit `[start, end]` range
- [ ] Compute spacer heights from prefix sums
- [ ] Build mounted middle segment in `DocumentFragment`
- [ ] Remove old mounted middle nodes
- [ ] Insert new mounted segment between spacers
- [ ] Update `BubbleRecord.mounted`
- [ ] Preserve DOM order
- [ ] Add integration tests for patching behavior

### Acceptance criteria
- [ ] Top and bottom spacers are inserted correctly
- [ ] Requested range mounts correctly
- [ ] Out-of-range nodes are detached
- [ ] Mounted DOM order is preserved

---

## 7. Scroll virtualization

- [ ] Implement binary-search range calculator
- [ ] Add overscan:
  - [ ] 1 viewport above
  - [ ] 1 viewport below
- [ ] Add current mounted range tracking
- [ ] Add cheap scroll-path boundary check
- [ ] Add `requestAnimationFrame` patch scheduler
- [ ] Prevent duplicate queued patch frames
- [ ] Run initial range computation and patch on activation
- [ ] Add unit tests for range lookup
- [ ] Add integration tests for scroll-triggered range changes

### Acceptance criteria
- [ ] Initial activation mounts the expected range
- [ ] Scroll updates mounted range when needed
- [ ] No-op scroll does not schedule unnecessary work

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
