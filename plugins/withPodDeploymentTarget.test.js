// node --test plugins/*.test.js — pods are raised to the app's iOS minimum (Xcode 27).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { injectPodDeploymentTarget, MIN_IOS } = require('./withPodDeploymentTarget');

// The post_install block of the Podfile expo prebuild generates (SDK in use, 2026-11-24).
const PODFILE = `target 'Undercut' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

test('adds the raise inside post_install, after react_native_post_install', () => {
  const out = injectPodDeploymentTarget(PODFILE);
  const rn = out.indexOf('react_native_post_install(');
  const raise = out.indexOf("c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'");
  const end = out.indexOf('  end\nend');
  assert.ok(rn > 0 && raise > rn && raise < end, out);
  assert.equal(MIN_IOS, '15.1');
});

test('only raises: a pod already above the minimum keeps its target', () => {
  assert.match(injectPodDeploymentTarget(PODFILE), /if v\.nil\? \|\| Gem::Version\.new\(v\) < Gem::Version\.new\('15\.1'\)/);
});

test('idempotent: a second prebuild does not add it twice', () => {
  const once = injectPodDeploymentTarget(PODFILE);
  assert.equal(injectPodDeploymentTarget(once), once);
});

test('a changed Podfile template stops the prebuild instead of building without the fix', () => {
  assert.throws(() => injectPodDeploymentTarget("target 'Undercut' do\nend\n"), /no react_native_post_install/);
});

test('the fmt pod is compiled as C++17 (Xcode 27 rejects its consteval format strings), and only fmt', () => {
  const out = injectPodDeploymentTarget(PODFILE);
  assert.match(out, /c\.build_settings\['CLANG_CXX_LANGUAGE_STANDARD'\] = 'c\+\+17' if t\.name == 'fmt'/);
});
