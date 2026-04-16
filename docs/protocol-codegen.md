# Protocol Codegen

## Purpose

Keep protocol contracts discoverable and synchronized across tooling artifacts without changing runtime behavior.

## Source of Truth

- [`src/core/shared/protocol/schema.js`](../src/core/shared/protocol/schema.js)

The schema defines:
- message type
- message direction (`client_to_server` / `server_to_client`)
- payload fields (name, type, required)

## Generated Artifacts

Generated from the schema:

- [`proto/gpp-battle.proto`](../proto/gpp-battle.proto)
- [`src/core/shared/generated/protocol-manifest.json`](../src/core/shared/generated/protocol-manifest.json)
- [`src/core/shared/generated/protocol-types.d.ts`](../src/core/shared/generated/protocol-types.d.ts)

## Commands

```bash
npm run protocol:generate
npm run protocol:check
```

- `protocol:generate`: rewrites generated artifacts.
- `protocol:check`: fails if generated artifacts are out of date.

`protocol:check` is executed by CI and included in `npm test`.
