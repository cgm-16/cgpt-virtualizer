import { ensureBottomSpacer, ensureTopSpacer } from "./patch.ts";
import type { MountedRange, TranscriptSessionState } from "./state.ts";

export type StreamingGapEdge = "bottom" | "top";

const PLACEHOLDER_ATTRIBUTE = "data-cgpt-streaming-gap-placeholder";
const PLACEHOLDER_EDGE_ATTRIBUTE = "data-cgpt-streaming-gap-edge";
const PLACEHOLDER_TEXT = "응답 생성 중이라 이 구간은 잠시 고정됩니다.";

export function resolveStreamingGapEdge(
  mountedRange: MountedRange | null,
  nextRange: MountedRange | null,
): StreamingGapEdge | null {
  if (mountedRange === null || nextRange === null) {
    return null;
  }

  if (nextRange.start < mountedRange.start) {
    return "top";
  }

  if (nextRange.end > mountedRange.end) {
    return "bottom";
  }

  return null;
}

export function renderStreamingPlaceholder(
  state: TranscriptSessionState,
  edge: StreamingGapEdge,
): void {
  const topSpacer = ensureTopSpacer(state.transcriptRoot);
  const bottomSpacer = ensureBottomSpacer(state.transcriptRoot);
  const targetSpacer = edge === "top" ? topSpacer : bottomSpacer;
  const otherSpacer = edge === "top" ? bottomSpacer : topSpacer;

  removePlaceholder(otherSpacer);
  targetSpacer.style.position = "relative";

  const placeholder = ensurePlaceholder(targetSpacer);
  placeholder.setAttribute(PLACEHOLDER_EDGE_ATTRIBUTE, edge);
  placeholder.textContent = PLACEHOLDER_TEXT;
  placeholder.style.cssText =
    edge === "top"
      ? "position: absolute; top: 0; left: 0; right: 0; margin: 0 auto; width: fit-content; max-width: calc(100% - 16px); padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 999px; background: rgba(255, 255, 255, 0.96); color: #374151; font-size: 12px; line-height: 1.4; pointer-events: none;"
      : "position: absolute; bottom: 0; left: 0; right: 0; margin: 0 auto; width: fit-content; max-width: calc(100% - 16px); padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 999px; background: rgba(255, 255, 255, 0.96); color: #374151; font-size: 12px; line-height: 1.4; pointer-events: none;";
}

export function clearStreamingPlaceholder(state: TranscriptSessionState): void {
  for (const placeholder of Array.from(
    state.transcriptRoot.querySelectorAll<HTMLElement>(
      `[${PLACEHOLDER_ATTRIBUTE}]`,
    ),
  )) {
    placeholder.remove();
  }
}

function ensurePlaceholder(targetSpacer: HTMLElement): HTMLElement {
  const existing = targetSpacer.querySelector<HTMLElement>(
    `[${PLACEHOLDER_ATTRIBUTE}]`,
  );

  if (existing !== null) {
    return existing;
  }

  const placeholder = targetSpacer.ownerDocument.createElement("div");
  placeholder.setAttribute(PLACEHOLDER_ATTRIBUTE, "");
  placeholder.setAttribute("aria-hidden", "true");
  targetSpacer.append(placeholder);

  return placeholder;
}

function removePlaceholder(targetSpacer: HTMLElement): void {
  const placeholder = targetSpacer.querySelector<HTMLElement>(
    `[${PLACEHOLDER_ATTRIBUTE}]`,
  );

  placeholder?.remove();
}
