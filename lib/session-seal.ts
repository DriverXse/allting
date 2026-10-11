// Firebase refresh credentials are server-only and encrypted separately for each
// AllTing session. Password changes must also invalidate older AllTing sessions.
async function key(secret: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`allting:firebase-session:v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
export async function sealSessionCredential(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(value),
  );
  return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
export async function openSessionCredential(value: string, secret: string) {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("Invalid session credential");
  const bytes = (text: string) =>
    Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(parts[0]) },
    await key(secret),
    bytes(parts[1]),
  );
  return new TextDecoder().decode(plaintext);
}
