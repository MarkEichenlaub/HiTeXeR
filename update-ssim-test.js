'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const SVG_DIR = 'comparison/htx_svgs';
const HTX_DIR = 'comparison/htx_pngs';
const ASY_DIR = 'comparison/asy_pngs';

// Copy new SVGs into place
const testIds = ['06814','06816','05799','06841','05677','05856','05616','05632','05666'];
for (const id of testIds) {
  const newSvg = path.join(SVG_DIR, id + '_new.svg');
  const mainSvg = path.join(SVG_DIR, id + '.svg');
  if (fs.existsSync(newSvg)) {
    fs.copyFileSync(newSvg, mainSvg);
    console.log('Copied ' + id + '_new.svg -> ' + id + '.svg');
  }
}

async function main() {
  // Re-rasterize the test SVGs
  console.log('\nRasterizing SVGs...');
  for (const id of testIds) {
    const svgPath = path.join(SVG_DIR, id + '.svg');
    const pngPath = path.join(HTX_DIR, id + '.png');
    if (!fs.existsSync(svgPath)) { console.log(id + ': no SVG'); continue; }
    try {
      const svgBuf = fs.readFileSync(svgPath);
      await sharp(svgBuf, { density: 320 }).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toFile(pngPath);
      console.log(id + ': rasterized');
    } catch(e) { console.log(id + ': rasterize error: ' + e.message); }
  }

  // Compute SSIM for just these IDs
  console.log('\nComputing SSIM...');
  const MAX = 400;

  for (const id of testIds) {
    const asyPath = path.join(ASY_DIR, id + '.png');
    const htxPath = path.join(HTX_DIR, id + '.png');
    if (!fs.existsSync(asyPath)) { console.log(id + ': no asy PNG'); continue; }
    if (!fs.existsSync(htxPath)) { console.log(id + ': no htx PNG'); continue; }

    try {
      const asyMeta = await sharp(asyPath).metadata();
      const htxMeta = await sharp(htxPath).metadata();

      const asyScale = Math.min(MAX / asyMeta.width, MAX / asyMeta.height, 1);
      const asyW = Math.round(asyMeta.width * asyScale);
      const asyH = Math.round(asyMeta.height * asyScale);

      const htxScale = Math.min(MAX / htxMeta.width, MAX / htxMeta.height, 1);
      const htxW = Math.round(htxMeta.width * htxScale);
      const htxH = Math.round(htxMeta.height * htxScale);

      const canvasW = Math.max(asyW, htxW, 8);
      const canvasH = Math.max(asyH, htxH, 8);

      const asyBuf = await sharp(asyPath).flatten({ background: { r:255,g:255,b:255 } })
        .resize(asyW, asyH, { fit: 'fill' })
        .extend({ top: Math.round((canvasH-asyH)/2), bottom: canvasH-asyH-Math.round((canvasH-asyH)/2),
                  left: Math.round((canvasW-asyW)/2), right: canvasW-asyW-Math.round((canvasW-asyW)/2),
                  background: { r:255,g:255,b:255 } })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });

      const htxBuf = await sharp(htxPath).flatten({ background: { r:255,g:255,b:255 } })
        .resize(htxW, htxH, { fit: 'fill' })
        .extend({ top: Math.round((canvasH-htxH)/2), bottom: canvasH-htxH-Math.round((canvasH-htxH)/2),
                  left: Math.round((canvasW-htxW)/2), right: canvasW-htxW-Math.round((canvasW-htxW)/2),
                  background: { r:255,g:255,b:255 } })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });

      const w = asyBuf.info.width, h = asyBuf.info.height;
      function toRGBA(buf, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          rgba[i*4]=buf[i*3]; rgba[i*4+1]=buf[i*3+1]; rgba[i*4+2]=buf[i*3+2]; rgba[i*4+3]=255;
        }
        return rgba;
      }
      const asyImg = { data: toRGBA(asyBuf.data,w,h), width: w, height: h };
      const htxImg = { data: toRGBA(htxBuf.data,w,h), width: w, height: h };
      const { mssim } = computeSSIM(asyImg, htxImg);
      console.log(id + ': SSIM=' + mssim.toFixed(4) + '  asy=' + asyMeta.width + 'x' + asyMeta.height + '  htx=' + htxMeta.width + 'x' + htxMeta.height);
    } catch(e) { console.log(id + ': SSIM error: ' + e.message); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
