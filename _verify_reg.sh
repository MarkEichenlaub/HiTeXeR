#!/bin/bash
for id in 12992 12997 12908 01363 02218 12728 12737 12895 00111 00016 02698 02122 00405 00013 00259 00062 00300 00325 02549; do
  node _render_one.js $id > /dev/null 2>&1
  node _render_at_base.js $id > /dev/null 2>&1
  a=$(md5sum _${id}.png | cut -d' ' -f1)
  b=$(md5sum _base_${id}.png | cut -d' ' -f1)
  if [ "$a" == "$b" ]; then echo "$id PHANTOM (base==new)"; else
    da=$(node -e "const s=require('sharp');s('_${id}.png').metadata().then(m=>console.log(m.width+'x'+m.height))")
    db=$(node -e "const s=require('sharp');s('_base_${id}.png').metadata().then(m=>console.log(m.width+'x'+m.height))")
    echo "$id REAL-DIFF new=$da base=$db"
  fi
done
echo VERIFY_DONE
