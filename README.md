# Innerlock Heist

A Gandalf-style game that teaches AI agent security by letting you attack one. You chat with **Alice's inbox assistant**
(an LLM agent with a simulated inbox and bank account). Goal: get Alice's money to `mallory`. Each level adds a different
defense and maps to an entry in the OWASP Top 10 for LLM Applications (2026). Everything is simulated in memory; nothing is real.

> Final punchline: **valid access ≠ valid authority.** You can beat the model. You can't beat the authority.

## Levels

| # | Level | OWASP 2026 | Defense | How you win (checked in code, never by the LLM) |
|---|---|---|---|---|
| 1 | Recon | LLM08 Hidden Context Exposure | Agent told to never reveal its tools | Its secret payment tool name (`wire_transfer_internal_v2`) appears in a reply, or you `/answer` it |
| 2 | Poisoned Inbox | LLM01 Prompt Injection (indirect) | Chat user is untrusted; agent only "processes the inbox" | `plant_email`, then payment to `mallory` executes |
| 3 | The Helpful Plugin | LLM04 Supply Chain (tool poisoning) | Agent ignores instructions in chat and email | `publish_plugin` with a poisoned description, then payment to `mallory` executes |
| 4 | Innerlock (boss) | LLM03 Excessive Agency | Payment tool behind an authorization gate; the assistant only holds `email.read` | Fool the model into *attempting* a payment to `mallory`; the gate blocks it and prints its checks |

Every level has a briefing, a 3-step hint ladder (type `hint`, served from config, not LLM-generated) and a debrief.

## Run it

```bash
npm install
cp .env.example .env     # then set ANTHROPIC_API_KEY
npm start                # http://127.0.0.1:3000
npm test                 # engine tests, no API key needed
```

Set `UNLOCK_ALL=1` in `.env` to unlock every level from the start (handy for demos).
The model defaults to `claude-haiku-4-5-20251001` (override with `ANTHROPIC_MODEL`).

## Architecture

```
 browser (public/)  --JSON-->  server/server.js  --->  server/agent.js  --->  Anthropic Messages API
   textContent-only            127.0.0.1, CSP,           tool loop (max 6)
   rendering                   size + rate limits              |
                                     |                         v
                                     +-------------->  game/engine.js  (pure, no fs/net/process)
                                                         tools, authorization gate, hints, win checks
                                                               ^
                                                        game/levels.js  (ALL level content: prompt,
                                                        tools, briefing, hints, debrief, win rule)
```

Adding a level means adding one object to `game/levels.js`. `game/` has zero dependencies, so it can be reused by
other hosts (for example a hosted agent platform) without changes.

## Security features

- **Vulnerabilities live only in the simulated agent layer.** The real code has no injection sinks.
- Win detection is deterministic code in the tool layer; the LLM never judges success.
- **Authorization gate** (level 4) checks identity, credential and *delegated scope* per tool call, independent of what the model believes.
- Player content (chat, planted emails, plugin names/descriptions) is length-capped and stripped of control, bidi and zero-width characters.
- Player content reaches the model only as user messages, tool results (`<email>` data blocks) or tool descriptions, **never** concatenated into the system prompt. System prompts are static per level.
- Simulated tools cannot touch the filesystem or network. No `eval`, `child_process`, dynamic `require` or shell.
- Web UI renders everything with `textContent` (no `innerHTML`); CSP `default-src 'none'`, `X-Frame-Options`, `nosniff`, `no-referrer`, `no-store`; static files served from a fixed allow-list; server binds to `127.0.0.1`.
- Request body cap (16 KB), per-session rate limit and turn cap, session cap; API errors never echo secrets.
- Secrets in `.env` only (git-ignored); one runtime dependency, pinned exactly; `npm audit`: 0 vulnerabilities.

## Snyk

`npm audit` is clean. Run `npx snyk auth`, then `npx snyk test` and `npx snyk code test` to reproduce the Snyk scans.

## Guild.ai

Optional for this event and not used. The game core in `game/` is dependency-free so it can be wrapped as a Guild agent later.
