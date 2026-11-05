import { isTauri } from "./backend";

/** True inside the installed phone app (Android or iOS), where fingerprint unlock exists. */
export const isMobileApp = () => isTauri() && /android|iphone|ipad/i.test(navigator.userAgent);

/** True inside the Android app only (widget, screenshot and recents options exist there). */
export const isAndroidApp = () => isTauri() && /android/i.test(navigator.userAgent);
