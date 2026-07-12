const { getDefaultConfig } = require('expo/metro-config');

// Track Limits must have its own metro config. Without one, Metro's config
// search walks up to the repo root and loads Undercut's metro.config.js,
// whose projectRoot is /data/f1-app — expo-router then silently bundles
// Undercut's app/ into Track Limits builds (shipped as the 0.1.27/vc28
// instant-crash: Undercut JS requiring native modules TL doesn't have).
module.exports = getDefaultConfig(__dirname);
