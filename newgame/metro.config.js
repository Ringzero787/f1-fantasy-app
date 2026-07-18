const { getDefaultConfig } = require('expo/metro-config');

// Track Limits must have its own metro config. Without one, Metro's config
// search walks up to the repo root and loads Undercut's metro.config.js,
// whose projectRoot is /data/f1-app — expo-router then silently bundles
// Undercut's app/ into Track Limits builds (shipped as the 0.1.27/vc28
// instant-crash: Undercut JS requiring native modules TL doesn't have).
const path = require('path');

const config = getDefaultConfig(__dirname);

// Same web-dev fix as the repo root's metro.config.js: zustand's ESM entry
// uses `import.meta`, which Metro's classic-script web bundles can't execute.
// Web only; native resolution untouched.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const sub = moduleName === 'zustand' ? 'index' : moduleName.slice('zustand/'.length);
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'node_modules', 'zustand', `${sub}.js`),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
