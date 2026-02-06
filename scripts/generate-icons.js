const sharp = require('sharp');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const F1_RED = '#E10600';
const WHITE = '#FFFFFF';

async function generateIcons() {
  console.log('Generating app icons...');

  // Create icon.png (1024x1024) - App icon
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: F1_RED,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1024" height="1024">
            <rect width="1024" height="1024" fill="${F1_RED}"/>
            <text x="512" y="580" font-size="400" font-weight="bold" fill="${WHITE}" text-anchor="middle" font-family="Arial, sans-serif">F1</text>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('✓ icon.png (1024x1024)');

  // Create adaptive-icon.png (1024x1024) - Android adaptive icon foreground
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1024" height="1024">
            <text x="512" y="580" font-size="400" font-weight="bold" fill="${WHITE}" text-anchor="middle" font-family="Arial, sans-serif">F1</text>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(path.join(ASSETS_DIR, 'adaptive-icon.png'));
  console.log('✓ adaptive-icon.png (1024x1024)');

  // Create splash.png (1284x2778) - Splash screen
  await sharp({
    create: {
      width: 1284,
      height: 2778,
      channels: 4,
      background: F1_RED,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1284" height="2778">
            <rect width="1284" height="2778" fill="${F1_RED}"/>
            <text x="642" y="1400" font-size="300" font-weight="bold" fill="${WHITE}" text-anchor="middle" font-family="Arial, sans-serif">F1</text>
            <text x="642" y="1650" font-size="80" fill="${WHITE}" text-anchor="middle" font-family="Arial, sans-serif">FANTASY</text>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash.png'));
  console.log('✓ splash.png (1284x2778)');

  // Create favicon.png (48x48) - Web favicon
  await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: F1_RED,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="48" height="48">
            <rect width="48" height="48" fill="${F1_RED}"/>
            <text x="24" y="32" font-size="20" font-weight="bold" fill="${WHITE}" text-anchor="middle" font-family="Arial, sans-serif">F1</text>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(path.join(ASSETS_DIR, 'favicon.png'));
  console.log('✓ favicon.png (48x48)');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
