// Test shim for expo-constants. Defaults executionEnvironment to StoreClient
// (Expo Go), under which push registration short-circuits — so tests don't hit
// native push APIs.
export enum ExecutionEnvironment {
  Bare = "bare",
  Standalone = "standalone",
  StoreClient = "storeClient",
}

const Constants = {
  executionEnvironment: ExecutionEnvironment.StoreClient,
};

export default Constants;
