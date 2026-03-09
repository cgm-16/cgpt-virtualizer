import type { ContentAvailability } from "../shared/types.ts";
import { isSupportedTranscriptPath } from "../shared/routes.ts";
import type { ResolvedContentSelectors } from "./selectors.ts";

export function resolveAvailability(
  pathname: string,
  selectors: ResolvedContentSelectors | null,
): ContentAvailability {
  if (!isSupportedTranscriptPath(pathname)) {
    return "idle";
  }

  return selectors === null ? "unavailable" : "available";
}
