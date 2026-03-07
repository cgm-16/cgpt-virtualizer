Here is the locked **final v1 spec**.

## Goal

Build a Chrome extension that virtualizes **only the main ChatGPT transcript** by moving offscreen transcript bubbles out of the live DOM while preserving scroll position and restoring the **original DOM nodes** when those bubbles come back into view. Chrome content scripts can modify page DOM, but they run in an isolated world from the page’s own JavaScript. ([Chrome for Developers][1])

## Core model

V1 uses a **single mounted window**:

* one **top spacer**
* one **mounted middle segment**
* one **bottom spacer**

There is **no pinned tail cluster**. The earlier “newest 10 always mounted” rule is removed.

Transcript units are **top-level matched bubble elements**.

Detached bubbles are stored as the **original node objects**, not clones and not reconstructed HTML. That works because `appendChild()` moves an existing node rather than copying it, and a `DocumentFragment` also moves its contents into place when appended. ([MDN 웹 문서][2])

## Activation

V1 does **not** activate on every tiny transcript.

It activates only when the transcript reaches a **minimum length threshold**, set to:

* **50 matched bubbles**

Below that, the extension stays inactive.

## Selector philosophy

V1 is intentionally strict:

* **exact ChatGPT selectors only**
* no heuristic fallback
* if selectors fail, virtualization is treated as unavailable

This is a fail-closed design.

## Scroll / virtualization behavior

V1 uses a pragmatic hybrid model:

* scroll event does a **cheap range/boundary check**
* actual DOM patching happens in **`requestAnimationFrame`**
* mounted range includes **1 viewport of overscan above and below**

`requestAnimationFrame()` is meant for scheduling work before the next repaint, which is why it is the right place for the heavier patch step. ([MDN 웹 문서][3])

Visible heights are measured with `getBoundingClientRect().height`, which returns size and viewport-relative position information. ([MDN 웹 문서][4])

Height cache rules:

* keep floating-point heights
* update a cached height only if it changed by **at least 1 px**
* maintain prefix sums / cumulative offsets
* use binary search for range lookup

## Resize handling

V1 uses **`ResizeObserver` on mounted bubbles only**. `ResizeObserver` is designed to report changes to an element’s dimensions. ([MDN 웹 문서][5])

If a mounted bubble changes height:

* update cached height
* update prefix sums
* preserve the user’s reading position via anchor-aware scroll correction when needed

Anchor rule:

* anchor bubble = **first mounted bubble intersecting the viewport**
* anchor offset = distance from **viewport top** to **bubble top**

If no valid anchor exists, no anchor-based correction is applied.

## Append-only sync

V1 supports **incremental sync only for clean tail appends**.

Detection:

* one `MutationObserver` on the transcript root
* watch **`childList` only**
* incremental update is valid only when **one or more new matched bubbles are added at the very end**
* **no removals**
* anything else is dirty

`MutationObserver.observe()` with `childList` is the browser primitive for watching child additions/removals. ([MDN 웹 문서][6])

Append batching:

* batch end-appends with a **150 ms quiet period**
* if the user is within **200 px of bottom**, mount the batch and snap back to the **exact bottom**
* otherwise leave the new bubbles detached under the bottom spacer
* no “new messages below” indicator in v1

## Dirty rebuild boundary

V1 rebuilds aggressively when uncertain.

A **full rebuild** happens for:

* mid-thread prompt edits
* regenerate / rewrite flows
* invalid pending append batch after streaming
* conversation/session change
* any transcript mutation that is not an exact clean tail append

Full rebuild behavior:

* discard all old detached nodes
* discard all cached measurements
* rescan from the current live transcript DOM
* preserve position using the anchor if the same DOM node still exists
* otherwise fall back to raw `scrollTop`

After rebuild:

* recreate the append observer fresh on the rebuilt transcript root

## Streaming behavior

While ChatGPT is streaming:

* **pause mount/unmount**
* keep `ResizeObserver` / height updates active
* keep anchor-preserving scroll corrections active
* if the user scrolls into an unmounted region, show a small inline informational placeholder at the edge of the mounted region

When streaming ends:

* immediately recompute
* immediately patch in the next scheduled pass
* fold any pending append batch into that same post-streaming update

V1 uses an **exact streaming-state selector**. If that selector breaks, streaming is treated as **not streaming**.

## Interaction safety

