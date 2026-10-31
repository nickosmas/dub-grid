const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// UIKit linked against the iOS 27 SDK refuses to launch an app that hasn't adopted
// the scene life cycle. Expo 57 ships the scene delegate (`EXExpoAppSceneDelegate`)
// but its template doesn't use it, so prebuild has to: the scene now creates the
// window and starts React Native, from the factory the app delegate still owns.

const START_IN_APP_DELEGATE = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

function replaceOnce(source, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(
      `with-scene-lifecycle: the AppDelegate template changed; "${search.split("\n")[0]}" is missing`,
    );
  }
  return source.replace(search, replacement);
}

function withSceneDelegate(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return plistConfig;
  });
}

function withFactoryProvider(config) {
  return withAppDelegate(config, (delegateConfig) => {
    let source = delegateConfig.modResults.contents;
    if (source.includes("ExpoReactNativeFactoryProvider")) return delegateConfig;
    source = replaceOnce(
      source,
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    source = replaceOnce(source, START_IN_APP_DELEGATE, "");
    delegateConfig.modResults.contents = source;
    return delegateConfig;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withFactoryProvider(withSceneDelegate(config));
};
