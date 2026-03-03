module.exports = {
  expo: {
    name: "Undercut",
    slug: "f1-fantasy-app",
    version: "1.4.0",
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
      buildNumber: "12",
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
      versionCode: 18,
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
        },
      }],
      "expo-router",
      "expo-asset",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set your profile picture."
        }
      ],
      "@react-native-google-signin/google-signin",
      "expo-apple-authentication",
      "react-native-iap",
      "expo-notifications",
      "expo-secure-store",
      // "@react-native-firebase/app-check",
      // "@react-native-firebase/crashlytics",
    ],
    experiments: {
      typedRoutes: true
    },
    privacyPolicyUrl: "https://f1-app-18077.web.app/privacy.html",
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
