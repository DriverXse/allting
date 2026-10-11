import { CONSENT_BOOTSTRAP } from "./consent";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export const DEFAULT_THEME: ThemePreference = "light";
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export const THEME_STORAGE_KEY = "allting-appearance";

// Runs before the first paint, including when storage is blocked. Only a visual
// preference is cached here; account data and authentication stay on the server.
export const APPEARANCE_BOOTSTRAP = `(()=>{${CONSENT_BOOTSTRAP}let p="${DEFAULT_THEME}";try{if(c.split(".")[2]==="1"){const v=localStorage.getItem("${THEME_STORAGE_KEY}");if(v==="light"||v==="dark"||v==="system")p=v}}catch{}const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.appearance=p;document.documentElement.dataset.theme=d?"dark":"light";const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=d?"#171d19":"#275544"})()`;
