# auto-fix/ — Autonomous HiTeXeR fix loop

A self-driving pipeline that repeatedly picks the worst "content regression"
diagram, asks a headless `claude -p` sub-agent to diagnose and minimally patch
`asy-interp.js`, validates against a canary set + the target's lesson cluster,
and auto-commits on success.

The driver bills to the user's Claude subscription (no direct Anthropic API
calls).

## Contents

| File | Role |
|---|---|
| `run-loop.js` | Outer driver; spawns `claude -p` once per iteration. |
| `select-target.js` | Picks next target ID by content-regression criteria. |
| `render-and-score.js` | Re-renders + scores a chosen ID list; flags regressions. |
| `build-canary.js` | One-shot: seeds `canary.json` with ~50 stratified IDs. |
| `log.js` | Appends a JSON line to `attempts.jsonl`; updates `skiplist.json`. |
| `prompt.md` | Template the sub-agent receives on each iteration. |
| `canary.json` | Frozen `id -> baselineSsim` map (generated). |
| `attempts.jsonl` | Append-only log of every iteration's verdict + notes (generated). |
| `telemetry.jsonl` | Append-only token/cost log, one line per iteration (generated). |
| `skiplist.json` | IDs permanently skipped after 3 non-fix attempts (generated). |
| `STOP` | Sentinel file; halts the loop between iterations (optional). |

## Setup

```bash
# 1. Build the canary set (one-time; re-run only if ssim-results.json changes shape)
node auto-fix/build-canary.js

# 2. Sanity-check the target selector
node auto-fix/select-target.js

# 3. Sanity-check render-and-score against known IDs
node auto-fix/render-and-score.js --ids 05896,10394
```

## Running the loop

```bash
# One iteration (interactive)
node auto-fix/run-loop.js --max 1

# Soak 5 iterations, halting on the first disallowed diff
node auto-fix/run-loop.js --max 5 --stop-on-fail

# Dry run — print the rendered prompt without spawning the sub-agent
node auto-fix/run-loop.js --max 1 --dry-run
```

To stop the loop cleanly between iterations:

```bash
touch auto-fix/STOP   # posix
type nul > auto-fix\STOP   # cmd.exe equivalent
```

Remove the file when ready to resume.

## What the wrapper enforces

1. **No push.** The wrapper never runs `git push`; the prompt forbids it.
2. **Corpus protection.** Sub-agent is told the three read-only directories
   (`asy_corpus/`, `comparison/asy_src/`, `comparison/texer_pngs/`).
3. **Pre-commit diff audit.** If any file outside
   `{asy-interp.js, index.html, comparison/ssim-results.json}` shows up in the
   working tree, the wrapper reverts with `git checkout -- ...` and the
   iteration is recorded as a failure.
4. **Version bump enforcement.** If the sub-agent committed but `index.html`'s
   version string didn't increase, the wrapper `git reset --hard`s to the
   pre-iteration HEAD.
5. **Per-iteration timeout.** Default 20 minutes; a timed-out sub-agent has its
   changes reverted and the iteration is marked failed.
6. **Kill switch.** `auto-fix/STOP` halts the loop between iterations.

## `attempts.jsonl` verdicts

| verdict | meaning | retried? |
|---|---|---|
| `fix` | Change landed + committed. SSIM target ≥ 0.85 with visual match. | no |
| `ssim-artifact` | Render visually matches reference; SSIM is noise. | no (permanent skip) |
| `attempted-no-improve` | 15 cycles done, target still < 0.85 or defects remain. | up to 3, then skiplist |
| `regressed-canary` | Target fixed, but canary/family dropped > 0.05. | up to 3, then skiplist |
| `error` | Tooling / infra failure. | yes |

There is **no `unfixable-feature` verdict**. The prompt explicitly instructs the
sub-agent to implement missing primitives rather than skip. `select-target.js`
imposes a 24-hour cooldown per ID and enforces the 3-strike rule via
`skiplist.json`.

## `telemetry.jsonl` format

One line per iteration, e.g.:

```json
{"ts":"2026-04-20T14:00:00.000Z","iteration":1,"id":"08899","outcome":"success",
 "durationMs":912344,"numTurns":47,"totalCostUsd":1.8732,
 "usage":{"input_tokens":12847,"output_tokens":25193,
          "cache_creation_input_tokens":0,"cache_read_input_tokens":184271},
 "sessionId":"..."}
```

Summarize with:

```bash
node -e "const r=require('fs').readFileSync('auto-fix/telemetry.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);console.log('n='+r.length,'total $'+r.reduce((s,x)=>s+(x.totalCostUsd||0),0).toFixed(2),'turns='+r.reduce((s,x)=>s+(x.numTurns||0),0))"
```

## Target-selection criteria

```
sizeScore >= 0.7   AND   ssim < 0.75
AND  id NOT IN skiplist
AND  (no attempt in last 24h)
AND  (count of non-fix attempts < 3)
ORDER BY ssim ASC
LIMIT 1
```

## Scope per iteration

`render-and-score.js --canary --family <collection_lesson>` is the only
validation surface. The full 12K corpus pipeline is still a manual operation
(it is out of scope and is not invoked by anything here).

## Out of scope

- No rewrite of `ssim-pipeline.js`.
- No changes to SSIM weights / scoring function.
- No modifications to corpus, TeXeR references, or blink UI.
- No push to remote; no public-page rebuild.
