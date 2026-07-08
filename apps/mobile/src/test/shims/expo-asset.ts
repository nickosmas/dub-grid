// Test shim for expo-asset — no native asset system in jsdom.
export class Asset {
  uri = "";
  localUri: string | null = null;
  static fromModule(): Asset {
    return new Asset();
  }
  static fromURI(): Asset {
    return new Asset();
  }
  async downloadAsync(): Promise<Asset> {
    return this;
  }
}
export default { Asset };
