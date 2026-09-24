#!/bin/sh
# Run inside a git worktree of HiTeXeR: links the untracked corpus data and
# node_modules from the main checkout so the refactor/ harnesses work there.
#   sh refactor/link-data.sh [/c/Users/markd/github/HiTeXeR]
MAIN="${1:-/c/Users/markd/github/HiTeXeR}"
for d in node_modules comparison/asy_src comparison/texer_pngs refactor/conformance/.cache; do
  [ -e "$d" ] && continue
  mkdir -p "$(dirname "$d")"
  cmd //c mklink /J "$(cygpath -w "$d")" "$(cygpath -w "$MAIN/$d")" > /dev/null && echo "linked $d"
done
