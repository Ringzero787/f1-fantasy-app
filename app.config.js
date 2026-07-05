module.exports = {
  expo: {
    name: "Undercut",
    slug: "f1-fantasy-app",
    version: "2.1.9",
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
      backgroundColor: "#0D1117"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.undercut.app",
      buildNumber: "36",
      usesAppleSignIn: true,
      googleServicesFile: process.env.GOOGLE_SERVICES_IOS ?? "./GoogleService-Info.plist",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0D1117"
      },
      package: "com.undercut.app",
      versionCode: 50,
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
      ["expo-build-properties", {
        ios: {
          useFrameworks: "static",
        },
        android: {
          targetSdkVersion: 35,
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
        // Embed the Race Day faces natively (family name = file name) so
        // release builds don't depend on expo-font's runtime asset loading,
        // which fails in release ("Unable to download asset from url:").
        fonts: [
          "./node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf",
          "./node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf",
          "./node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf",
          "./node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf",
          "./node_modules/@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf",
          "./node_modules/@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf",
          "./node_modules/@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf",
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
