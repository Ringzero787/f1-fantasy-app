module.exports = {
  expo: {
    name: "Undercut",
    slug: "f1-fantasy-app",
    version: "2.3.3",
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
      buildNumber: "41",
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
      versionCode: 58,
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
          extraProguardRules: "-keep class com.facebook.hermes.** { *; }",
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
