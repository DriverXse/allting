export const CONSENT_COOKIE = "allting-consent";
export const CONSENT_DAYS = 180;
export const CONSENT_MAX_AGE = CONSENT_DAYS * 86400;
export type Consent = {
  preferences: boolean;
  statistics: boolean;
  savedAt: number;
};

// A consent record is a choice, never an authentication or authorization token.
export function parseConsent(
  value: string | undefined,
  now = Date.now(),
): Consent | null {
  const match = /^1\.(\d{13})\.([01])\.([01])$/.exec(value || "");
  if (!match) return null;
  const savedAt = Number(match[1]);
  if (savedAt > now + 300000 || now - savedAt >= CONSENT_MAX_AGE * 1000)
    return null;
  return {
    savedAt,
    preferences: match[2] === "1",
    statistics: match[3] === "1",
  };
}
export function consentFromCookie(cookie: string | null, now = Date.now()) {
  const values = (cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  // Ambiguous duplicate cookies fail closed.
  return values.length === 1
    ? parseConsent(values[0].slice(CONSENT_COOKIE.length + 1), now)
    : null;
}
export function encodeConsent(consent: Consent) {
  return `1.${consent.savedAt}.${Number(consent.preferences)}.${Number(consent.statistics)}`;
}

// Shared by the normal document and the standalone offline document.
export const CONSENT_BOOTSTRAP = `let c="";try{const a=document.cookie.split(";").map(x=>x.trim()).filter(x=>x.startsWith("${CONSENT_COOKIE}="));if(a.length===1){const v=a[0].slice(${CONSENT_COOKIE.length + 1}),m=/^1\\.(\\d{13})\\.([01])\\.([01])$/.exec(v);if(m&&+m[1]<=Date.now()+300000&&Date.now()-+m[1]<${CONSENT_MAX_AGE * 1000})c=v}}catch{}document.documentElement.dataset.consent=c;`;
