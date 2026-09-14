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

- [ ] `npm test` passes (all workspaces)
- [ ] Tested locally in browser
- [ ] E2E tests pass (if UI change): `npm run test:e2e`
- [ ] Mobile / API contract changes verified: `npm run test:mobile`
- [ ] `npm run type-check` passes across workspaces

## Migration Impact

- [ ] No database changes
- [ ] Added migration file(s) and checksum: <!-- next NNN_name.sql only; never edit applied files -->
- [ ] Requires `npm run db:reset` after pull
- [ ] Affects JWT hook — tested via `signInWithPassword`

## Checklist

- [ ] No new `NEXT_PUBLIC_` env vars for server-only secrets
- [ ] No catch-all routes added
- [ ] Shared `packages/*` changes don't break either app (web + mobile build & test)
- [ ] Shared `packages/*` stay platform-neutral (no Next/Expo/DOM imports)
- [ ] Cross-references in docs updated (if applicable)
