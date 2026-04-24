const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('_test_12788.svg');
sharp(svg, {density: 144})
  .flatten({background: {r:255,g:255,b:255}})
  .png()
  .toFile('_test_12788.png')
  .then(() => console.log('ok'));
