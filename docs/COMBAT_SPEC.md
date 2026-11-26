# Stickman Duel Combat Specification (60 Hz)

All combat constants are defined in `src/data/balance.ts` and `src/data/moves.ts`.

## Fighter Vitals & Spatial Rules

- **Base HP:** `100` (Hero / Ash Ronin), `120` (Ochre Brute), `85` (Crimson Shade), `140` (Casket Warden)
- **Guard Meter:** `0–100` (regenerates `+1` every `6` idle/walk/crouch frames)
- **Stage Bounds:** Logical width `1280px`, playable walls `90px..1190px`, floor at `y = 540px`
- **Input Buffering:** `6` frames for attacks, dodge, jump, and grab
- **Coyote Time:** `4` frames

## Move Frame-Data Table (60 fps)

| Move | Startup | Active | Recovery | Total | Damage | Guard Dmg | Hitstop | Hitstun | Blockstun | Properties |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `light1` | 5 | 3 | 10 | 18 | 8 | 10 | 5 | 14 | 10 | Chains into `light2` or `heavy` on hit (cancel @ f6) |
| `light2` | 5 | 3 | 11 | 19 | 9 | 12 | 5 | 15 | 10 | Chains into `light3` or `heavy` on hit (cancel @ f6) |
| `light3` | 6 | 4 | 14 | 24 | 11 | 15 | 6 | 18 | 12 | Finishes 3-hit light string, larger pushback |
| `heavy` | 14 | 4 | 22 | 40 | 22 | 30 | 9 | 24 | 16 | Heavy guard crusher, big pushback |
| `unblockable` | 20 | 4 | 24 | 48 | 26 | 100 | 10 | 28 | — | Red-flash telegraph; cannot be blocked or parried |
| `grab` | 8 | 3 | 18 | 29 | 14 | 25 | 7 | 26 | — | Beats `block` and `parry_active`; loses to `dodge` and `jump` |
| `counter` | 5 | 4 | 12 | 21 | 27 | 40 | 11 | 30 | — | Available during counter window after Parry or Perfect Dodge; guaranteed hit |

## Defensive Mechanics & Priority Rules

1. **Dodge (`18` frames total):**
   - Startup frames `1–3`, **Invincible frames `4–12`**, Recovery frames `13–18`.
   - Passes through opponent pushboxes and coffin slab hazards during invincibility.
2. **Perfect Dodge (`4`-frame window):**
   - If an enemy attack hitbox overlaps during dodge frames `0–4`, triggers `PERFECT_DODGE`:
     - Attacker enters sim-level slow-motion for `30` frames (steps once every `3` frames).
     - Dodger gains a `36`-frame `counterWindow` for a guaranteed Golden Riposte (`counter`).
3. **Parry (`12`-frame window; `16` with Parry Assist):**
   - Pressing `BLOCK` enters `parry_active` for `12` frames (`0..11`). Defenders in late `blockstun` (`<= 6` frames remaining) can also tap `BLOCK` to parry follow-up hits of a 4-hit light combo.
   - Intercepting a normal attack (`!unblockable && !isGrab`) deals `0` damage, restores `+15` guard, applies `10` frames of hitstop, staggers the attacker for `40` frames (`parry_stagger`), and opens a `36`-frame `counterWindow`.
   - Releasing `BLOCK` before a parry lands triggers `20` frames of vulnerable `parry_whiff` recovery.
4. **Block & Guard Break:**
   - Holding `BLOCK` past the parry window reduces normal attack damage by `80%` (takes `20%` chip, min `1` HP) and subtracts `guardDamage` from the guard meter.
   - Emptying the guard meter triggers `GUARD_BREAK`: `60`-frame stun (`guard_break`) with `12` frames of hitstop.
5. **Executions & Cinematic Finishers:**
   - **Stagger Execution (HP > 24):** Pressing `GRAB/EXECUTE` near a `guard_break` opponent deals `24` damage, heals attacker `+12` HP, and has a `15`-second (`900`-frame) cooldown.
   - **Cinematic Finisher (HP reaches 0 or lethal execution):** Sim enters deterministic `finisher` phase (`50–58` frames depending on variant in `src/data/finishers.ts`). Outcome is already decided, requiring zero extra netcode synchronization.

## Resolution Priority Order (Per Frame)

1. Hitstop countdown (`hitstopFrames > 0` freezes both fighters)
2. Execution check (`GRAB` on adjacent `guard_break` victim)
3. Grab vs. airborne/dodging check (misses if target is airborne or dodging)
4. Perfect Dodge check (`actionFrame <= 4` on `dodge`)
5. Standard Dodge Invincibility (`actionFrame` in `4..12`)
6. Parry check (`parry_active` vs. normal attack)
7. Block / Guard Break check (`block` vs. normal attack)
8. Clean Hit (`HIT` event + combo increment + hitstun + pushback)
9. Coffin Slab hazard overlap check
10. Lethal Finisher / KO / Round Timeout check
