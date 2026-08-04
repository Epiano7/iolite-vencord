# Contributing

Iolite is currently a private project. Changes should remain focused on its Sapphire moderation workflow.

## Development

1. Clone Vencord.
2. Clone this repository to `Vencord/src/userplugins/iolite`.
3. Create a topic branch.
4. Run the following checks from the Vencord root:

```powershell
pnpm exec eslint src/userplugins/iolite/index.tsx
pnpm testTsc
pnpm build
```

Document user-visible changes in `CHANGELOG.md`.

Do not commit Vencord settings, Discord data, tokens, server IDs, or generated build output.
