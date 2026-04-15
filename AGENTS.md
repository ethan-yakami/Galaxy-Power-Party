# Galaxy Power Party (银河战力党)

2-player WebSocket dice battle game built with Node.js, Express, and vanilla JS.

## Runtime Source of Truth

### Server
- `server.js` -> startup shim that calls `src/server/app/bootstrap.js`
- `src/server/**` -> actual Express/WebSocket runtime, rooms, handlers, AI, services
- `src/core/**` -> pure battle engine and shared runtime schemas
- `src/content/entities/**` -> characters, aurora dice, and custom content data

### Client
- `src/client/index.html` -> launcher page
- `src/client/battle.html` -> battle page
- `src/client/replays.html` -> replay page
- `src/client/workshop.html` -> workshop page
- `src/client/js/**` -> browser-side scripts loaded by the pages above
- `src/client/*.css` -> browser-side stylesheets

### Static Assets
- `public/portraits/**` -> portrait assets served at `/portraits/*`
- `src/core/shared/**` -> shared browser schemas served at `/shared/*`
- `picture/**` -> additional static assets served at `/picture/*`

## Compat / Legacy Paths

- `server/**` is a compat shim tree and should only contain `module.exports = require(...)`.
- `server/battle-engine/**` re-exports `src/core/battle-engine/**`.
- `src/content/{dice,registry,rooms,skills,weather}.js` re-export `src/server/services/**`.
- `src/core/{registry,weather}.js` re-export `src/server/services/**`.
- `public/` no longer hosts runtime HTML/CSS/JS entry files.

## Architecture
- Server-authoritative: all game state lives on the server and clients render room snapshots.
- Pure engine runtime: gameplay logic is driven by `src/core/battle-engine/**`.
- Client modules share state through `window.GPP` and are loaded via ordered `<script>` tags.
- WebSocket messages use JSON envelopes like `{ type, ...payload }`.

## Game Flow
1. Lobby: both players choose character + aurora die, then game auto-starts.
2. Attack roll
3. Attack reroll/select
4. Defense roll
5. Defense select
6. Damage resolution
7. Swap roles and start next round

## Dev Commands
```bash
npm start
npm run audit:paths
npm test
```

## Maintenance Rule
- If you need to change runtime behavior, edit the `src/` tree.
- If you touch `server/`, it should be for compatibility shims only.
- If you touch `public/`, it should be for asset folders only, not frontend entry code.
