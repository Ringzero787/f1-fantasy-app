export default {
  expo: {
    name: "The Undercut",
    slug: "f1-fantasy-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "theundercut",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
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
      bundleIdentifier: "com.f1fantasy.app",
      usesAppleSignIn: true,
      googleServicesFile: process.env.GOOGLE_SERVICES_IOS ?? "./GoogleService-Info.plist",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FFFFFF"
      },
      package: "com.f1fantasy.app",
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json"
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-asset",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set your profile picture."
        }
      ],
      "@react-native-google-signin/google-signin",
      "expo-apple-authentication"
    ],
    experiments: {
      typedRoutes: true
    },
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
