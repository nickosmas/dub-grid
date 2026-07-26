import { spawnSync } from "child_process";

// Mobile onboarding-seen state (and session/last-org) lives in device
// storage (SecureStore/EncryptedSharedPreferences), which `npm run db:reset`
// can't reach — it only wipes the local Supabase DB from the host machine.
// `adb shell pm clear` reliably wipes that app storage on a booted Android
// emulator, so we best-effort call it here. This is a no-op warning, never a
// failure, so `npm run db:reset:mobile` never breaks a run just because no
// emulator happens to be attached.
const PACKAGE_ID = "com.dubgrid.mobile";

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function main() {
  const devices = run("adb", ["devices"]);
  if (devices.error || devices.status !== 0) {
    console.warn(
      "[reset-mobile-android-storage] `adb` not available — skipping Android storage clear.",
    );
    return;
  }

  const hasDevice = devices.stdout
    .split("\n")
    .slice(1)
    .some((line) => line.trim().endsWith("\tdevice"));

  if (!hasDevice) {
    console.warn(
      "[reset-mobile-android-storage] No booted emulator/device found — skipping Android storage clear.",
    );
    return;
  }

  const result = run("adb", ["shell", "pm", "clear", PACKAGE_ID]);
  if (result.status === 0 && result.stdout?.trim() === "Success") {
    console.log(
      `[reset-mobile-android-storage] Cleared ${PACKAGE_ID} storage — onboarding will show again on next launch.`,
    );
    return;
  }

  console.warn(
    `[reset-mobile-android-storage] Could not clear ${PACKAGE_ID} (app may not be installed) — skipping.`,
  );
}

main();
