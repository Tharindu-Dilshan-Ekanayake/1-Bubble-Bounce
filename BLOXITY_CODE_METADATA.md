---
canDie: false
hasScore: true
---

# +1 Arm Length: Boxity integration

The player cannot die: there is no death or game-over screen. You do rubber-arm pull-ups
for Power, grab the two launch posts on the Launch Pad, walk back with your own controls
while your arms stretch like rubber, and let go to fly down the rainbow runway: more Power
flies you further, and the stretch meter (let go at the top of the twang for PERFECT) adds
up to x1.6 Wins. You always get another launch. Your arms (24 kinds, bought with Wins)
change how your Bloxity avatar's arms look and how much Power each gain is worth.

Built on the +1 Tire Rolling template: inside the code the old names stay (`health` is
Power, a `tire` is a pair of arms, a `pad` is a pull-up bar, a `roll` is a launch).

## Leaderboards

Scores are reported by the **game server**, never by the client
(`server/src/bloxityLeaderboards.js`, `BLOXITY_LEADERBOARDS`). Every ~20 s and when a
player leaves, each pod sends the changed scores of its verified players to
`POST {api}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report` as `legion_<userId>`.

| Board      | Label            | Score                                | Format  |
|------------|------------------|--------------------------------------|---------|
| `rebirths` | Rebirths         | `profile.rebirths`                   | number  |
| `wins`     | Total Wins       | `profile.stats.totalWins`            | compact |
| `distance` | Longest Flight (m) | `floor(profile.stats.bestDistance)`  | compact |
| `playtime` | Minutes Played   | `floor(profile.stats.playtime / 60)` | number  |

All four are `order: desc`, `mode: best`, `reset: none`.

## Gems purchases

Boxity's purchase webhook goes to `POST /api/gems/webhook` on the game server. It is
recorded in the database by `transactionId` (idempotent) and applied exactly once by
the pod the buyer plays on. Unknown skus are answered 400 so Boxity refunds them.

## Rewarded ads

The client sends `adReward { placement, rewardToken }`; the server verifies the token
with `POST {api}/v1/ads/reward/verify` before granting anything.

## Open Rooms

Each pod reports its rooms every 2 s to `POST {MATCHMAKER_REPORT_URL}/{BLOXITY_GAME_ID}/rooms`
(`server/src/legionRoomReporter.js`, installed after `listen()`), so they show under
"Open Rooms" on the game page. The client joins `?roomId=` at launch and falls back to
normal matchmaking if that room is gone or full.

## Avatars

`client/src/game/PlayerAvatar.jsx` + `avatarRig.js` draw every slot: skin (with face,
shirt and pants), body parts, hat + hair + mask on `Neck1`, back on `Spine2`, neck/chest
on `Spine2` and waist on `Spine1` (rest-inverse placement), hands and shoes as mirrored
pairs following the leaf bones' position and rotation only. A player wearing an uploaded
character (`characterId`) gets its GLB via `avatar.getCharacter()` / `getCharacterFor()`,
with accessories fitted by `characterAccessoryMatrix`; on any failure the regular avatar
shows. Body proportions are applied by moving bones, so accessories follow them.

## Server environment

| Variable                | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `BLOXITY_REPORT_TOKEN`  | Token for leaderboard and room reports (none set = no reports) |
| `MATCHMAKER_REPORT_URL` | Where the Open Rooms reporter posts (injected by Boxity hosting) |
| `BLOXITY_GAME_ID`       | Hosted game id for reports (default `1-arm-length`)              |
| `LEGION_WEBHOOK_SECRET` | Must match the webhook's `x-legion-webhook-secret` header     |
| `MONGODB_URI`           | Shared database for profiles and Gems grants (SQLite without) |
| `BLOXITY_API_URL` etc.  | Platform URLs; production defaults (`server/src/bloxityEnv.js`) |
