# Galaxy Power Party Protocol Source

`proto/` is the protocol source of truth for public contracts.

Current scope:

- WebSocket message contracts used by the runtime
- Auth / replay / platform HTTP payload contracts used by tooling and docs
- Transitional fields that still map to loose JSON objects are annotated inline

Conventions:

- `// @gpp-message type=<runtime_type> direction=<client_to_server|server_to_client>` marks a WebSocket message payload.
- `// @gpp-field type=<override>` overrides the inferred runtime field type.
- `// @gpp-field required=false` marks an optional runtime field.
- `// @gpp-field transitional=<reason>` marks a field that is still intentionally loose.

The generated artifacts live under `src/core/shared/generated/` and must be refreshed with:

```bash
npm run protocol:generate
```
