module.exports = {
  expo: {
    name: "Undercut",
    slug: "f1-fantasy-app",
    version: "2.4.0",
    orientation: "default",
    icon: "./assets/icon.png",
    scheme: "theundercut",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
    updates: {
      url: "https://u.expo.dev/e79dd8e5-5f63-40f9-a153-87c5225a2516"
    },
    runtimeVersion: "1.0.0",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0E0E0E"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.undercut.app",
      buildNumber: "43",
      usesAppleSignIn: true,
      googleServicesFile: process.env.GOOGLE_SERVICES_IOS ?? "./GoogleService-Info.plist",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0E0E0E"
      },
      package: "com.undercut.app",
      versionCode: 60,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      blockedPermissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
      ]
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png"
    },
    plugins: [
      // Re-injects the Undercut release signing config that `expo prebuild
      // --clean` wipes from android/app/build.gradle (F-048). Password from
      // UC_KEYSTORE_PASSWORD or the untracked .signing.env, read only at prebuild.
      "./plugins/withReleaseSigning",
      ["expo-build-properties", {
        ios: {
          useFrameworks: "static",
        },
        android: {
          targetSdkVersion: 36,
          compileSdkVersion: 36,
          buildToolsVersion: "36.0.0",
          ndkVersion: "27.1.12297006",
          useLegacyPackaging: false,
          edgeToEdgeEnabled: true,
          // R8: shrink and obfuscate the release build (Play Console's "R8 optimization" advice).
          // Expo modules and Reanimated ship their own keep rules; these cover the rest of the
          // native surface, whose classes are reached by name at runtime.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          extraProguardRules: [
            "-keep class com.facebook.hermes.** { *; }",
            "-keep class com.facebook.jni.** { *; }",
            "-keep class com.facebook.react.** { *; }",
            "-keep class com.swmansion.** { *; }",
            "-keep class com.horcrux.svg.** { *; }",
            "-keep class com.reactnativegooglesignin.** { *; }",
            "-keep class com.google.android.gms.auth.** { *; }",
            "-keep class expo.modules.** { *; }",
            "-keep class com.undercut.app.** { *; }",
            "-dontwarn com.google.android.gms.**",
            "-dontwarn okhttp3.**",
            "-dontwarn okio.**",
          ].join("\n"),
        },
      }],
      "expo-router",
      "expo-asset",
      ["expo-font", {
        // Embed the Grid faces natively (family name = file name) so
        // release builds don't depend on expo-font's runtime asset loading,
        // which fails in release ("Unable to download asset from url:").
        fonts: [
          "./node_modules/@expo-google-fonts/unbounded/400Regular/Unbounded_400Regular.ttf",
          "./node_modules/@expo-google-fonts/unbounded/700Bold/Unbounded_700Bold.ttf",
          "./node_modules/@expo-google-fonts/unbounded/900Black/Unbounded_900Black.ttf",
          "./node_modules/@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf",
          "./node_modules/@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf",
        ],
      }],
      "expo-web-browser",
      "expo-image",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set your profile picture."
        }
      ],
      ...(process.env.EXPO_PUBLIC_STORE === 'amazon' ? [] : ["@react-native-google-signin/google-signin"]),
      // In-app purchase. The Amazon build must use the Amazon flavour of the billing library, which
      // is a different native dependency and a different gradle flavour, so the same switch that
      // drops Google Sign-In selects it. The build scripts assert the result either way, because
      // getting this wrong produces a build that looks fine and cannot sell anything.
      ["expo-iap", { modules: { amazon: { fireOS: process.env.EXPO_PUBLIC_STORE === 'amazon' } } }],
      "expo-apple-authentication",
      "expo-notifications",
      "expo-secure-store",
    ],
    experiments: {
      typedRoutes: true
    },
    privacyPolicyUrl: "https://undercut.humannpc.com/privacy",
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: "e79dd8e5-5f63-40f9-a153-87c5225a2516"
      }
    }
  }
};
