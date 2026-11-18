// Undercut lint (ESLint 8 legacy config; eslint-config-expo 9's flat config needs ESLint 9 — F-034).
// The Cloud Functions have their own toolchain and are excluded here.
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['functions/', 'dist/', 'android/', 'android-bundle/', 'undercut-site/', 'node_modules/', 'scripts/', '*.js', '*.cjs'],
};
