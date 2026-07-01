#!/bin/bash
IDS=$(cat _affected_ids.txt)
IFS=',' read -ra ARR <<< "$IDS"
TOTAL=${#ARR[@]}
CHUNK=700
for ((i=0; i<TOTAL; i+=CHUNK)); do
  SLICE=("${ARR[@]:i:CHUNK}")
  SUB=$(IFS=,; echo "${SLICE[*]}")
  echo "=== chunk starting at $i (${#SLICE[@]} ids) ==="
  node ssim-pipeline.js render-htx rasterize ssim --only "$SUB" 2>&1 | tail -5
done
echo ALL_CHUNKS_DONE
