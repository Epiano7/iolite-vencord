# Contributing

Iolite is an open-source project focused on its Sapphire moderation workflow.

Maintainer updates may be committed directly to `main`. Changes from other contributors should use a focused pull request so they can be discussed, tested, and reviewed before merging.

## Development

1. Clone Vencord.
2. Clone this repository to `Vencord/src/userplugins/iolite`.
3. Create a topic branch.
4. Make the smallest focused change that solves the issue.
5. Run the following checks from the Vencord root:

```powershell
pnpm exec eslint src/userplugins/iolite/index.tsx src/userplugins/iolite/QuickPanel.tsx
pnpm testTsc
pnpm build
```

6. Document user-visible changes in `CHANGELOG.md`.
7. Open a pull request against `main` and complete the checklist in the PR template.

The compatibility workflow runs automatically on pull requests and must pass before a contribution is accepted. Epiano7 is the code owner and reviews contributor changes.

Do not commit Vencord settings, Discord data, tokens, server IDs, or generated build output.
