# texer_pngs deletion + restore — 2026-06-12

**What happened:** `comparison/texer_pngs/` (the protected ~12.6k TeXeR
reference corpus) was emptied at **09:25:03 on 2026-06-12** (directory
LastWriteTime). The deleting process was not identified. Audited and ruled
out: `auto-fix/render-and-score.js` (reads refs only — no unlink/rm anywhere),
`fix-server.js`, `batch-refetch.js`, the labels-oneoffs worktree session's
commands (junction creation is non-destructive; its canary run failed on
*writing* `htx_svgs` and never reached refs). Another agent session was
working on axes/ticks concurrently — its logs around 09:25 are worth checking.
Files were NOT in the Recycle Bin.

**Recovery:** restored 12,615 PNGs from
`C:\Users\Mark Eichenlaub\github\hitexer-corpus-backup\20260420-004526\texer_pngs`
(robocopy, completed 09:38). Spot checks: `12713.png` byte-dims match the
pre-deletion measurements exactly; `00247.png` differs (450x357 vs 397x457
measured this morning) because it was **refetched after the backup date**.

**Residual gaps after restore (definitive):** `_missing_refs_after_restore.txt`
lists **377 IDs** present in `comparison/ssim-results.json` but with NO ref PNG
after the restore (post-backup corpus additions, mostly 128xx–129xx). In
addition, any ID refetched after 2026-04-20 is restored to its OLDER version
(`refetch-log.txt` lists 132; `_refetch_main.txt` lists 505; 12944 and 00247
confirmed stale-restored). Re-fetching the union (≈800 IDs, needs VPN) brings
the corpus fully current.

**Also intact:** `comparison/texer_pngs_old/` (22 files, an April artifact,
untouched), `htx_pngs`, `htx_svgs`, `asy_pngs`, `comparison/asy_src`.

**Action items:**
1. Identify what deleted the corpus before running unattended pipelines again.
2. Make a fresh corpus backup once re-verified (the existing backup dir is
   the only reason this was recoverable).
3. Optionally re-fetch the ≈505 post-backup IDs.

---

## ROOT CAUSE IDENTIFIED (second deletion, 19:23 same day)

The corpus was emptied a SECOND time at 19:23:18 on 2026-06-12, and this time
the deleting command is confirmed from the session transcript:

    git worktree remove ../hitexer_rides --force

The `hitexer_rides` worktree contained a **Windows junction** at
`comparison\texer_pngs` pointing into the main repo's corpus (created for
fast scoring without copying 222 MB). **`git worktree remove --force`
recursively deletes the worktree tree and FOLLOWS junctions**, so it deleted
all 12,706 PNGs through the link. The 09:25 morning deletion was the same
mechanism (a junction-bearing axes worktree torn down at that time).

**Recovery #2:** restored 12,706 files from
`hitexer-corpus-backup\20260612-143807` (the post-refetch backup) at 19:53.
No data lost this time.

**Rule going forward (also in Claude memory):** NEVER leave a junction inside
a git worktree that points into the main repo. Either copy the data for real,
or `cmd /c rmdir <junction>` (non-recursive — removes only the link) BEFORE
`git worktree remove`.
