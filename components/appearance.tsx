"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/appearance";
import { browserConsent } from "./consent";

function cachedPreference(): ThemePreference {
  try {
    if (!browserConsent()?.preferences) return DEFAULT_THEME;
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system")
      return value;
  } catch {}
  return DEFAULT_THEME;
}
function apply(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.appearance = preference;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta) meta.content = dark ? "#171d19" : "#275544";
  window.dispatchEvent(new Event("allting-appearance-render"));
}
function subscribe(listener: () => void) {
  window.addEventListener("allting-appearance-render", listener);
  return () =>
    window.removeEventListener("allting-appearance-render", listener);
}
function snapshot(): ThemePreference {
  const value = document.documentElement.dataset.appearance;
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_THEME;
}
export function useAppearancePreference() {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_THEME);
}
export function setAppearance(preference: ThemePreference) {
  try {
    if (browserConsent()?.preferences)
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {}
  apply(preference);
  window.dispatchEvent(
    new CustomEvent("allting-appearance", { detail: preference }),
  );
}
export function AppearanceSync({
  preference,
}: {
  preference?: ThemePreference;
}) {
  useEffect(() => {
    // The signed-in account wins over this browser's last choice.
    if (preference) setAppearance(preference);
    let current = preference ?? cachedPreference();
    apply(current);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const systemChanged = () => apply(current);
    const choiceChanged = (event: Event) => {
      current = (event as CustomEvent<ThemePreference>).detail;
      apply(current);
    };
    const storageChanged = (event: StorageEvent) => {
      if (!browserConsent()?.preferences) return;
      // Removing the cache (including consent withdrawal) must not replace
      // the account's current preference with the guest default.
      if (event.newValue === null) return;
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        current = cachedPreference();
        apply(current);
      }
    };
    const show = () => apply(current);
    const consentChanged = () => setAppearance(current);
    media.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("allting-appearance", choiceChanged);
    window.addEventListener("pageshow", show);
    window.addEventListener("allting-consent", consentChanged);
    return () => {
      media.removeEventListener("change", systemChanged);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("allting-appearance", choiceChanged);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("allting-consent", consentChanged);
    };
  }, [preference]);
  return null;
}
