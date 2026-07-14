// generate-bitmaps.js — Creates NSIS sidebar BMP images in the dark red theme
const sharp = require('sharp');
const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

async function go() {
  const sW = 164, sH = 314;

  const svg = `<svg width="${sW}" height="${sH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d0000"/>
        <stop offset="35%" stop-color="#2a0000"/>
        <stop offset="65%" stop-color="#3d0000"/>
        <stop offset="100%" stop-color="#0d0000"/>
      </linearGradient>
      <linearGradient id="line" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cc0000" stop-opacity="0"/>
        <stop offset="50%" stop-color="#cc0000" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#cc0000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${sW}" height="${sH}" fill="url(#bg)"/>
    <rect x="160" y="0" width="2" height="${sH}" fill="url(#line)"/>
    <text x="82" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" letter-spacing="3" fill="#ff4d4d">VESPER</text>
    <text x="82" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" letter-spacing="3" fill="#ff4d4d">CONVERTOR</text>
    <line x1="40" y1="68" x2="124" y2="68" stroke="#990000" stroke-width="1"/>
    <text x="82" y="84" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" fill="#7a4444" letter-spacing="1">LOCAL FILE CONVERSION</text>
    <text x="82" y="296" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" fill="#7a4444" opacity="0.6">Developer: Ayush.ue5</text>
  </svg>`;

  const tmpPng = path.join('build', '_sidebar.png');
  const outBmp = path.join('build', 'installerSidebar.bmp');

  await sharp(Buffer.from(svg)).png().toFile(tmpPng);
  execSync(`"${ffmpegPath}" -y -i "${tmpPng}" "${outBmp}"`, { stdio: 'ignore' });
  fs.unlinkSync(tmpPng);
  fs.copyFileSync(outBmp, path.join('build', 'uninstallerSidebar.bmp'));

  console.log('Created: build/installerSidebar.bmp');
  console.log('Created: build/uninstallerSidebar.bmp');
}

go().catch(e => { console.error(e); process.exit(1); });
