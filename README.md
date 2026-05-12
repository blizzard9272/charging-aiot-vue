# Charging AIOT Vue

## Common Commands

```bash
npm install
npm run dev
npm run build
```

## Realtime Bridge Diagnostics

The snapshot data center page uses backend aggregation for initial loading, but realtime updates still depend on the WebSocket bridge.

Run:

```bash
node scripts/ws-bridge-status.mjs
```

This prints:

- bridge port status
- runtime directory status
- `ws_events.jsonl` file status
- latest event sample

## Related Docs

- [Protocol Data Ops](../docs/protocol-data-ops.md)
