#!/bin/sh
# Run inside a git worktree of HiTeXeR: links the untracked corpus data and
# node_modules from the main checkout so the refactor/ harnesses work there.
#   sh refactor/link-data.sh [/c/Users/markd/github/HiTeXeR]
# comparison/asy_src is partly tracked, so a worktree already has that folder
# with only the tracked files; it's replaced by a link to the full corpus.
# The conformance cache is copied, not linked: run.js prunes stale entries.
MAIN="${1:-/c/Users/markd/github/HiTeXeR}"
link() {
  win_link=$(cygpath -w "$1"); win_target=$(cygpath -w "$MAIN/$1")
  # cmd's mklink mis-parses MSYS-converted switches; PowerShell doesn't.
  powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$win_link' -Target '$win_target' | Out-Null" && echo "linked $1"
}
for d in node_modules comparison/texer_pngs; do
  [ -e "$d" ] || { mkdir -p "$(dirname "$d")"; link "$d"; }
done
if [ -d comparison/asy_src ] && [ ! -L comparison/asy_src ] && [ "$(ls comparison/asy_src | wc -l)" -lt 10000 ]; then
  mv comparison/asy_src comparison/asy_src.tracked && link comparison/asy_src
fi
[ -e comparison/asy_src ] || link comparison/asy_src
if [ ! -e refactor/conformance/.cache ] && [ -d "$MAIN/refactor/conformance/.cache" ]; then
  cp -r "$MAIN/refactor/conformance/.cache" refactor/conformance/.cache && echo "copied conformance cache"
fi
