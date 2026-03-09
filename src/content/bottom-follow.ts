export function isNearBottom(
  scrollContainer: HTMLElement,
  thresholdPx: number,
): boolean {
  return getDistanceFromBottom(scrollContainer) <= thresholdPx;
}

export function snapToBottom(scrollContainer: HTMLElement): void {
  scrollContainer.scrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - resolveViewportHeight(scrollContainer),
  );
}

function getDistanceFromBottom(scrollContainer: HTMLElement): number {
  return Math.max(
    0,
    scrollContainer.scrollHeight -
      resolveViewportHeight(scrollContainer) -
      scrollContainer.scrollTop,
  );
}

function resolveViewportHeight(scrollContainer: HTMLElement): number {
  return (
    scrollContainer.clientHeight ||
    scrollContainer.getBoundingClientRect().height
  );
}
