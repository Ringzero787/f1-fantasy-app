const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// zustand's ESM entry uses `import.meta`, which Metro's classic-script web
// bundles can't execute. Drop the "import" condition so package-exports
// resolution picks each package's CJS build instead.
config.resolver.unstable_conditionNames = ['browser', 'require', 'react-native'];

module.exports = config;
