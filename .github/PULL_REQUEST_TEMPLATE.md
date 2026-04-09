## Summary

<!-- 1-3 sentences describing what this PR does and why -->

## Type of Change

- [ ] Feature (new functionality)
- [ ] Bug fix (non-breaking fix for an issue)
- [ ] Refactor (no functional change)
- [ ] Documentation
- [ ] Test (adding or updating tests)
- [ ] Chore (dependency updates, CI config, etc.)

## Testing

- [ ] `npm test` passes
- [ ] Tested locally in browser
- [ ] E2E tests pass (if UI change): `npm run test:e2e`

## Migration Impact

- [ ] No database changes
- [ ] Modified migration file(s): <!-- which file(s)? 001/002/003/004 -->
- [ ] Requires `npm run db:reset` after pull
- [ ] Affects JWT hook — tested via `signInWithPassword`

## Checklist

- [ ] No new `NEXT_PUBLIC_` env vars for server-only secrets
- [ ] No catch-all routes added
- [ ] Cross-references in docs updated (if applicable)
