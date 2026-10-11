"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "@/lib/document-navigation";

export default function PasswordLogin({
  returnTo,
  message,
  register = false,
  verified = false,
}: {
  returnTo: string;
  message?: string;
  register?: boolean;
  verified?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register" | "verify" | "reset">(
      register ? "register" : "login",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [resetSent, setResetSent] = useState(false),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function switchTo(next: typeof mode) {
    setMode(next);
    setError("");
    setResetSent(false);
    if (next !== "verify") setPassword("");
  }
  async function submit(event?: FormEvent, resend = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    const endpoint = resend
      ? "resend-verification"
      : mode === "register"
        ? "register"
        : mode === "reset"
          ? "reset-password"
          : "password-login";
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(mode !== "reset" ? { password } : {}),
          return_to: returnTo,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        needs_verification?: boolean;
      };
      if (!response.ok)
        throw new Error(
          result.error || "Det gick inte att logga in. Försök igen.",
        );
      if (mode === "reset") {
        setResetSent(true);
        setCooldown(60);
      } else if (result.needs_verification) {
        setMode("verify");
        setCooldown(resend || mode === "register" ? 60 : 0);
      } else {
        setPassword("");
        // Discard data fetched before this new session was established.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(
          `/konto?complete=1&return_to=${encodeURIComponent(returnTo)}`,
        );
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const heading =
    mode === "verify"
      ? "Bekräfta din e-post"
      : mode === "register"
        ? "Skapa konto"
        : mode === "reset"
          ? "Glömt lösenordet?"
          : "Logga in på AllTing";
  return (
    <section className="account-intro narrow stack">
      <div className="eyebrow">Välkommen till AllTing</div>
      <h1>{heading}</h1>
      {mode === "verify" ? (
        <>
          <p>
            Öppna verifieringsmejlet till <strong>{email}</strong> och bekräfta
            adressen. Kom sedan tillbaka och logga in.
          </p>
          <p className="muted">
            Hittar du inte mejlet? Titta i skräpposten. Du behöver bekräfta
            adressen innan du kan lägga upp saker eller föreslå byten.
          </p>
          <button
            className="button full"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Till inloggningen
          </button>
          <button
            className="outline full"
            disabled={busy || cooldown > 0}
            onClick={() => void submit(undefined, true)}
          >
            {busy
              ? "Skickar…"
              : cooldown
                ? `Skicka igen om ${cooldown} sekunder`
                : "Skicka verifieringsmejlet igen"}
          </button>
        </>
      ) : (
        <>
          <p>
            {mode === "reset"
              ? "Ange din e-postadress så skickar vi en länk där du kan välja ett nytt lösenord."
              : message ||
                (mode === "register"
                  ? "Skapa ett konto för att lägga upp saker och föreslå byten."
                  : "Logga in för att fortsätta där du var.")}
          </p>
          {verified && mode === "login" && (
            <p className="notice" role="status">
              Har du bekräftat din e-post? Logga in för att fortsätta.
            </p>
          )}
          {resetSent && (
            <p role="status">
              Om adressen är registrerad får du ett mejl med en länk. Titta även
              i skräpposten.
            </p>
          )}
          <form onSubmit={(e) => void submit(e)} className="stack">
            <label>
              E-postadress
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode !== "reset" && (
              <label>
                Lösenord
                <input
                  type="password"
                  aria-label="Lösenord"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "register" ? 10 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === "register" && (
                  <small className="muted">
                    Minst 10 tecken. En längre fras fungerar bra.
                  </small>
                )}
              </label>
            )}
            <button
              className="button full"
              disabled={busy || (mode === "reset" && cooldown > 0)}
            >
              {busy
                ? "Vänta…"
                : mode === "register"
                  ? "Skapa konto"
                  : mode === "reset"
                    ? cooldown
                      ? `Skicka igen om ${cooldown} sekunder`
                      : "Skicka återställningslänk"
                    : "Logga in"}
            </button>
          </form>
          {mode === "login" ? (
            <>
              <button className="text-button" onClick={() => switchTo("reset")}>
                Glömt lösenordet?
              </button>
              <p>
                Ny här?{" "}
                <button
                  className="text-button"
                  onClick={() => switchTo("register")}
                >
                  Skapa konto
                </button>
              </p>
            </>
          ) : (
            <button className="text-button" onClick={() => switchTo("login")}>
              Till inloggningen
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted">Din e-post visas aldrig för andra användare.</p>
      <Link href="/">Tillbaka till sakerna</Link>
      <Link href="/regler">Läs våra regler och om dina uppgifter</Link>
    </section>
  );
}
