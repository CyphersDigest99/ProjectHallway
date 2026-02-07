/**
 * Icon Setup Instructions for Project Hallway
 *
 * The SVG icon has been created at build/icon.svg
 *
 * To create the Windows .ico file:
 *
 * Option 1: Online Converter (Easiest)
 *   1. Go to https://cloudconvert.com/svg-to-ico
 *   2. Upload build/icon.svg
 *   3. Set size to 256x256
 *   4. Download and save as build/icon.ico
 *
 * Option 2: Using Inkscape (Free software)
 *   1. Install Inkscape from https://inkscape.org
 *   2. Open build/icon.svg
 *   3. File -> Export PNG Image (512x512)
 *   4. Save as build/icon.png
 *   5. Use https://convertico.com to convert PNG to ICO
 *
 * Option 3: Using GIMP (Free software)
 *   1. Install GIMP from https://gimp.org
 *   2. Open build/icon.svg (choose 512x512 import size)
 *   3. File -> Export As -> icon.ico
 *   4. Save to build/icon.ico
 *
 * After creating icon.ico, run: npm run dist:win
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const icoPath = path.join(buildDir, 'icon.ico');

console.log('\n=== Project Hallway Icon Setup ===\n');

if (fs.existsSync(svgPath)) {
  console.log('SVG icon exists: build/icon.svg');
} else {
  console.log('ERROR: build/icon.svg not found!');
  process.exit(1);
}

if (fs.existsSync(icoPath)) {
  console.log('ICO icon exists: build/icon.ico');
  console.log('\nYou can build the app now:');
  console.log('  npm run dist:win\n');
} else {
  console.log('ICO icon missing: build/icon.ico\n');
  console.log('To create the Windows icon:');
  console.log('');
  console.log('1. Go to: https://cloudconvert.com/svg-to-ico');
  console.log('2. Upload: build/icon.svg');
  console.log('3. Set size: 256x256');
  console.log('4. Download and save as: build/icon.ico');
  console.log('');
  console.log('Then run: npm run dist:win\n');
}
