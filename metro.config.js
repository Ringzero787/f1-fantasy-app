const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// zustand's ESM entry uses `import.meta`, which Metro's classic-script web
// bundles can't execute (blank screen + SyntaxError in web dev). On web only,
// resolve zustand specifiers straight to their CJS files; native untouched.
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
