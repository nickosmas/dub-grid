const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

function resolveModulePath(moduleName) {
  return path.dirname(
    require.resolve(`${moduleName}/package.json`, {
      paths: [projectRoot, workspaceRoot],
    }),
  );
}

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot]),
);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force Metro to use one React/React Native graph in this monorepo. Duplicate
// React Native copies can initialize devtools twice, which breaks Expo Go on
// startup with Fusebox/renderer errors and a white screen.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@expo/metro-runtime": path.resolve(
    projectRoot,
    "node_modules/expo-router/node_modules/@expo/metro-runtime",
  ),
  react: resolveModulePath("react"),
  "react-dom": resolveModulePath("react-dom"),
  "react-native": resolveModulePath("react-native"),
};

module.exports = config;
