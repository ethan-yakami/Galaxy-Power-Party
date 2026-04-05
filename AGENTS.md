# Galaxy Power Party (银河战力党)

2-player WebSocket dice battle game built with Node.js, Express, and vanilla JS.

## Project Structure

### Server
- `server.js` — Entry point: Express + WebSocket server setup, message router (~120 lines)
- `server/characters.js` — `CHARACTERS` and `AURORA_DICE` data definitions, summaries
- `server/dice.js` — Dice creation, rolling, sorting, validation, value helpers
- `server/rooms.js` — Room management: `send()`, `sanitizeRoom()`, `broadcastRoom()`, player/room lookups, `pushEffectEvent()`
- `server/skills.js` — Character skills: aurora effects, ascension, hack, thorns, poison, damage checks
- `server/handlers.js` — All WebSocket message handlers (factory function receiving `rooms` Map)
- `server/ai.js` — AI opponent: player creation, decision-making (attack/defense/reroll/aurora), game scheduling

### Client
- `public/index.html` — Single-page HTML shell
- `public/styles.css` — Dark-theme CSS
- `public/js/state.js` — Global state, DOM refs, `send()`, `sendWithFeedback()`, `setMessage()` (exports via `window.GPP`)
- `public/js/ui.js` — Winner overlay, error toasts, player helpers, doc modal
- `public/js/effects.js` — Damage/heal/instant-damage animations, effect event processing
- `public/js/dice-ui.js` — Dice interaction, rendering, display/preview/committed helpers
- `public/js/render.js` — `render()`, `renderPlayerZone()`, `renderSelfActions()`, lobby buttons
- `public/js/connection.js` — WebSocket `connect()`, `onmessage` handler, button bindings, init

### Other
- `chars` — Plain-text character spec definitions (reference only, not parsed at runtime)
- `auroras` — Plain-text aurora dice spec definitions (reference only, not parsed at runtime)
- `render.yaml` — Render.com deployment config

## Architecture
- **Server-authoritative**: All game state lives in `room.game` on the server. Client renders state received via WebSocket.
- **Server modules**: Use Node.js `require()`. `handlers.js` exports a factory `createHandlers(rooms)` that closes over the shared `rooms` Map.
- **Client modules**: Share state via `window.GPP` namespace. Loaded in dependency order via `<script>` tags. Functions from later scripts are accessed lazily through `GPP.*`.
- **WebSocket messages**: JSON `{type, ...payload}`. Key types: `create_room`, `create_ai_room`, `join_room`, `choose_character`, `choose_aurora_die`, `roll_attack`, `reroll_attack`, `confirm_attack_selection`, `roll_defense`, `confirm_defense_selection`, `use_aurora_die`, `update_live_selection`, `play_again`, `disband_room`.
- **Effect events**: `pushEffectEvent()` queues animation events (`damage_resolution`, `instant_damage`, `heal`) into a circular buffer. Client processes them sequentially via `queueEffectAnimation()`.
- **sanitizeRoom()**: Filters game state before sending to clients (hides opponent loadout in lobby).

## Game Flow
1. **Lobby**: Both players pick character + aurora die → auto-start (PvP or vs AI)
2. **Attack roll** → **Attack reroll/select** (choose N dice per attackLevel) → **Defense roll** → **Defense select** (choose N dice per defenseLevel) → **Damage resolution** → swap roles, next round

## AI Opponent
- **Entry**: `create_ai_room` message creates a room with a virtual AI player (fake ws, `playerId: 'AI'`)
- **Character/Aurora**: Random selection on room creation and on each "play again"
- **Decision scheduling**: `broadcastRoom()` wrapper in handlers triggers `scheduleAIAction()` after each state broadcast. AI actions execute via `setTimeout` with 600-1500ms delay
- **Attack strategy**: Enumerate all C(n,k) dice combinations, score each based on sum + character skill synergy bonuses (e.g., +50 for Huangquan pierce, +15 for Liuying double strike)
- **Reroll strategy**: Reroll dice below expected value; character-specific (Huangquan rerolls non-4s, Zhigengniao rerolls odd values)
- **Aurora usage**: Attack — generally use if available; Defense — conditional on attack value threshold
- **Cleanup**: Rooms with only AI players are auto-deleted when human leaves

## Character Skill Implementation Pattern
- Character stats defined in `CHARACTERS` object in `server/characters.js`
- Pre-value attack skills: `applyCharacterAttackSkill()` in `server/skills.js`
- Post-value attack skills: in `handleConfirmAttack()` in `server/handlers.js` after `attackValue` is set
- Defense skills: in `handleConfirmDefense()` in `server/handlers.js` after defense dice selected
- Passives: dedicated functions in `server/skills.js` called from `handleConfirmDefense()`
- End-of-round effects: in `goNextRound()` in `server/handlers.js`

## Aurora Dice Implementation Pattern
- Aurora dice data defined in `AURORA_DICE` object in `server/characters.js` (faces, effectText, conditionText)
- Use conditions: `canUseAurora()` in `server/skills.js` — checks uses remaining, role restrictions, and per-die conditions
- A-effects on attack: `applyAuroraAEffectOnAttack()` in `server/skills.js`
- A-effects on defense: `applyAuroraAEffectOnDefense()` in `server/skills.js`
- Per-round state reset: in `handleRollAttack()` and `goNextRound()` in `server/handlers.js`
- Game state tracking fields initialized in `startGameIfReady()` in `server/handlers.js`
- Mechanic resolution (命定 validation, 超载 bonus/self-damage, 不屈 HP floor, counter): inline in `handleConfirmAttack()` and `handleConfirmDefense()` in `server/handlers.js`
- Tracked counters: `selectedFourCount` (复读), `selectedOneCount` (奇迹), `cumulativeDamageTaken` (复仇)

## Key Mechanics
- **Dice pool**: 5 normal dice per character, optionally +1 aurora die
- **Aurora A-effect**: When a die face with `hasA: true` is selected, triggers special effect
- **Pierce (洞穿)**: Ignores defense value and force field
- **Force field (力场)**: Blocks non-pierce damage for one round
- **Double strike (连击)**: `extraAttackQueued` flag, calcHits returns two hits
- **Ascension (跃升)**: `applyAscension()` sets min die to max face value
- **Poison (中毒)**: End-of-round damage equal to layers, then layers -= 1
- **Resilience (韧性)**: Adds layers to defense value; at 7 layers → instant 7 damage
- **Thorns (荆棘)**: Self-damage before settlement, then cleared
- **Power (力量)**: Adds layers to attack value
- **Hack (骇入)**: Changes opponent's highest non-aurora selected die to 2
- **Counter (反击)**: +3 defense level for one defense; if defense > attack, deal diff damage (Danheng character); generic `counterActive` flag for aurora dice (仙人球)
- **Fated (命定)**: Aurora die must be selected when in dice pool, cannot be skipped (命运 aurora)
- **Overload (超载)**: Attack bonus equal to layers; defense self-damage = ceil(layers/2) (贷款 aurora)
- **Unyielding (不屈)**: HP cannot drop below 1 this round (誓言 aurora)
- **Desperate (背水)**: HP set to 1, attack bonus = HP lost (大红按钮 aurora)

## Dev Commands
```bash
npm start          # Start server on PORT (default 3000)
node server.js     # Same as above
```

## Notes
- No test framework configured. Manual testing via browser.
- No build step — plain JS served via express.static. Client modules share `window.GPP` namespace.
- Chinese-language UI; all log messages and skill names are in Chinese.
