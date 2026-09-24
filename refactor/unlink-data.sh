#!/bin/sh
# Run inside a HiTeXeR git worktree BEFORE removing it. Deletes only the
# junctions link-data.sh made (never what they point to), then checks none
# are left. `git worktree remove --force` on a worktree that still has these
# junctions follows them and deletes the main checkout's corpus and TeXeR
# reference PNGs (happened 2026-09-24).
for d in node_modules comparison/texer_pngs comparison/asy_src; do
  [ -e "$d" ] || continue
  win=$(cygpath -w "$d")
  if powershell -NoProfile -Command "if ((Get-Item -Force '$win').LinkType -eq 'Junction') { exit 0 } else { exit 1 }"; then
    # Removing a junction with Directory.Delete (non-recursive) drops the link only.
    powershell -NoProfile -Command "[System.IO.Directory]::Delete('$win', \$false)" && echo "unlinked $d"
  fi
done
left=$(powershell -NoProfile -Command "Get-ChildItem -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName")
if [ -n "$left" ]; then echo "STILL LINKED (do not remove this worktree):"; echo "$left"; exit 1; fi
echo "no links left; safe to remove this worktree"
