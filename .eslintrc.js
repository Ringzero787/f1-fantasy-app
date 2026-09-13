// Undercut lint (ESLint 8 legacy config; eslint-config-expo 9's flat config needs ESLint 9 — F-034).
// Track Limits (newgame/) and the Cloud Functions have their own toolchains and are excluded here.
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['newgame/', 'functions/', 'dist/', 'android/', 'android-bundle/', 'undercut-site/', 'node_modules/', 'scripts/', '*.js', '*.cjs'],
};