V1 pins a bubble if it contains:

* active **text selection**
* an open **edit textarea mode**

That pin prevents detachment for that bubble until the interaction ends.

V1 also broadens practical safety slightly beyond the earlier narrow rule:

* focused interactive controls should be treated as **pin-worthy** in implementation if testing shows detachment risk there

That is the only area I’d keep slightly implementation-driven rather than artificially strict.

## Detached node storage and memory policy

Detached nodes are kept as **original nodes in memory** for reuse.

For v1, the policy is:

* keep detached nodes in memory normally
* if detached-node retention crosses a **safety threshold**, disable virtualization for that tab and restore via refresh

I am leaving the exact threshold as an implementation constant to tune during profiling, because picking a fake number now would sound more certain than it should.

Important honesty note: this preserves the **original nodes**, but it does **not** mean the page is untouched. The extension is still modifying the DOM by removing and reinserting nodes. That is observable page state change, even if the nodes themselves are the originals. ([Chrome for Developers][1])

## Navigation / session behavior

Transcript session identity is based on the ChatGPT conversation path regex.

When the captured conversation ID changes:

* destroy current virtualization state immediately
* destroy detached cache immediately
* destroy measurements immediately
* disconnect observers
* reinitialize for the new session

V1 only initializes on the **known exact transcript pathname pattern**.

Unknown future transcript URL shapes are ignored.

## Popup / control model

Popup is intentionally minimal:

* simple **On/Off toggle**
* one short status line

Behavior:

* toggle scope is **per tab**
* turning **Off** triggers a **full page refresh**
* turning **On** also triggers a **full page refresh**
* stored preference is held in **service-worker memory keyed by `tabId`**

Important caveat: Chrome explicitly warns that extension service worker global variables are lost when the worker shuts down, so this tab state is intentionally lightweight and not durable. ([Chrome for Developers][7])

If selectors fail:

* keep the stored preference as-is
* show popup status as **Unavailable**
* do not attempt recovery in the same page session
* allow fresh init on next refresh or chat navigation

## Non-goals for v1

V1 does **not** attempt:

* branch-aware conversation modeling
* turn-pair virtualization
* HTML reconstruction of detached content
* multi-cluster mounted windows
* heuristic selector recovery
* persistence across refresh/browser restart
* deep preservation of every possible transient UI state

## Practical philosophy

This v1 is optimized for:

* **predictability**
* **clean rollback**
* **original-node reuse**
* **strict dirty boundaries**
* **implementation speed**

It is closer to a conservative extension-grade virtualizer than a fully generalized framework-grade one.

The parts that match common virtualization practice are:

* windowed rendering
* spacer-based total height preservation
* overscan
* resize-driven height correction
* incremental append handling
* rebuild-on-ambiguity

Using overscan is standard enough that the `react-window` guidance explicitly exposes an `overscanCount` knob for rendering beyond the strict visible set. ([web.dev][8])

## Final locked defaults

These are the concrete defaults now locked for v1:

* transcript only
* bubble-based
* single mounted segment
* exact selectors only
* activate at **50 bubbles**
* overscan = **1 viewport above + 1 viewport below**
* scroll handling = **cheap check in scroll, patch in rAF**
* `ResizeObserver` = **mounted bubbles only**
* append batching quiet period = **150 ms**
* near-bottom threshold = **200 px**
* incremental sync = **exact clean tail append only**
* rebuild on ambiguity
* detached nodes = **original nodes kept in memory**
* memory pressure fallback = **disable + refresh/restore**
* popup = **toggle + single status line**
* selector failure = **Unavailable + inert until refresh/navigation**

This is a solid pragmatic v1.

The only thing I would still mark as implementation-tunable rather than product-uncertain is the **memory safety threshold** for detached-node retention.

[1]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts "Content scripts  |  Chrome for Developers"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild "Node: appendChild() method - Web APIs | MDN"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame "Window: requestAnimationFrame() method - Web APIs | MDN"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect "Element: getBoundingClientRect() method - Web APIs | MDN"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver "ResizeObserver - Web APIs | MDN"
[6]: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe "MutationObserver: observe() method - Web APIs | MDN"
[7]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle "The extension service worker lifecycle  |  Chrome for Developers"
[8]: https://web.dev/articles/virtualize-long-lists-react-window "Virtualize large lists with react-window  |  Articles  |  web.dev"
