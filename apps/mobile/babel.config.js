const { expoRouterBabelPlugin } = require("babel-preset-expo/build/expo-router-plugin");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // In this monorepo, expo-router is installed only in apps/mobile, so the
    // preset doesn't auto-detect it from the repo root. Add the underlying
    // plugin directly to keep the router env transforms without the deprecated wrapper.
    plugins: [expoRouterBabelPlugin],
  };
};
