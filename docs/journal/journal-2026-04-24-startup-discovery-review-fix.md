# Journal 2026-04-24 Startup Discovery Review Fix

## Context

- Task: fix the reviewed startup discovery regressions in `src/content/bootstrap.ts` and push the result.
- Initial repo state: current checkout is `main` with untracked local paths `.claude/ralph-loop.local.md`, `.playwright-mcp/`, and `docs/journal/`.
- Review findings to verify and address:
  - teardown returned from delayed startup discovery stays stale after a session establishes
  - startup discovery only observes child-list mutations, missing attribute-based readiness
  - availability can stay sticky while startup discovery is in progress

## Constraints / reminders

- Need the smallest reasonable fix.
- Do not disturb unrelated untracked files.
- Need a feature branch before committing.

## Outcome

- Worked in existing worktree `/Users/ori/repos/cgpt-virtualizer/.worktrees/issue-54-bootstrap-recovery` on branch `feature/54-bootstrap-recovery`.
- Added failing coverage for:
  - immediate `unavailable` / `inactive` reporting during startup discovery
  - delayed activation teardown through the returned `destroy()`
  - attribute-only readiness when selector attributes are added after node creation
- Patched `src/content/bootstrap.ts` so startup discovery:
  - reports discovery-state transitions immediately and deduplicates them
  - observes bubble, scroll-container, and transcript-root attribute changes
  - re-checks selectors once immediately after observer setup
  - returns a live destroy wrapper so delayed sessions are torn down correctly
- Verification:
  - `pnpm exec vitest run tests/unit/content-bootstrap.test.ts`
  - `pnpm exec vitest run tests/unit/content-navigation.test.ts tests/unit/content-startup.test.ts`
  - `pnpm run test:unit`
