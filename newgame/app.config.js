module.exports = {
  expo: {
    name: "Track Limits",
    slug: "track-limits",
    version: "0.1.34",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "tracklimits",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0D1117"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.tracklimits.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0D1117"
      },
      package: "com.tracklimits.app",
      googleServicesFile: "./google-services.json",
      versionCode: 35
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "@react-native-google-signin/google-signin",
      "expo-notifications",
      "./plugins/withReleaseSigning"
    ],
    experiments: {
      typedRoutes: true
    }
  }
};
