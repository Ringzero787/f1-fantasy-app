// withPodDeploymentTarget — Expo config plugin that raises every CocoaPods target's
// IPHONEOS_DEPLOYMENT_TARGET to the app's minimum after `pod install`.
//
// Several pods (GTMAppAuth, GoogleUtilities, GoogleSignIn, ReachabilitySwift, …) still declare
// iOS 12.0. Xcode up to 26 only warned; Xcode 27 (on the Mac Mini since 2026-11-17) refuses to
// archive them ("The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 12.0, but the
// range of supported deployment target versions is 15.0 to 27.2.x"), which failed the 2.9.0 iOS
// build. `expo prebuild --clean` regenerates ios/Podfile, so the fix has to live here.

const { withPodfile } = require('@expo/config-plugins');

const MIN_IOS = '15.1'; // the Podfile's own platform default (podfile_properties['ios.deploymentTarget'] || '15.1')
const MARKER = '# withPodDeploymentTarget';

/** Pure: the Podfile with the raise added at the end of its post_install block (once). */
function injectPodDeploymentTarget(podfile, minIos = MIN_IOS) {
  if (podfile.includes(MARKER)) return podfile;
  const anchor = /(post_install do \|installer\|\n[\s\S]*?react_native_post_install\([\s\S]*?\n\s*\)\n)/;
  if (!anchor.test(podfile)) {
    throw new Error('withPodDeploymentTarget: no react_native_post_install(...) block in ios/Podfile; update the plugin for the new template');
  }
  const block = [
    `    ${MARKER}: Xcode 27 refuses pods below iOS ${minIos}`,
    '    installer.pods_project.targets.each do |t|',
    '      t.build_configurations.each do |c|',
    "        v = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
    `        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minIos}' if v.nil? || Gem::Version.new(v) < Gem::Version.new('${minIos}')`,
    '      end',
    '    end',
    '',
  ].join('\n');
  return podfile.replace(anchor, `$1${block}`);
}

const withPodDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = injectPodDeploymentTarget(cfg.modResults.contents);
    return cfg;
  });

module.exports = withPodDeploymentTarget;
module.exports.injectPodDeploymentTarget = injectPodDeploymentTarget;
module.exports.MIN_IOS = MIN_IOS;
