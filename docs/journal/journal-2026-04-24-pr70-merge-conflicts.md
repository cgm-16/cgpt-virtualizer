# Journal 2026-04-24 PR70 Merge Conflicts

## Context

- Task: handle merge conflicts on PR `#70` (`feature/53-selector-infrastructure` into `main`).
- Local `main` was fast-forwarded from `d60d712` to `05b8ceb` before conflict work started.
- Existing clean worktree for the PR branch was available at `.worktrees/issue-53-selector-infrastructure`.

## Resolution

- Merged updated `main` into `feature/53-selector-infrastructure` inside the existing PR worktree.
- Resolved the explicit conflict in `tests/unit/content-selectors.test.ts` by preserving both the default-registry coverage added on `main` and the multi-candidate selector coverage from the PR branch.
- Patched `src/content/bootstrap.ts` so startup discovery attribute filters flatten selector candidate arrays before passing them to `collectObservedSelectorAttributes()`. This avoids a bad post-merge type/behavior mismatch introduced by the auto-merge.

## Verification

- `pnpm run test:unit`
- `pnpm run build`
