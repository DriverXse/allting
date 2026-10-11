"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  consentFromCookie,
  encodeConsent,
  parseConsent,
} from "@/lib/consent";
import { THEME_STORAGE_KEY } from "@/lib/appearance";
import Link from "@/lib/document-navigation";

const EVENT = "allting-consent";
let memoryOnly = false;
function snapshot() {
  return document.documentElement.dataset.consent || "";
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
export function useConsent() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  return parseConsent(value);
}
export function browserConsent() {
  return parseConsent(snapshot());
}
function publish(value: string) {
  document.documentElement.dataset.consent = value;
  if (!parseConsent(value)?.preferences) {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
  }
  window.dispatchEvent(new Event(EVENT));
}
export function saveConsent(preferences: boolean, statistics: boolean) {
  const value = encodeConsent({ preferences, statistics, savedAt: Date.now() });
  try {
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    memoryOnly =
      encodeConsent(
        consentFromCookie(document.cookie) || {
          preferences: false,
          statistics: false,
          savedAt: 0,
        },
      ) !== value;
  } catch {
    memoryOnly = true;
  }
  publish(value);
  try {
    if (!memoryOnly) {
      const channel = new BroadcastChannel(EVENT);
      channel.postMessage("changed");
      channel.close();
    }
  } catch {}
  return !memoryOnly;
}
export function ConsentSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      let value = "";
      try {
        const c = consentFromCookie(document.cookie);
        if (c) value = encodeConsent(c);
      } catch {}
      if (memoryOnly && parseConsent(snapshot())) value = snapshot();
      publish(value);
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      const c = browserConsent();
      if (c)
        timer = setTimeout(
          refresh,
          Math.min(
            2147483647,
            Math.max(1, c.savedAt + CONSENT_MAX_AGE * 1000 - Date.now()),
          ),
        );
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(EVENT);
      channel.onmessage = () => {
        memoryOnly = false;
        refresh();
      };
    } catch {}
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(EVENT, schedule);
    return () => {
      clearTimeout(timer);
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(EVENT, schedule);
    };
  }, []);
  return null;
}
export function CookieConsent({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const consent = useConsent();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [previousOpen, setPreviousOpen] = useState(open);
  const [custom, setCustom] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [statistics, setStatistics] = useState(false);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  // Reset the draft on an explicit reopening, rather than overwriting a draft
  // when another tab updates the saved choice.
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setPreferences(consent?.preferences || false);
      setStatistics(consent?.statistics || false);
      setCustom(true);
    }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (open) {
      trigger.current = document.activeElement as HTMLElement;
      heading.current?.focus();
    }
  }, [open]);
  function close() {
    onClose();
    trigger.current?.focus();
  }
  function save(p: boolean, s: boolean) {
    const persisted = saveConsent(p, s);
    setCustom(false);
    setPreferences(false);
    setStatistics(false);
    setNotice(
      persisted
        ? "Dina cookieinställningar är sparade."
        : "Webbläsaren blockerar lagring. Ditt val gäller på den här sidan; frivillig statistik förblir avstängd.",
    );
    close();
  }
  const visible = ready && (open || !consent);
  return (
    <>
      {notice && (
        <p className="cookie-notice" role="status">
          {notice}
        </p>
      )}
      {visible && (
        <section
          className="cookie-panel"
          role="region"
          aria-labelledby="cookie-title"
          onKeyDown={(e) => {
            if (e.key === "Escape" && consent) close();
          }}
        >
          <div className="cookie-heading">
            <h2 id="cookie-title" tabIndex={-1} ref={heading}>
              {custom ? "Cookieinställningar" : "Cookies på AllTing"}
            </h2>
            {consent && (
              <button className="text-button" onClick={close}>
                Stäng
              </button>
            )}
          </div>
          <p>
            Nödvändiga cookies håller dig inloggad och skyddar tjänsten. Du
            väljer om vi också får minnas utseendet i webbläsaren och samla
            statistik om hur AllTing används.{" "}
            <Link href="/cookies">Läs om cookies</Link>.
          </p>
          {custom && (
            <fieldset className="cookie-options">
              <legend className="sr-only">Välj vad du tillåter</legend>
              <p>
                <strong>Nödvändiga</strong> · alltid aktiva
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={preferences}
                  onChange={(e) => setPreferences(e.target.checked)}
                />
                <span>
                  <strong>Kom ihåg utseendet</strong>
                  <small>
                    Spara ljust, mörkt eller enhetens läge i den här
                    webbläsaren. Kontots eget val finns kvar även om du tackar
                    nej.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={statistics}
                  onChange={(e) => setStatistics(e.target.checked)}
                />
                <span>
                  <strong>Användningsstatistik</strong>
                  <small>
                    Räkna besök, sökningar, matchningar och bytesförslag för att
                    förbättra AllTing. Inga annonsspårare.
                  </small>
                </span>
              </label>
            </fieldset>
          )}
          <div className="cookie-actions">
            <button className="outline" onClick={() => save(false, false)}>
              Endast nödvändiga
            </button>
            <button className="outline" onClick={() => save(true, true)}>
              Godkänn valfria cookies
            </button>
            {custom ? (
              <button
                className="outline"
                onClick={() => save(preferences, statistics)}
              >
                Spara mina val
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() => {
                  setCustom(true);
                  heading.current?.focus();
                }}
              >
                Anpassa
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
export function CookiePolicy({ onSettings }: { onSettings: () => void }) {
  return (
    <article className="narrow policy">
      <h1>Cookies på AllTing</h1>
      <p>
        Du kan använda AllTing med endast nödvändiga cookies. Du kan när som
        helst ändra ditt val här eller via Cookieinställningar i sidfoten.
      </p>
      <button className="outline" onClick={onSettings}>
        Ändra cookieinställningar
      </button>
      <h2>Nödvändiga cookies</h2>
      <p>
        AllTing använder en säker inloggningscookie (
        <code>__Secure-allting.session_token</code>) för att hålla dig inloggad.
        Den gäller i upp till sju dagar och kan förnyas när du använder kontot.
        Utloggning avslutar sessionen. Cookien innehåller en skyddad
        sessionsnyckel, inte din e-postadress eller ditt lösenord.
      </p>
      <p>
        <code>allting-consent</code> minns dina samtyckesval, tidpunkten och
        versionen av informationen i 180 dagar. Den innehåller inget
        användar-id. Därefter frågar vi igen. Valet gäller den här webbläsaren,
        även när du loggar ut.
      </p>
      <p>
        Webbhotellets skydd från Cloudflare kan använda <code>__cf_bm</code> för
        att skilja mänskliga besökare från automatiserad trafik. Den upphör
        efter 30 minuters inaktivitet och hanteras av Cloudflare.{" "}
        <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/">
          Läs Cloudflares information om cookies
        </a>
        .
      </p>
      <h2>Frivilligt: kom ihåg utseendet</h2>
      <p>
        Med ditt godkännande sparas <code>allting-appearance</code> i
        webbläsarens lokala lagring. Den innehåller bara ditt val av ljust,
        mörkt eller enhetens läge. Vi använder det som längst medan samtycket
        gäller, i 180 dagar. När du återkallar samtycket raderas det direkt. Om
        samtycket har gått ut raderas det vid nästa besök. Inget nytt val lagras
        utan ditt godkännande.
      </p>
      <p>
        Utseendet du väljer på ditt konto sparas också privat på AllTings server
        som en kontoinställning. Det fungerar även om du tackar nej till lokal
        lagring. Ljust är standard för besökare och nya konton.
      </p>
      <h2>Frivilligt: användningsstatistik</h2>
      <p>
        Om du godkänner statistik räknar vi händelser från ditt inloggade konto:
        besök, sökningar, visade matchningar, ändrad sökradie och bytesförslag.
        Händelserna innehåller konto-id, tidpunkt, typ av händelse och ibland
        radie eller antal saker. Söktext, meddelanden, e-post och exakta platser
        ingår inte. Uppgifterna stannar hos AllTing och visas bara i den
        skyddade administrationsvyn.
      </p>
      <p>
        Utan samtycke sparas inga nya sådana statistikhändelser. Återkallat
        samtycke stoppar fortsatt insamling. Dina annonser, byten och
        meddelanden sparas fortfarande för att tjänsten ska fungera; antal
        annonser och byten kan räknas från dessa uppgifter. AllTing använder
        inte Google Analytics, reklamcookies eller annonsspårare.
      </p>
      <h2>Övrig lagring</h2>
      <p>
        Offline-funktionen sparar bara en generell sida som visas utan
        internetanslutning. Den lagrar inga privata sidor, annonser eller
        konversationer. Om webbläsaren blockerar lagring kan vi behöva fråga om
        samtycke igen.{" "}
        <Link href="/regler">
          Läs mer om dina uppgifter och hur AllTing fungerar
        </Link>
        .
      </p>
    </article>
  );
}
