"use client";
/* Images are protected same-origin object URLs; native img preserves the access boundary. */
/* eslint-disable @next/next/no-img-element */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link, { useRouter } from "@/lib/document-navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { loginPath, safeReturnPath } from "@/lib/auth-navigation";
import PasswordLogin from "./password-login";
import {
  AppearanceSync,
  setAppearance,
  useAppearancePreference,
} from "./appearance";
import type { ThemePreference } from "@/lib/appearance";
import {
  ConsentSync,
  CookieConsent,
  CookiePolicy,
  useConsent,
} from "./consent";
import {
  Home,
  Search,
  Plus,
  MessageCircle,
  UserRound,
  Heart,
  Bell,
  MapPin,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  Check,
  ChevronRight,
  X,
  Repeat2,
  Camera,
  Flag,
  ShieldCheck,
  LogOut,
  Bookmark,
  MoreHorizontal,
} from "lucide-react";
import {
  CATEGORIES,
  CONDITIONS,
  CITIES,
  RADII,
  REASONS,
  PROHIBITED,
  STATUS,
  categoryName,
  conditionName,
} from "@/lib/catalog";
import type { Profile, Listing, Offer, Message, Notice } from "@/lib/types";
type Me = {
  identity: { name: string; email: string } | null;
  user: Profile | null;
};
const Context = createContext<{
  me: Me | undefined;
  refresh: () => void;
  toast: (text: string) => void;
}>({ me: undefined, refresh: () => {}, toast: () => {} });
let pageActive = true;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    pageActive = false;
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
  });
}
async function api<T>(
  url: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api/${url}`, {
    method,
    signal,
    headers:
      method === "GET" || method === "DELETE"
        ? {}
        : { "Content-Type": "application/json" },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const b = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new Error(b.error || "Det gick inte att spara. Försök igen.");
  return b;
}
function useData<T>(url: string | null, poll = 0) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const controller = new AbortController();
    const get = () =>
      api<T>(url, "GET", undefined, controller.signal)
        .then((d) => {
          if (live) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (live && !controller.signal.aborted) setError(e.message);
        });
    const hide = () => controller.abort();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    // Safari may flush passive React effects from a document being left during
    // rapid back/forward navigation. Fetch only once that document can paint.
    let frame = 0;
    const queue = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (live && pageActive && !controller.signal.aborted) void get();
      });
    };
    queue();
    const t = poll
      ? setInterval(() => {
          if (document.visibilityState === "visible") queue();
        }, poll)
      : null;
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      if (t) clearInterval(t);
    };
  }, [url, version, poll, refresh]);
  return { data, error, refresh };
}
function date(s: string, time = false) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(s));
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Repeat2 size={28} />
      <h2>{title}</h2>
      {children && <div>{children}</div>}
    </div>
  );
}
function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
function Loading() {
  return (
    <p className="loading" role="status">
      Hämtar…
    </p>
  );
}
function Back({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <Link href="/" className="icon-button" aria-label="Till hem">
        <ArrowLeft size={22} />
      </Link>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
function NeedAccount({ children }: { children: ReactNode }) {
  const { me } = useContext(Context);
  if (!me) return <Loading />;
  if (!me.identity) return <Login />;
  if (!me.user) return <ProfileForm onboarding />;
  if (me.user.suspended)
    return (
      <Empty title="Ditt konto är avstängt">
        <p>Ditt konto kan inte användas för nya byten.</p>
        <SignOut />
      </Empty>
    );
  return children;
}
export default function AllTing() {
  const path = usePathname() || "/",
    m = useData<Me>("me"),
    n = useData<Notice[]>(m.data?.user ? "notifications" : null, 15000),
    [toast, setToast] = useState(""),
    [cookieSettings, setCookieSettings] = useState(false);
  const consent = useConsent();
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (m.data?.user && consent?.statistics)
      void api("session", "POST", {}).catch(() => {});
  }, [m.data?.user, consent?.statistics]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((text: string) => setToast(text), []),
    parts = path.split("/").filter(Boolean),
    user = m.data?.user,
    unread = n.data?.filter((x) => !x.read_at).length || 0;
  let view: ReactNode;
  if (!parts.length || parts[0] === "sok" || parts[0] === "matchningar")
    view = <Discover mode={parts[0] || "home"} />;
  else if (parts[0] === "saker" && parts[1])
    view =
      parts[2] === "redigera" ? (
        <NeedAccount>
          <ListingForm listingId={parts[1]} />
        </NeedAccount>
      ) : (
        <ListingDetail id={parts[1]} />
      );
  else if (parts[0] === "lagg-upp")
    view = (
      <NeedAccount>
        <ListingForm />
      </NeedAccount>
    );
  else if (parts[0] === "mina-saker")
    view = (
      <NeedAccount>
        <Inventory />
      </NeedAccount>
    );
  else if (parts[0] === "favoriter")
    view = (
      <NeedAccount>
        <Favorites />
      </NeedAccount>
    );
  else if (parts[0] === "meddelanden")
    view = (
      <NeedAccount>
        <Conversations />
      </NeedAccount>
    );
  else if (parts[0] === "byten" && parts[1])
    view = (
      <NeedAccount>
        <Trade id={parts[1]} />
      </NeedAccount>
    );
  else if (parts[0] === "profil")
    view = parts[1] ? (
      <PublicProfile id={parts[1]} />
    ) : (
      <NeedAccount>
        <MyProfile />
      </NeedAccount>
    );
  else if (parts[0] === "bevakningar")
    view = (
      <NeedAccount>
        <Watches />
      </NeedAccount>
    );
  else if (parts[0] === "notiser")
    view = (
      <NeedAccount>
        <Notifications notices={n.data} refresh={n.refresh} />
      </NeedAccount>
    );
  else if (parts[0] === "blockerade")
    view = (
      <NeedAccount>
        <Blocked />
      </NeedAccount>
    );
  else if (parts[0] === "admin")
    view = (
      <NeedAccount>
        <Moderation />
      </NeedAccount>
    );
  else if (parts[0] === "cookies")
    view = <CookiePolicy onSettings={() => setCookieSettings(true)} />;
  else if (parts[0] === "regler") view = <Policy />;
  else if (parts[0] === "konto" && parts[1] === "bekrafta")
    view = <ConfirmLogin />;
  else if (parts[0] === "konto" || parts[0] === "registrera")
    view = <Account />;
  else
    view = (
      <Empty title="Sidan finns inte">
        <Link href="/">Gå till hem</Link>
      </Empty>
    );
  return (
    <Context.Provider value={{ me: m.data, refresh: m.refresh, toast: notify }}>
      <AppearanceSync preference={user?.theme_preference} />
      <ConsentSync />
      <a className="skip" href="#main">
        Till innehållet
      </a>
      <header className="topbar">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="AllTing hem">
            AllTing
            <span className="wordmark-dot" />
          </Link>
          <nav className="desktop-nav" aria-label="Huvudmeny">
            <Link href="/" className={!parts.length ? "selected" : ""}>
              Utforska
            </Link>
            <Link
              href="/matchningar"
              className={parts[0] === "matchningar" ? "selected" : ""}
            >
              Matchningar
            </Link>
            <Link href="/mina-saker">Mina saker</Link>
          </nav>
          <div className="header-actions">
            <Link
              href="/favoriter"
              className="icon-button"
              aria-label="Favoriter"
            >
              <Heart size={21} />
            </Link>
            <Link
              href="/notiser"
              className="icon-button badge-wrap"
              aria-label={`Notiser${unread ? `, ${unread} olästa` : ""}`}
            >
              <Bell size={21} />
              {unread > 0 && (
                <span className="badge">{unread > 9 ? "9+" : unread}</span>
              )}
            </Link>
            <Link href="/lagg-upp" className="button small desktop-only">
              <Plus size={18} /> Lägg upp
            </Link>
            <Link
              href="/profil"
              className="avatar desktop-only"
              aria-label="Din profil"
            >
              {user?.display_name?.slice(0, 1) || <UserRound size={20} />}
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="main" key={path}>
        {m.error ? <ErrorText text={m.error} /> : view}
      </main>
      <footer className="footer">
        <span>AllTing — byt det du har mot det du vill ha.</span>
        <nav className="footer-links" aria-label="Information">
          <Link href="/regler">Så fungerar AllTing</Link>
          <button type="button" onClick={() => setCookieSettings(true)}>
            Cookieinställningar
          </button>
        </nav>
      </footer>
      <CookieConsent
        open={cookieSettings}
        onClose={() => setCookieSettings(false)}
      />
      <nav className="bottom-nav" aria-label="Huvudmeny mobil">
        {[
          ["/", "Hem", Home],
          ["/sok", "Sök", Search],
          ["/lagg-upp", "Lägg upp", Plus],
          ["/meddelanden", "Meddelanden", MessageCircle],
          ["/profil", "Profil", UserRound],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof Home;
          return (
            <Link
              key={String(href)}
              href={String(href)}
              className={`${path === href ? "selected" : ""} ${href === "/lagg-upp" ? "add-nav" : ""}`}
            >
              <I size={22} />
              <span>{String(label)}</span>
              {href === "/meddelanden" &&
                n.data?.some((x) => x.type === "message" && !x.read_at) && (
                  <i className="nav-dot" />
                )}
            </Link>
          );
        })}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Stäng meddelande" onClick={() => setToast("")}>
            <X size={18} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function Login() {
  const { data, error } = useData<{ method: "magic-link" | "password" }>(
      "auth/config",
    ),
    path = usePathname(),
    params = useSearchParams();
  if (error) return <ErrorText text={error} />;
  if (!data) return <Loading />;
  if (data.method === "password")
    return (
      <PasswordLogin
        returnTo={safeReturnPath(params.get("return_to") || path, "/profil")}
        register={path === "/registrera"}
        verified={params.get("verified") === "1"}
        message={loginMessages[params.get("action") || ""]}
      />
    );
  return <MagicLogin />;
}
const loginMessages: Record<string, string> = {
  propose: "Logga in eller skapa ett konto för att föreslå ett byte.",
  favorite: "Logga in eller skapa ett konto för att spara favoriter.",
  watch: "Logga in eller skapa ett konto för att bevaka sökningen.",
  report: "Logga in eller skapa ett konto för att rapportera.",
  block: "Logga in eller skapa ett konto för att blockera en användare.",
  match: "Logga in eller skapa ett konto för att se dina matchningar.",
};
function MagicLogin() {
  const path = usePathname(),
    params = useSearchParams();
  const returnTo = safeReturnPath(params.get("return_to") || path, "/profil");
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/login", "POST", { email, return_to: returnTo });
      setSent(true);
      setCooldown(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-intro narrow">
      <div className="eyebrow">Välkommen till AllTing</div>
      <h1>{sent ? "Kolla din e-post" : "Logga in eller skapa konto"}</h1>
      {sent ? (
        <div className="stack">
          <p>
            Vi har skickat en inloggningslänk till <strong>{email}</strong>.
            Öppna mejlet och följ länken. Den gäller i 15 minuter.
          </p>
          <p className="muted">Hittar du inte mejlet? Titta i skräpposten.</p>
          <button
            className="outline full"
            disabled={busy || cooldown > 0}
            onClick={() => void send()}
          >
            {busy
              ? "Skickar…"
              : cooldown
                ? `Skicka igen om ${cooldown} sekunder`
                : "Skicka en ny länk"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSent(false);
              setError("");
            }}
          >
            Ändra e-postadress
          </button>
        </div>
      ) : (
        <>
          <p>
            {loginMessages[params.get("action") || ""] ||
              "Ange din e-post så skickar vi en länk. Samma sätt att logga in gäller både nya och befintliga konton."}
          </p>
          <form onSubmit={send} className="stack">
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
            <button className="button full" disabled={busy}>
              {busy ? "Skickar…" : "Skicka inloggningslänk"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="muted">
            Du behöver inget lösenord. Din e-post visas aldrig för andra
            användare.
          </p>
        </>
      )}
      <ErrorText text={error} />
      <Link href={returnTo}>Tillbaka till sakerna</Link>
      <Link href="/regler">Läs våra regler och om dina uppgifter</Link>
    </section>
  );
}
function ConfirmLogin() {
  const captured = useRef(false);
  const [link, setLink] = useState<{ token: string; returnTo: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("token") || "";
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    queueMicrotask(() => {
      if (token)
        setLink({
          token,
          returnTo: safeReturnPath(fragment.get("return_to"), "/profil"),
        });
      else setError("Länken saknas. Be om en ny inloggningslänk.");
    });
  }, []);
  async function confirm() {
    if (!link) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ return_to: string }>("auth/verify", "POST", {
        token: link.token,
        return_to: link.returnTo,
      });
      // A full navigation discards data fetched under the previous session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/konto?complete=1&return_to=${encodeURIComponent(r.return_to)}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="account-intro narrow stack">
      <div className="eyebrow">AllTing</div>
      <h1>Logga in på AllTing</h1>
      <p>
        Din e-post verifieras när du fortsätter. Är det första gången får du
        välja namn och ort.
      </p>
      <ErrorText text={error} />
      {link && !error && (
        <button
          className="button full"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Loggar in…" : "Fortsätt till AllTing"}
        </button>
      )}
      <Link href={loginPath(link?.returnTo || "/profil")}>
        Be om en ny länk
      </Link>
    </section>
  );
}
function Account() {
  const { me } = useContext(Context),
    params = useSearchParams(),
    router = useRouter();
  const returnTo = safeReturnPath(params.get("return_to"), "/profil");
  useEffect(() => {
    if (params.get("complete") === "1" && me?.user && !me.user.suspended)
      router.replace(returnTo);
  }, [me?.user, params, router, returnTo]);
  if (!me) return <Loading />;
  if (!me.identity) return <Login />;
  if (!me.user)
    return <ProfileForm onboarding close={() => router.replace(returnTo)} />;
  return (
    <NeedAccount>
      <MyProfile />
    </NeedAccount>
  );
}
function SignOut() {
  const { toast } = useContext(Context),
    [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await api("auth/sign-out", "POST", {});
      // Discard all private client state after the cookie is revoked.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <button
      className="text-button danger"
      disabled={busy}
      onClick={() => void signOut()}
    >
      <LogOut size={18} />
      {busy ? "Loggar ut…" : "Logga ut"}
    </button>
  );
}
function CitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label="Ort"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {CITIES.map((c) => (
        <option key={c[0]}>{c[0]}</option>
      ))}
    </select>
  );
}
function Radius({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="radius" role="group" aria-label="Sökradie">
      {RADII.map((r) => (
        <button
          type="button"
          key={r}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
        >
          {r} km
        </button>
      ))}
    </div>
  );
}
function Card({
  item,
  onFavorite,
}: {
  item: Listing;
  onFavorite?: () => void;
}) {
  const { me, toast } = useContext(Context),
    router = useRouter(),
    [fav, setFav] = useState(item.favorite),
    [busy, setBusy] = useState(false);
  async function favorite() {
    if (!me?.user) {
      router.push(loginPath(location.pathname + location.search, "favorite"));
      return;
    }
    setBusy(true);
    try {
      await api(
        `favorites/${item.id}`,
        fav ? "DELETE" : "POST",
        fav ? undefined : {},
      );
      setFav(!fav);
      onFavorite?.();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="listing-card">
      <div className="card-image">
        <Link href={`/saker/${item.id}`} tabIndex={-1} aria-hidden="true">
          <img
            src={
              item.images[0] +
              (item.images[0]?.startsWith("/api/images/") ? "?thumb=1" : "")
            }
            alt=""
            loading="lazy"
            width="480"
            height="384"
          />
        </Link>
        <button
          className={`favorite ${fav ? "saved" : ""}`}
          onClick={favorite}
          disabled={busy}
          aria-label={`${fav ? "Ta bort" : "Spara"} ${item.title} ${fav ? "från" : "som"} favorit`}
          aria-pressed={fav}
        >
          <Heart size={20} fill={fav ? "currentColor" : "none"} />
        </button>
        {item.match?.kind === "mutual" && (
          <span className="match-label">
            <Repeat2 size={13} /> Bra matchning
          </span>
        )}
      </div>
      <div className="card-body">
        <p className="card-meta">
          {conditionName(item.condition)} · {item.city}
          {item.distance !== null ? ` · ca ${item.distance} km` : ""}
        </p>
        <h2>
          <Link href={`/saker/${item.id}`}>{item.title}</Link>
        </h2>
        <p className="wanted">
          <Repeat2 size={15} />
          <span>
            {item.wanted.length
              ? `Söker ${item.wanted.join(", ").toLocaleLowerCase("sv")}`
              : "Öppen för förslag"}
          </span>
        </p>
        {item.match && <p className="match-reason">{item.match.reason}</p>}
      </div>
    </article>
  );
}
function Grid({
  items,
  onFavorite,
}: {
  items: Listing[];
  onFavorite?: () => void;
}) {
  return (
    <div className="listing-grid">
      {items.map((l) => (
        <Card key={l.id} item={l} onFavorite={onFavorite} />
      ))}
    </div>
  );
}
function Discover({ mode }: { mode: string }) {
  const { me, toast, refresh } = useContext(Context),
    router = useRouter(),
    user = me?.user;
  const [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [condition, setCondition] = useState(""),
    [city, setCity] = useState(user?.city || "Norrtälje"),
    [radius, setRadius] = useState(user?.default_search_radius_km || 15),
    [only, setOnly] = useState(mode === "matchningar"),
    [sort, setSort] = useState(mode === "matchningar" ? "match" : "near"),
    [filters, setFilters] = useState(false),
    [page, setPage] = useState(1);
  const [ready, setReady] = useState(false),
    initializedUser = useRef<string | null>(null),
    initializedParams = useRef(false);
  async function changeRadius(v: number) {
    setRadius(v);
    setPage(1);
    if (user) {
      try {
        await api("preferences", "PUT", { radius: v });
        refresh();
      } catch (e) {
        toast((e as Error).message);
      }
    }
  }
  useEffect(() => {
    const s = new URLSearchParams(location.search);
    Promise.resolve().then(() => {
      if (user && initializedUser.current !== user.id) {
        initializedUser.current = user.id;
        if (!s.has("city")) setCity(user.city);
        if (!s.has("radius")) setRadius(user.default_search_radius_km);
      }
      if (!initializedParams.current) {
        if (s.has("q")) {
          setQ(s.get("q") || "");
          setQuery(s.get("q") || "");
        }
        if (s.has("city")) setCity(s.get("city")!);
        if (s.has("category")) setCategory(s.get("category")!);
        if ([5, 15, 50].includes(Number(s.get("radius"))))
          setRadius(Number(s.get("radius")));
        initializedParams.current = true;
      }
      setReady(true);
    });
  }, [user]);
  const params = new URLSearchParams({
      q: query,
      category,
      condition,
      city,
      radius: String(radius),
      matches: only ? "1" : "0",
      sort,
      page: String(page),
    }),
    data = useData<{ items: Listing[]; total: number; hasMore: boolean }>(
      ready ? `listings?${params}` : null,
    );
  const [saving, setSaving] = useState(false);
  async function watch() {
    if (!user) {
      router.push(loginPath(`/sok?${params}`, "watch"));
      return;
    }
    setSaving(true);
    try {
      await api("searches", "POST", {
        query,
        category_id: category || null,
        city,
        radius_km: radius,
      });
      toast("Bevakningen är sparad. Du får en notis när något nytt dyker upp.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <section className={`discover-intro ${mode === "home" ? "" : "compact"}`}>
        <div>
          <p className="eyebrow">Saker att byta, nära dig</p>
          <h1>
            {mode === "matchningar"
              ? "Ni har något den andra söker."
              : mode === "sok"
                ? "Vad letar du efter?"
                : "Vad vill du byta till dig?"}
          </h1>
          {mode === "home" && (
            <p>Hitta något du behöver. Erbjud något du redan har.</p>
          )}
        </div>
        {mode === "home" && (
          <Link href="/mina-saker" className="inventory-link">
            Börja med dina saker <ArrowRight size={18} />
          </Link>
        )}
      </section>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
          setPage(1);
        }}
      >
        <Search size={22} />
        <label className="sr-only" htmlFor="search">
          Sök efter en sak
        </label>
        <input
          id="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök efter byten"
          maxLength={100}
        />
        <button type="submit" className="button">
          Sök
        </button>
      </form>
      <div className="search-tools">
        <button className="location-filter" onClick={() => setFilters(true)}>
          <MapPin size={17} />
          {city} <span>· {radius} km</span>
        </button>
        <button
          className={`outline small ${category || condition || only ? "active-filter" : ""}`}
          onClick={() => setFilters(true)}
        >
          <SlidersHorizontal size={17} /> Filter
        </button>
        <button
          className="text-button save-search"
          onClick={watch}
          disabled={saving}
        >
          <Bell size={17} /> Bevaka sökningen
        </button>
      </div>
      <div className="category-strip" aria-label="Kategorier">
        <button
          aria-pressed={!category}
          onClick={() => {
            setCategory("");
            setPage(1);
          }}
        >
          Alla saker
        </button>
        {CATEGORIES.map(([id, name]) => (
          <button
            key={id}
            aria-pressed={category === id}
            onClick={() => {
              setCategory(category === id ? "" : id);
              setPage(1);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="results-heading">
        <div className="tabs">
          <button
            className={sort === "near" && !only ? "selected" : ""}
            onClick={() => {
              setSort("near");
              setOnly(false);
              setPage(1);
            }}
          >
            Nära dig
          </button>
          <button
            className={sort === "match" ? "selected" : ""}
            onClick={() => {
              if (!user) {
                router.push(
                  loginPath(
                    `/sok?${new URLSearchParams({ ...Object.fromEntries(params), matches: "1", sort: "match" })}`,
                    "match",
                  ),
                );
                return;
              }
              setSort("match");
              setOnly(true);
              setPage(1);
            }}
          >
            Bra matchningar
          </button>
          <button
            className={sort === "recent" ? "selected" : ""}
            onClick={() => {
              setSort("recent");
              setOnly(false);
              setPage(1);
            }}
          >
            Nyligen upplagt
          </button>
        </div>
        <span className="muted result-count">
          {data.data?.total ?? "…"} saker
        </span>
      </div>
      <ErrorText text={data.error} />
      {!data.data && !data.error ? (
        <Loading />
      ) : data.data?.items.length ? (
        <Grid items={data.data.items} />
      ) : (
        !data.error && (
          <Empty title={only ? "Inga matchningar ännu" : "Inga saker just här"}>
            <p>
              {only
                ? "Lägg upp en sak och ange vad du söker, så kan vi hitta gemensamma önskemål."
                : "Prova ett annat sökord eller välj 50 km i filtret."}
            </p>
            {only && (
              <Link className="button" href="/lagg-upp">
                Lägg upp en sak
              </Link>
            )}
          </Empty>
        )
      )}
      {data.data && data.data.total > 24 && (
        <div className="pagination">
          <button
            className="outline"
            disabled={page === 1}
            onClick={() => {
              setPage((p) => p - 1);
              window.scrollTo(0, 0);
            }}
          >
            Föregående
          </button>
          <span>Sida {page}</span>
          <button
            className="outline"
            disabled={!data.data.hasMore}
            onClick={() => {
              setPage((p) => p + 1);
              window.scrollTo(0, 0);
            }}
          >
            Nästa
          </button>
        </div>
      )}
      {filters && (
        <Modal title="Sök och filter" close={() => setFilters(false)}>
          <label>
            Ort
            <CitySelect
              value={city}
              onChange={(v) => {
                setCity(v);
                setPage(1);
              }}
            />
          </label>
          <fieldset>
            <legend>Avstånd från orten</legend>
            <Radius value={radius} onChange={changeRadius} />
          </fieldset>
          <label>
            Kategori
            <select
              aria-label="Kategori"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alla kategorier</option>
              {CATEGORIES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Skick
            <select
              aria-label="Skick"
              value={condition}
              onChange={(e) => {
                setCondition(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alla skick</option>
              {CONDITIONS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {user && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={only}
                onChange={(e) => {
                  setOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Matchar något jag söker
            </label>
          )}
          <button className="button full" onClick={() => setFilters(false)}>
            Visa saker
          </button>
          <button
            className="text-button full"
            onClick={() => {
              setCategory("");
              setCondition("");
              setOnly(false);
              void changeRadius(15);
              setPage(1);
            }}
          >
            Rensa filter
          </button>
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const behind = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main,header,footer,nav.bottom-nav",
      ),
    );
    behind.forEach((el) => (el.inert = true));
    ref.current?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
            ) || [],
          ),
          first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = "";
      behind.forEach((el) => (el.inert = false));
      document.removeEventListener("keydown", keys);
      prev?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Stäng">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
function ProfileForm({
  onboarding = false,
  close,
}: {
  onboarding?: boolean;
  close?: () => void;
}) {
  const { me, refresh, toast } = useContext(Context),
    user = me?.user,
    [name, setName] = useState(user?.display_name || me?.identity?.name || ""),
    [city, setCity] = useState(user?.city || "Norrtälje"),
    [radius, setRadius] = useState(user?.default_search_radius_km || 15),
    [bio, setBio] = useState(user?.bio || ""),
    [wanted, setWanted] = useState(user?.wanted.join(", ") || ""),
    [interests, setInterests] = useState<string[]>(user?.interests || []),
    [avatar, setAvatar] = useState(user?.avatar_url || null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("profile", "PUT", {
        display_name: name,
        city,
        default_search_radius_km: radius,
        bio,
        wanted: wanted
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        avatar_url: avatar,
        interests,
      });
      refresh();
      toast(
        onboarding
          ? "Din profil är klar. Lägg gärna upp din första sak."
          : "Profilen är sparad.",
      );
      close?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="narrow">
      <Back title={onboarding ? "Välj namn och ort" : "Redigera profil"} />
      {onboarding && (
        <p>Du kan börja titta direkt. Namn och ort är det enda vi behöver.</p>
      )}
      <form onSubmit={save} className="stack">
        <label>
          Visningsnamn
          <input
            required
            minLength={2}
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />
        </label>
        <label>
          Ort
          <CitySelect value={city} onChange={setCity} />
        </label>
        <p className="field-help">
          Vi använder ortens ungefärliga läge. Din hemadress efterfrågas aldrig.
        </p>
        <fieldset>
          <legend>Din vanliga sökradie</legend>
          <Radius value={radius} onChange={setRadius} />
        </fieldset>
        <details open={!onboarding}>
          <summary>
            Intresseområden <span className="muted">(valfritt)</span>
          </summary>
          <div className="interest-options">
            {CATEGORIES.map(([id, label]) => (
              <label className="check-label" key={id}>
                <input
                  type="checkbox"
                  checked={interests.includes(id)}
                  onChange={(e) =>
                    setInterests((previous) =>
                      e.target.checked
                        ? [...previous, id]
                        : previous.filter((x) => x !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="field-help">
            Välj några områden eller hoppa över. Du kan ändra dem senare.
          </p>
        </details>
        {!onboarding && (
          <>
            <label>
              Kort presentation <span className="muted">(valfritt)</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={400}
                rows={3}
              />
            </label>
            <PhotoPicker
              images={avatar ? [avatar] : []}
              onChange={(x) => setAvatar(x[0] || null)}
              max={1}
            />
          </>
        )}
        {!onboarding && (
          <label>
            Vad söker du? <span className="muted">(valfritt)</span>
            <input
              aria-label="Jag söker"
              value={wanted}
              onChange={(e) => setWanted(e.target.value)}
              placeholder="Till exempel cykel, verktyg, böcker"
              maxLength={500}
            />
            <span className="field-help">
              Skilj önskemålen åt med kommatecken. Du kan lägga till dem senare.
            </span>
          </label>
        )}
        <ErrorText text={error} />
        <button className="button full" disabled={busy}>
          {busy ? "Sparar…" : onboarding ? "Börja utforska" : "Spara profil"}
        </button>
        {onboarding && (
          <Link className="text-button" href="/">
            Utforska först
          </Link>
        )}
      </form>
    </section>
  );
}
async function imageBlob(bitmap: ImageBitmap, size: number) {
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Bilden kunde inte förberedas.")),
      "image/webp",
      0.82,
    ),
  );
}
function PhotoPicker({
  images,
  onChange,
  max = 6,
}: {
  images: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    setBusy(true);
    const next = [...images];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= max)
          throw new Error(`Du kan välja högst ${max} bilder.`);
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10_000_000
        )
          throw new Error("Välj en JPG-, PNG- eller WebP-bild på högst 10 MB.");
        const bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 60_000_000) {
          bitmap.close();
          throw new Error("Bilden har för hög upplösning.");
        }
        const form = new FormData();
        form.set("image", await imageBlob(bitmap, 1600), "image.webp");
        form.set("thumbnail", await imageBlob(bitmap, 480), "thumbnail.webp");
        bitmap.close();
        const r = await fetch("/api/images", { method: "POST", body: form }),
          d = (await r.json()) as { error: string; url: string };
        if (!r.ok) throw new Error(d.error);
        next.push(d.url);
        onChange([...next]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset>
      <legend>
        {max === 1 ? "Profilbild (valfritt)" : "Bilder · 1–6 stycken"}
      </legend>
      <div className="photo-picker">
        {images.map((img, i) => (
          <div key={img}>
            <img src={img} alt={`Bild ${i + 1}`} />
            <button
              type="button"
              className="icon-button"
              aria-label={`Ta bort bild ${i + 1}`}
              onClick={() => onChange(images.filter((_, j) => j !== i))}
            >
              <X size={17} />
            </button>
          </div>
        ))}
        {images.length < max && (
          <label className="upload-button">
            <Camera size={26} />
            <span>{busy ? "Laddar upp…" : "Lägg till bild"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={max > 1}
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="field-help">
        JPG, PNG eller WebP. Vi minskar bilderna och tar bort platsinformation.
      </p>
      <ErrorText text={error} />
    </fieldset>
  );
}
function ListingForm({ listingId }: { listingId?: string }) {
  const { me, toast } = useContext(Context),
    d = useData<Listing>(listingId ? `listings/${listingId}` : null),
    router = useRouter();
  if (listingId && !d.data)
    return d.error ? <ErrorText text={d.error} /> : <Loading />;
  if (d.data && d.data.owner_id !== me?.user?.id)
    return <ErrorText text="Du kan bara redigera dina egna saker." />;
  return (
    <ListingFields
      initial={d.data}
      done={(id) => {
        toast(listingId ? "Ändringarna är sparade." : "Din sak är upplagd.");
        router.push(`/saker/${id}`);
      }}
    />
  );
}
function ListingFields({
  initial,
  done,
}: {
  initial?: Listing;
  done: (id: string) => void;
}) {
  const { me } = useContext(Context),
    [title, setTitle] = useState(initial?.title || ""),
    [description, setDescription] = useState(initial?.description || ""),
    [category, setCategory] = useState(initial?.category_id || ""),
    [condition, setCondition] = useState(initial?.condition || "good"),
    [city, setCity] = useState(initial?.city || me?.user?.city || "Norrtälje"),
    [wanted, setWanted] = useState(initial?.wanted.join(", ") || ""),
    [open, setOpen] = useState(!!initial?.open_to_suggestions),
    [images, setImages] = useState(initial?.images || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!images.length) {
      setError("Lägg till minst en bild.");
      return;
    }
    setBusy(true);
    try {
      const d = await api<Listing>(
        `listings${initial ? `/${initial.id}` : ""}`,
        "POST",
        {
          title,
          description,
          category_id: category,
          condition,
          city,
          wanted: wanted
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          open_to_suggestions: open,
          images,
        },
      );
      done(d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="narrow">
      <Back title={initial ? "Redigera sak" : "Lägg upp en sak"} />
      <p className="muted">
        Visa vad du har och berätta vad du vill byta till dig.
      </p>
      <form onSubmit={save} className="stack">
        <PhotoPicker images={images} onChange={setImages} />
        <label>
          Titel
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Till exempel Bosch borrmaskin 18V"
            minLength={3}
            maxLength={100}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Kategori
            <select
              aria-label="Kategori"
              value={category}
              required
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="" disabled>
                Välj kategori
              </option>
              {CATEGORIES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Skick
            <select
              aria-label="Skick"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {CONDITIONS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Beskrivning
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Berätta om saken, vad som följer med och om något är slitet."
            minLength={10}
            maxLength={4000}
            rows={4}
            required
          />
        </label>
        <label>
          Ort
          <CitySelect value={city} onChange={setCity} />
        </label>
        <label>
          Jag söker
          <input
            aria-label="Jag söker"
            value={wanted}
            onChange={(e) => setWanted(e.target.value)}
            placeholder="Cykel, trädgårdsredskap, verktyg"
            maxLength={500}
          />
          <span className="field-help">
            Du kan ange flera saker, med kommatecken emellan.
          </span>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => setOpen(e.target.checked)}
          />
          Öppen för förslag
        </label>
        <p className="field-help">
          Lägg bara upp saker du har rätt att byta bort.{" "}
          <Link href="/regler">Läs reglerna</Link>.
        </p>
        <ErrorText text={error} />
        <button className="button full" disabled={busy}>
          {busy ? "Sparar…" : initial ? "Spara ändringar" : "Publicera sak"}
        </button>
      </form>
    </section>
  );
}
function ListingDetail({ id }: { id: string }) {
  const d = useData<Listing>(`listings/${id}`),
    { me, toast } = useContext(Context),
    [image, setImage] = useState(0),
    [proposal, setProposal] = useState(false),
    [report, setReport] = useState(false),
    [more, setMore] = useState(false);
  const p = useData<{ profile: Profile }>(
      d.data ? `profiles/${d.data.owner_id}` : null,
    ),
    router = useRouter(),
    params = useSearchParams();
  useEffect(() => {
    if (
      params.get("foresla") === "1" &&
      me?.user &&
      d.data?.status === "active" &&
      me.user.id !== d.data.owner_id
    ) {
      queueMicrotask(() => setProposal(true));
      window.history.replaceState(window.history.state, "", `/saker/${id}`);
    }
  }, [params, me?.user, d.data, id]);
  if (!d.data) return d.error ? <ErrorText text={d.error} /> : <Loading />;
  const l = d.data,
    own = me?.user?.id === l.owner_id;
  async function state(status: string) {
    if (
      (status === "deleted" || status === "traded") &&
      !confirm(
        status === "deleted"
          ? "Ta bort saken? Den försvinner från utforskningen."
          : "Markera saken som bortbytt?",
      )
    )
      return;
    try {
      await api(`listings/${id}/status`, "POST", { status });
      toast("Saken är uppdaterad.");
      router.push("/mina-saker");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <Back title={categoryName(l.category_id)}>
        <button
          className="icon-button push-right"
          aria-label="Fler alternativ"
          onClick={() => setMore(!more)}
        >
          <MoreHorizontal />
        </button>
      </Back>
      {more && (
        <div className="action-strip">
          {!own && (
            <>
              <button
                className="text-button"
                onClick={() =>
                  me?.user
                    ? setReport(true)
                    : router.push(loginPath(`/saker/${id}`, "report"))
                }
              >
                Rapportera saken
              </button>
              <button
                className="text-button"
                onClick={async () => {
                  if (!me?.user) {
                    router.push(loginPath(`/saker/${id}`, "block"));
                    return;
                  }
                  if (
                    confirm(
                      `Blockera ${l.owner_name}? Pågående byten mellan er avbryts.`,
                    )
                  ) {
                    try {
                      await api(`blocks/${l.owner_id}`, "POST", {});
                      toast("Användaren är blockerad.");
                      router.push("/");
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }
                }}
              >
                Blockera användaren
              </button>
            </>
          )}
        </div>
      )}
      <div className="detail-layout">
        <section className="gallery">
          <img
            className="main-image"
            src={l.images[image]}
            alt={l.title}
            width={900}
            height={720}
          />
          {l.images.length > 1 && (
            <div className="thumbnails">
              {l.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setImage(i)}
                  aria-label={`Visa bild ${i + 1}`}
                  aria-pressed={i === image}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="item-info">
          <p className="eyebrow">
            {conditionName(l.condition)} · {l.city}
            {l.distance !== null ? ` · ca ${l.distance} km bort` : ""}
          </p>
          <h1>{l.title}</h1>
          {l.status !== "active" && (
            <p className="status">{STATUS[l.status]}</p>
          )}
          {l.status === "active" && l.proposal_count > 0 && own && (
            <p className="status">Förslag mottaget</p>
          )}
          <p className="description">{l.description}</p>
          <div className="wanted-box">
            <h2>
              <Repeat2 size={20} /> {own ? "Du söker" : "Önskar i byte"}
            </h2>
            {l.wanted.length > 0 && (
              <div className="term-chips">
                {l.wanted.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            )}
            {!!l.open_to_suggestions && <p>Öppen för förslag</p>}
          </div>
          <Link href={`/profil/${l.owner_id}`} className="owner-row">
            <div className="avatar">
              {p.data?.profile.avatar_url ? (
                <img src={p.data.profile.avatar_url} alt="" />
              ) : (
                l.owner_name.slice(0, 1)
              )}
            </div>
            <div>
              <strong>{l.owner_name}</strong>
              <span>
                {p.data?.profile.email_verified ? "Verifierad e-post" : ""}
                {p.data?.profile.rating
                  ? ` · ${p.data.profile.rating.toFixed(1)} av 5`
                  : ""}
                <br />
                {p.data?.profile.completed_count || 0} genomförda byten
              </span>
            </div>
            <ChevronRight size={20} />
          </Link>
          {own ? (
            <div className="stack compact-stack">
              {["active", "paused"].includes(l.status) && (
                <>
                  <Link className="button full" href={`/saker/${id}/redigera`}>
                    Redigera sak
                  </Link>
                  <button
                    className="outline full"
                    onClick={() =>
                      state(l.status === "paused" ? "active" : "paused")
                    }
                  >
                    {l.status === "paused" ? "Gör aktiv igen" : "Pausa saken"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => state("traded")}
                  >
                    Markera som bortbytt
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => state("deleted")}
                  >
                    Ta bort saken
                  </button>
                </>
              )}
              {l.status === "reserved" && (
                <Link className="button full" href="/meddelanden">
                  Se överenskommelsen
                </Link>
              )}
            </div>
          ) : l.status === "active" ? (
            <div className="detail-cta">
              <button
                className="button full"
                onClick={() => {
                  if (!me?.user) {
                    router.push(loginPath(`/saker/${id}?foresla=1`, "propose"));
                    return;
                  }
                  setProposal(true);
                }}
              >
                <Repeat2 size={20} /> Föreslå byte
              </button>
              <p className="field-help">
                Välj en eller flera saker från Mina saker.
              </p>
            </div>
          ) : (
            <p>Saken är inte tillgänglig för nya förslag.</p>
          )}
          <p className="muted small-copy">Upplagd {date(l.created_at)}</p>
        </section>
      </div>
      {proposal && <Proposal target={l} close={() => setProposal(false)} />}{" "}
      {report && (
        <Report type="listing" id={id} close={() => setReport(false)} />
      )}
    </>
  );
}
function Inventory() {
  const d = useData<Listing[]>("inventory");
  return (
    <>
      <Back title="Mina saker">
        <Link className="button small push-right" href="/lagg-upp">
          <Plus size={17} /> Lägg upp
        </Link>
      </Back>
      <p className="muted">
        Det här har du att byta med. Sakerna kan kombineras i samma förslag.
      </p>
      <ErrorText text={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : d.data?.length ? (
        <div className="inventory-list">
          {d.data.map((l) => (
            <Link key={l.id} href={`/saker/${l.id}`} className="inventory-row">
              <img src={l.images[0]} alt="" />
              <div>
                <h2>{l.title}</h2>
                <p>
                  {conditionName(l.condition)} · {l.city}
                </p>
                <span
                  className={`status ${l.status === "active" ? "active" : ""}`}
                >
                  {l.status === "active" && l.proposal_count
                    ? "Förslag mottaget"
                    : STATUS[l.status]}
                </span>
              </div>
              <ChevronRight />
            </Link>
          ))}
        </div>
      ) : (
        !d.error && (
          <Empty title="Vad har du att byta med?">
            <p>Lägg upp en sak du inte längre behöver.</p>
            <Link className="button" href="/lagg-upp">
              Lägg upp din första sak
            </Link>
          </Empty>
        )
      )}
    </>
  );
}
function Favorites() {
  const d = useData<Listing[]>("favorites");
  return (
    <>
      <Back title="Mina favoriter" />
      <p className="muted">
        Saker du vill hitta tillbaka till. Bara du ser vad du sparar.
      </p>
      <ErrorText text={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : d.data?.length ? (
        <Grid items={d.data} onFavorite={d.refresh} />
      ) : (
        !d.error && (
          <Empty title="Inga favoriter ännu">
            <p>Tryck på hjärtat vid en sak för att spara den.</p>
            <Link href="/">Utforska saker</Link>
          </Empty>
        )
      )}
    </>
  );
}
function Proposal({
  target,
  existing,
  close,
}: {
  target: Listing;
  existing?: Offer;
  close: () => void;
}) {
  const { me, toast } = useContext(Context),
    mine = useData<Listing[]>("inventory"),
    otherId = existing
      ? existing.initiator_id === me?.user?.id
        ? existing.recipient_id
        : existing.initiator_id
      : target.owner_id,
    other = useData<{ items: Listing[] }>(`profiles/${otherId}`),
    router = useRouter();
  const [left, setLeft] = useState<string[]>(
      existing?.items.filter((x) => x.side === "initiator").map((x) => x.id) ||
        [],
    ),
    [right, setRight] = useState<string[]>(
      existing?.items
        .filter((x) => x.side === "recipient")
        .map((x) => x.id) || [target.id],
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const initiator = existing?.initiator_id || me?.user?.id,
    isInitiator = initiator === me?.user?.id,
    ownIds = isInitiator ? left : right,
    otherIds = isInitiator ? right : left;
  const toggle = (lid: string, own: boolean) => {
    const values = own ? ownIds : otherIds,
      updated = values.includes(lid)
        ? values.filter((x) => x !== lid)
        : [...values, lid];
    if (own === isInitiator) setLeft(updated);
    else setRight(updated);
  };
  async function send() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ id: string }>(
        existing ? `trades/${existing.id}/counter` : "trades",
        "POST",
        {
          ...(!existing ? { target: target.id } : {}),
          initiator_items: left,
          recipient_items: right,
          message,
        },
      );
      toast(existing ? "Motbudet är skickat." : "Bytesförslaget är skickat.");
      close();
      router.push(`/byten/${d.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={existing ? "Skicka motbud" : "Föreslå byte"} close={close}>
      <p>Välj sakerna som du vill ska ingå.</p>
      <h3>Du erbjuder</h3>
      <ErrorText text={mine.error} />
      {!mine.data && !mine.error ? (
        <Loading />
      ) : mine.data?.filter((l) => l.status === "active").length ? (
        <div className="item-selector">
          {mine.data
            .filter((l) => l.status === "active")
            .map((l) => (
              <label
                key={l.id}
                className={ownIds.includes(l.id) ? "checked" : ""}
              >
                <input
                  type="checkbox"
                  checked={ownIds.includes(l.id)}
                  onChange={() => toggle(l.id, true)}
                />
                <img src={l.images[0]} alt="" />
                <span>{l.title}</span>
              </label>
            ))}
        </div>
      ) : (
        <p>
          Du behöver en aktiv sak för att kunna föreslå ett byte.{" "}
          <Link href="/lagg-upp">Lägg upp en sak</Link>.
        </p>
      )}
      <h3>Du vill ha</h3>
      <ErrorText text={other.error} />
      <div className="item-selector">
        {(other.data?.items || [target]).map((l) => (
          <label
            key={l.id}
            className={otherIds.includes(l.id) ? "checked" : ""}
          >
            <input
              type="checkbox"
              checked={otherIds.includes(l.id)}
              disabled={!existing && l.id === target.id}
              onChange={() => toggle(l.id, false)}
            />
            <img src={l.images[0]} alt="" />
            <span>{l.title}</span>
          </label>
        ))}
      </div>
      <label>
        Meddelande <span className="muted">(valfritt)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Berätta kort om ditt förslag."
        />
      </label>
      <ErrorText text={error} />
      <button
        className="button full"
        onClick={send}
        disabled={busy || !left.length || !right.length}
      >
        {busy ? "Skickar…" : existing ? "Skicka motbud" : "Skicka förslag"}
      </button>
    </Modal>
  );
}
type Thread = {
  id: string;
  status: string;
  counterpart: string;
  title: string;
  last_message: string;
  unread: number;
  created_at: string;
};
function Conversations() {
  const d = useData<Thread[]>("trades", 10000),
    [tab, setTab] = useState("active");
  return (
    <section className="conversation-page">
      <Back title="Meddelanden" />
      <div className="tabs">
        <button
          className={tab === "active" ? "selected" : ""}
          onClick={() => setTab("active")}
        >
          Pågående byten
        </button>
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => setTab("history")}
        >
          Historik
        </button>
      </div>
      <ErrorText text={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : d.data?.filter((t) =>
          tab === "active"
            ? ["pending", "accepted"].includes(t.status)
            : !["pending", "accepted"].includes(t.status),
        ).length ? (
        <div className="thread-list">
          {d.data
            .filter((t) =>
              tab === "active"
                ? ["pending", "accepted"].includes(t.status)
                : !["pending", "accepted"].includes(t.status),
            )
            .map((t) => (
              <Link className="thread" key={t.id} href={`/byten/${t.id}`}>
                <div className="avatar">{t.counterpart.slice(0, 1)}</div>
                <div>
                  <div className="thread-title">
                    <strong>{t.counterpart}</strong>
                    <span>{date(t.created_at)}</span>
                  </div>
                  <h2>{t.title}</h2>
                  <p>{t.last_message || STATUS[t.status]}</p>
                  <span className="status">{STATUS[t.status]}</span>
                </div>
                {t.unread > 0 && (
                  <span
                    className="unread-count"
                    aria-label={`${t.unread} olästa meddelanden`}
                  >
                    {t.unread}
                  </span>
                )}
                <ChevronRight size={18} />
              </Link>
            ))}
        </div>
      ) : (
        !d.error && (
          <Empty
            title={
              tab === "active"
                ? "Här samlas dina bytesförslag"
                : "Inga tidigare byten"
            }
          >
            <p>
              {tab === "active"
                ? "När du skickar eller får ett förslag kan ni fortsätta prata här."
                : "Dina genomförda och avbrutna byten visas här."}
            </p>
            <Link href="/">Hitta något att byta till dig</Link>
          </Empty>
        )
      )}
    </section>
  );
}
type TradeData = {
  offer: Offer;
  history: Offer[];
  messages: Message[];
  hasMoreMessages: boolean;
  oldestCursor: string | null;
  blocked: boolean;
  review: { stars: number; comment: string } | null;
};
function OfferSummary({ offer, me }: { offer: Offer; me: string }) {
  const own = offer.initiator_id === me ? "initiator" : "recipient";
  return (
    <div className="offer-summary">
      <div>
        <h3>Du erbjuder</h3>
        {offer.items
          .filter((x) => x.side === own)
          .map((l) => (
            <Link href={`/saker/${l.id}`} key={l.id}>
              <img src={l.images[0]} alt="" />
              <span>{l.title}</span>
            </Link>
          ))}
      </div>
      <Repeat2 className="exchange-icon" size={22} />
      <div>
        <h3>Du får</h3>
        {offer.items
          .filter((x) => x.side !== own)
          .map((l) => (
            <Link href={`/saker/${l.id}`} key={l.id}>
              <img src={l.images[0]} alt="" />
              <span>{l.title}</span>
            </Link>
          ))}
      </div>
    </div>
  );
}
function Trade({ id }: { id: string }) {
  const d = useData<TradeData>(`trades/${id}`, 7000),
    { me, toast } = useContext(Context),
    [counter, setCounter] = useState(false),
    [rating, setRating] = useState(false),
    [report, setReport] = useState<{
      type: "user" | "message";
      id: string;
    } | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [older, setOlder] = useState<Message[]>([]),
    [olderCursor, setOlderCursor] = useState<string | null>(null),
    [noMore, setNoMore] = useState(false),
    messagesRef = useRef<HTMLDivElement>(null),
    stickToEnd = useRef(true);
  const lastMessage = d.data?.messages.at(-1)?.id;
  useEffect(() => {
    if (stickToEnd.current && messagesRef.current)
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [lastMessage]);
  useEffect(() => {
    if (
      d.data?.messages.some(
        (m) => m.type === "user" && m.sender_id !== me?.user?.id && !m.read_at,
      )
    )
      void api(`trades/${id}/read`, "POST", {}).catch(() => {});
  }, [id, d.data?.messages, me?.user?.id]);
  if (!d.data) return d.error ? <ErrorText text={d.error} /> : <Loading />;
  const { offer: o, history, messages, blocked, review } = d.data,
    uid = me!.user!.id,
    otherId = uid === o.initiator_id ? o.recipient_id : o.initiator_id,
    name = uid === o.initiator_id ? o.recipient_name : o.initiator_name,
    confirmed =
      uid === o.initiator_id ? o.initiator_confirmed : o.recipient_confirmed;
  async function loadOlder() {
    setBusy(true);
    try {
      const next = await api<TradeData>(
        `trades/${id}?before=${encodeURIComponent(olderCursor || d.data!.oldestCursor || "")}`,
      );
      stickToEnd.current = false;
      setOlder((prev) => [...next.messages, ...prev]);
      setOlderCursor(next.oldestCursor);
      setNoMore(!next.hasMoreMessages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string) {
    if (
      action === "cancel" &&
      !confirm("Avbryta bytet? Reserverade saker blir tillgängliga igen.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`trades/${o.id}/action`, "POST", { action });
      d.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`trades/${id}/messages`, "POST", { body: text });
      setText("");
      d.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="trade-page">
      <Back title={`Byte med ${name}`}>
        <button
          className="icon-button push-right"
          aria-label="Rapportera användare"
          onClick={() => setReport({ type: "user", id: otherId })}
        >
          <Flag size={19} />
        </button>
      </Back>
      <div className="trade-layout">
        <section className="agreement">
          <div className="agreement-heading">
            <span className="status">{STATUS[o.status]}</span>
            <Link href={`/profil/${otherId}`}>
              Visa profil <ChevronRight size={16} />
            </Link>
          </div>
          <h2>
            {o.status === "accepted"
              ? "Det här har ni kommit överens om"
              : o.status === "completed"
                ? "Ert genomförda byte"
                : "Aktuellt bytesförslag"}
          </h2>
          <OfferSummary offer={o} me={uid} />
          {o.message && <p className="offer-note">{o.message}</p>}
          {o.accepted_at && (
            <p className="muted small-copy">
              Överenskommet {date(o.accepted_at, true)}
            </p>
          )}
          {o.status === "pending" && o.proposer_id !== uid && !blocked && (
            <div className="stack compact-stack">
              <button
                disabled={busy}
                className="button full"
                onClick={() => action("accept")}
              >
                Acceptera byte
              </button>
              <button
                disabled={busy}
                className="outline full"
                onClick={() => setCounter(true)}
              >
                Skicka motbud
              </button>
              <button
                disabled={busy}
                className="text-button"
                onClick={() => action("decline")}
              >
                Avböj förslaget
              </button>
            </div>
          )}
          {o.status === "pending" && o.proposer_id === uid && (
            <p>Du väntar på svar från {name}.</p>
          )}
          {o.status === "accepted" && (
            <div className="stack compact-stack">
              <p>
                Bestäm när och var ni ska ses i chatten. Markera bytet när ni
                har bytt saker.
              </p>
              <button
                className="button full"
                onClick={() => action("complete")}
                disabled={busy || !!confirmed}
              >
                {confirmed
                  ? "Du har bekräftat genomförandet"
                  : "Markera som genomfört"}
              </button>
              {!!confirmed && (
                <p className="field-help">
                  Väntar på att {name} också bekräftar.
                </p>
              )}
            </div>
          )}
          {["accepted", "pending"].includes(o.status) && (
            <button
              disabled={busy}
              className="text-button danger"
              onClick={() => action("cancel")}
            >
              Avbryt byte
            </button>
          )}
          {o.status === "completed" &&
            (review ? (
              <p className="rating-done">
                <Check size={18} /> Ditt betyg: {review.stars} av 5
              </p>
            ) : (
              <button className="button full" onClick={() => setRating(true)}>
                Lämna betyg
              </button>
            ))}
          {history.length > 1 && (
            <details className="offer-history">
              <summary>Tidigare förslag ({history.length - 1})</summary>
              {history
                .filter((x) => x.id !== o.id)
                .map((h) => (
                  <div key={h.id}>
                    <p>
                      {date(h.created_at, true)} · {STATUS[h.status]}
                    </p>
                    <OfferSummary offer={h} me={uid} />
                    {h.message && <p>{h.message}</p>}
                  </div>
                ))}
            </details>
          )}
          <ErrorText text={error} />
        </section>
        <section className="chat" aria-label="Samtal om bytet">
          <h2>Er konversation</h2>
          {blocked && (
            <p className="notice">
              Ni kan inte skicka meddelanden till varandra.
            </p>
          )}
          {(d.data.hasMoreMessages || older.length > 0) && !noMore && (
            <button className="text-button" disabled={busy} onClick={loadOlder}>
              Visa tidigare meddelanden
            </button>
          )}
          <div
            className="messages"
            aria-live="polite"
            ref={messagesRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToEnd.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {[...older, ...messages]
              .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
              .map((m) =>
                m.type === "system" ? (
                  <p className="system-message" key={m.id}>
                    {m.body}
                    <time>{date(m.created_at, true)}</time>
                  </p>
                ) : (
                  <div
                    key={m.id}
                    className={`message ${m.sender_id === uid ? "own" : ""}`}
                  >
                    <p>{m.body}</p>
                    <div>
                      <time>{date(m.created_at, true)}</time>
                      {m.sender_id === uid && (
                        <span>{m.read_at ? "Läst" : "Skickat"}</span>
                      )}
                      {m.sender_id !== uid && (
                        <button
                          className="report-message"
                          aria-label="Rapportera meddelandet"
                          onClick={() =>
                            setReport({ type: "message", id: m.id })
                          }
                        >
                          <Flag size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ),
              )}
          </div>
          <form onSubmit={send} className="message-input">
            <label className="sr-only" htmlFor="message">
              Meddelande
            </label>
            <textarea
              id="message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                blocked ? "Meddelanden är blockerade" : "Skriv ett meddelande…"
              }
              maxLength={2000}
              rows={2}
              disabled={blocked}
            />
            <button
              className="button"
              disabled={blocked || busy || !text.trim()}
              aria-label="Skicka meddelande"
            >
              <ArrowRight size={22} />
            </button>
          </form>
          <button
            className="text-button small-copy"
            onClick={async () => {
              if (
                confirm(`Blockera ${name}? Pågående byten mellan er avbryts.`)
              ) {
                try {
                  await api(`blocks/${otherId}`, "POST", {});
                  toast("Användaren är blockerad.");
                  d.refresh();
                } catch (e) {
                  toast((e as Error).message);
                }
              }
            }}
          >
            Blockera {name}
          </button>
        </section>
      </div>
      {counter && (
        <Proposal
          target={
            o.items.find((x) => x.id === o.target_listing_id) ||
            o.items.find((x) => x.side === "recipient")!
          }
          existing={o}
          close={() => {
            setCounter(false);
            d.refresh();
          }}
        />
      )}
      {rating && (
        <Rating
          offerId={o.id}
          name={name}
          close={() => {
            setRating(false);
            d.refresh();
          }}
        />
      )}
      {report && (
        <Report
          type={report.type}
          id={report.id}
          close={() => setReport(null)}
        />
      )}
    </section>
  );
}
function Rating({
  offerId,
  name,
  close,
}: {
  offerId: string;
  name: string;
  close: () => void;
}) {
  const [stars, setStars] = useState(5),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    { toast } = useContext(Context);
  async function save() {
    setBusy(true);
    try {
      await api(`trades/${offerId}/review`, "POST", { stars, comment });
      toast("Tack, ditt betyg är sparat.");
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Hur gick bytet med ${name}?`} close={close}>
      <fieldset>
        <legend>Ditt betyg</legend>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStars(s)}
              aria-label={`${s} av 5 stjärnor`}
              aria-pressed={s === stars}
              className={s <= stars ? "filled" : ""}
            >
              ★
            </button>
          ))}
        </div>
        <p>{stars} av 5 stjärnor</p>
      </fieldset>
      <label>
        Kommentar (valfritt)
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={400}
          rows={3}
        />
      </label>
      <ErrorText text={error} />
      <button className="button full" disabled={busy} onClick={save}>
        {busy ? "Sparar…" : "Spara betyg"}
      </button>
    </Modal>
  );
}
function Report({
  type,
  id,
  close,
}: {
  type: string;
  id: string;
  close: () => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0]),
    [details, setDetails] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { toast } = useContext(Context);
  async function send() {
    setBusy(true);
    try {
      await api("reports", "POST", {
        target_type: type,
        target_id: id,
        reason,
        details,
      });
      toast("Rapporten är skickad. Vi tittar på den.");
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Rapportera" close={close}>
      <p>
        Berätta vad som inte stämmer. Den du rapporterar får inte veta vem du
        är.
      </p>
      <label>
        Orsak
        <select
          aria-label="Orsak"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Beskriv vad som hänt (valfritt)
        <textarea
          maxLength={1000}
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </label>
      <ErrorText text={error} />
      <button className="button full" onClick={send} disabled={busy}>
        {busy ? "Skickar…" : "Skicka rapport"}
      </button>
    </Modal>
  );
}
function MyProfile() {
  const { me } = useContext(Context),
    [edit, setEdit] = useState(false),
    u = me!.user!;
  if (edit) return <ProfileForm close={() => setEdit(false)} />;
  return (
    <section className="profile-page narrow">
      <Back title="Min profil" />
      <ProfileHeader profile={u} />
      <button className="outline full" onClick={() => setEdit(true)}>
        Redigera profil
      </button>
      <div className="profile-menu">
        {[
          ["/mina-saker", "Mina saker", `${u.active_count} aktiva`],
          ["/meddelanden", "Mina byten", `${u.completed_count} genomförda`],
          ["/favoriter", "Mina favoriter", ""],
          [
            "/bevakningar",
            "Bevakningar",
            `${u.default_search_radius_km} km som standard`,
          ],
          ["/notiser", "Aktivitet och notiser", ""],
          ["/blockerade", "Blockerade användare", ""],
          ["/regler", "Regler och personuppgifter", ""],
          ...(u.role === "admin" ? [["/admin", "Moderering", ""]] : []),
        ].map(([href, title, sub]) => (
          <Link key={href} href={href}>
            <div>
              <strong>{title}</strong>
              {sub && <span>{sub}</span>}
            </div>
            <ChevronRight size={19} />
          </Link>
        ))}
      </div>
      <AppearanceSettings />
      <SignOut />
    </section>
  );
}
function AppearanceSettings() {
  const { refresh } = useContext(Context),
    preference = useAppearancePreference(),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  async function save(next: ThemePreference) {
    setBusy(true);
    setStatus("");
    setError("");
    setAppearance(next);
    try {
      await api("preferences", "PUT", { theme_preference: next });
      refresh();
      setStatus("Utseendet är sparat.");
    } catch (e) {
      setAppearance(preference);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="appearance-settings" aria-labelledby="settings-title">
      <h2 id="settings-title">Inställningar</h2>
      <fieldset disabled={busy} aria-describedby="appearance-help">
        <legend>Utseende</legend>
        <p id="appearance-help">Välj själv eller följ enhetens inställning.</p>
        <div className="appearance-options">
          {(
            [
              ["light", "Ljust"],
              ["dark", "Mörkt"],
              ["system", "Följ enheten"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={preference === value}
                onChange={() => void save(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="appearance-status" role="status">
        {busy ? "Sparar…" : status}
      </p>
      <ErrorText text={error} />
    </section>
  );
}
function ProfileHeader({ profile: p }: { profile: Profile }) {
  return (
    <>
      <div className="profile-header">
        <div className="avatar large">
          {p.avatar_url ? (
            <img src={p.avatar_url} alt={`Profilbild för ${p.display_name}`} />
          ) : (
            p.display_name.slice(0, 1)
          )}
        </div>
        <div>
          <h1>{p.display_name}</h1>
          <p>
            <MapPin size={15} />
            {p.city}
          </p>
          {!!p.email_verified && (
            <p className="verified">
              <ShieldCheck size={15} /> Verifierad e-post
            </p>
          )}
        </div>
      </div>
      {p.bio && <p>{p.bio}</p>}
      <div className="profile-stats">
        <div>
          <strong>{p.active_count}</strong>
          <span>aktiva saker</span>
        </div>
        <div>
          <strong>{p.completed_count}</strong>
          <span>genomförda byten</span>
        </div>
        <div>
          <strong>{p.rating ? p.rating.toFixed(1) : "—"}</strong>
          <span>
            {p.rating_count ? `${p.rating_count} betyg` : "Inga betyg ännu"}
          </span>
        </div>
      </div>
      <p className="muted small-copy">Medlem sedan {date(p.created_at)}</p>
    </>
  );
}
function PublicProfile({ id }: { id: string }) {
  const d = useData<{
      profile: Profile;
      items: Listing[];
      reviews: {
        stars: number;
        comment: string;
        reviewer_name: string;
        created_at: string;
      }[];
    }>(`profiles/${id}`),
    { me, toast } = useContext(Context),
    router = useRouter(),
    [report, setReport] = useState(false);
  if (!d.data) return d.error ? <ErrorText text={d.error} /> : <Loading />;
  const p = d.data.profile;
  return (
    <>
      <Back title="Profil" />
      <section className="public-profile">
        <ProfileHeader profile={p} />
        {me?.user?.id !== id && (
          <div className="action-strip">
            <button
              className="text-button"
              onClick={() =>
                me?.user
                  ? setReport(true)
                  : router.push(loginPath(location.pathname, "report"))
              }
            >
              Rapportera användare
            </button>
            <button
              className="text-button"
              onClick={async () => {
                if (!me?.user) {
                  router.push(loginPath(location.pathname, "block"));
                  return;
                }
                if (
                  confirm(
                    `Blockera ${p.display_name}? Pågående byten mellan er avbryts.`,
                  )
                ) {
                  try {
                    await api(`blocks/${id}`, "POST", {});
                    toast("Användaren är blockerad.");
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }
              }}
            >
              Blockera
            </button>
          </div>
        )}
      </section>
      <h2 className="section-title">Mina saker</h2>
      {d.data.items.length ? (
        <Grid items={d.data.items} />
      ) : (
        <Empty title="Inga aktiva saker just nu" />
      )}
      {d.data.reviews.length > 0 && (
        <section className="reviews">
          <h2>Betyg efter byten</h2>
          {d.data.reviews.map((r, i) => (
            <article key={i}>
              <strong>
                {r.reviewer_name} · {r.stars} av 5
              </strong>
              <time>{date(r.created_at)}</time>
              {r.comment && <p>{r.comment}</p>}
            </article>
          ))}
        </section>
      )}
      {report && <Report type="user" id={id} close={() => setReport(false)} />}
    </>
  );
}
type Saved = {
  id: string;
  query: string;
  category_id: string | null;
  city: string;
  radius_km: number;
};
function Watches() {
  const d = useData<Saved[]>("searches"),
    { toast } = useContext(Context);
  return (
    <section className="narrow">
      <Back title="Bevakningar" />
      <p>Du får en notis när en ny sak matchar din sökning.</p>
      <ErrorText text={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : d.data?.length ? (
        <div className="saved-list">
          {d.data.map((w) => (
            <div key={w.id}>
              <Bookmark size={21} />
              <Link
                href={`/sok?${new URLSearchParams({ q: w.query, category: w.category_id || "", city: w.city, radius: String(w.radius_km) })}`}
              >
                <strong>
                  {w.query || categoryName(w.category_id || "") || "Alla saker"}
                </strong>
                <span>
                  {w.city} · inom {w.radius_km} km
                  {w.category_id ? ` · ${categoryName(w.category_id)}` : ""}
                </span>
              </Link>
              <button
                className="icon-button"
                aria-label="Ta bort bevakning"
                onClick={async () => {
                  try {
                    await api(`searches/${w.id}`, "DELETE");
                    d.refresh();
                    toast("Bevakningen är borttagen.");
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !d.error && (
          <Empty title="Inga bevakningar ännu">
            <p>Sök efter något och välj Bevaka sökningen.</p>
            <Link className="button" href="/sok">
              Skapa en sökning
            </Link>
          </Empty>
        )
      )}
    </section>
  );
}
function Notifications({
  notices,
  refresh,
}: {
  notices?: Notice[];
  refresh: () => void;
}) {
  const router = useRouter(),
    { toast } = useContext(Context);
  return (
    <section className="narrow">
      <Back title="Aktivitet" />
      {!!notices?.length && (
        <button
          className="text-button"
          onClick={async () => {
            try {
              await api("notifications", "POST", {});
              refresh();
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          Markera alla som lästa
        </button>
      )}
      {!notices ? (
        <Loading />
      ) : notices.length ? (
        <div className="notification-list">
          {notices.map((n) => (
            <button
              key={n.id}
              className={!n.read_at ? "unread" : ""}
              onClick={async () => {
                try {
                  await api(`notifications/${n.id}`, "POST", {});
                  refresh();
                  router.push(n.href);
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <span className="notification-dot" />
              <div>
                <p>{n.body}</p>
                <time>{date(n.created_at, true)}</time>
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <Empty title="Du är uppdaterad">
          <p>
            Nya förslag, meddelanden och träffar på dina bevakningar samlas här.
          </p>
        </Empty>
      )}
    </section>
  );
}
function Blocked() {
  const d = useData<{ id: string; display_name: string }[]>("blocks"),
    { toast } = useContext(Context);
  return (
    <section className="narrow">
      <Back title="Blockerade användare" />
      <p>
        Blockerade personer kan inte skicka förslag eller meddelanden till dig.
      </p>
      <ErrorText text={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : d.data?.length ? (
        d.data.map((u) => (
          <div className="blocked-row" key={u.id}>
            <strong>{u.display_name}</strong>
            <button
              className="outline"
              onClick={async () => {
                try {
                  await api(`blocks/${u.id}`, "DELETE");
                  d.refresh();
                  toast("Blockeringen är borttagen.");
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              Ta bort blockering
            </button>
          </div>
        ))
      ) : (
        !d.error && <Empty title="Ingen är blockerad" />
      )}
    </section>
  );
}
type AdminData = {
  reports: {
    id: string;
    reporter_name: string;
    target_type: string;
    target_id: string;
    target_text: string;
    reason: string;
    details: string;
    status: string;
    created_at: string;
  }[];
  users: {
    id: string;
    display_name: string;
    city: string;
    suspended: number;
  }[];
  audit: {
    id: string;
    actor_name: string;
    action: string;
    target_id: string;
    created_at: string;
  }[];
  metrics: {
    totals: Record<string, number>;
    radii: { radius: number; users: number }[];
    events: { type: string; radius_km: number; count: number; items: number }[];
    perUser: Record<string, unknown>[];
    timings: Record<string, unknown>[];
    returningUsers: { count: number };
  };
};
function Moderation() {
  const d = useData<AdminData>("admin"),
    { toast } = useContext(Context),
    [tab, setTab] = useState("reports");
  async function act(action: string, id: string) {
    try {
      await api("admin", "POST", { action, id });
      d.refresh();
      toast("Ändringen är sparad.");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (!d.data) return d.error ? <ErrorText text={d.error} /> : <Loading />;
  return (
    <>
      <Back title="Moderering" />
      <div className="tabs">
        {[
          ["reports", "Rapporter"],
          ["users", "Användare"],
          ["audit", "Händelselogg"],
          ["metrics", "Produktmått"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "reports" &&
        (d.data.reports.length ? (
          d.data.reports.map((r) => (
            <article className="admin-report" key={r.id}>
              <div>
                <span className="status">
                  {r.status === "open" ? "Ny rapport" : "Hanterad"}
                </span>
                <time>{date(r.created_at, true)}</time>
              </div>
              <h2>{r.reason}</h2>
              <p>{r.target_text}</p>
              {r.details && <p>{r.details}</p>}
              <p className="muted">Rapporterat av {r.reporter_name}</p>
              <div className="action-strip">
                {r.target_type === "listing" && (
                  <>
                    <Link className="outline" href={`/saker/${r.target_id}`}>
                      Öppna saken
                    </Link>
                    <button
                      className="button"
                      onClick={() => act("hide", r.target_id)}
                    >
                      Dölj annons
                    </button>
                    <button
                      className="outline"
                      onClick={() => act("show", r.target_id)}
                    >
                      Visa annons igen
                    </button>
                  </>
                )}
                {r.target_type === "user" && (
                  <>
                    <Link className="outline" href={`/profil/${r.target_id}`}>
                      Öppna profil
                    </Link>
                    <button
                      className="button"
                      onClick={() => act("suspend", r.target_id)}
                    >
                      Stäng av
                    </button>
                  </>
                )}
                {r.status === "open" && (
                  <button
                    className="outline"
                    onClick={() => act("resolve", r.id)}
                  >
                    Markera hanterad
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty title="Inga rapporter" />
        ))}
      {tab === "users" &&
        d.data.users.map((u) => (
          <div className="blocked-row" key={u.id}>
            <div>
              <Link href={`/profil/${u.id}`}>
                <strong>{u.display_name}</strong>
              </Link>
              <p>
                {u.city} · {u.suspended ? "Avstängd" : "Aktiv"}
              </p>
            </div>
            <button
              className="outline"
              onClick={() => act(u.suspended ? "reactivate" : "suspend", u.id)}
            >
              {u.suspended ? "Återaktivera" : "Stäng av"}
            </button>
          </div>
        ))}
      {tab === "audit" && (
        <div className="audit-list">
          {d.data.audit.map((a) => (
            <p key={a.id}>
              <strong>{a.actor_name}</strong> ·{" "}
              {{
                hide: "Döljde annons",
                show: "Visade annons",
                suspend: "Stängde av användare",
                reactivate: "Återaktiverade användare",
                resolve: "Hanterade rapport",
              }[a.action] || a.action}
              <br />
              <code>{a.target_id}</code>
              <br />
              <time>{date(a.created_at, true)}</time>
            </p>
          ))}
        </div>
      )}
      {tab === "metrics" && (
        <div className="metrics">
          <p className="muted">
            Besök, sökningar och matchningar räknas för användare som godkänt
            statistik. Antal annonser och byten räknas från tjänstens uppgifter.
          </p>
          <h2>Annonser och byten</h2>
          <dl>
            {Object.entries(d.data.metrics.totals).map(([k, v]) => (
              <div key={k}>
                <dt>
                  {{
                    active_listings: "Aktiva annonser",
                    offers: "Skickade förslag",
                    accepted: "Accepterade förslag",
                    completed: "Genomförda byten",
                    listings_with_offers: "Annonser som fått förslag",
                    multi_item_offers: "Förslag med flera saker",
                  }[k] || k}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            Accepterade:{" "}
            {Math.round(
              (100 * (d.data.metrics.totals.accepted || 0)) /
                Math.max(1, d.data.metrics.totals.offers),
            )}{" "}
            %. Genomförda av accepterade:{" "}
            {Math.round(
              (100 * (d.data.metrics.totals.completed || 0)) /
                Math.max(1, d.data.metrics.totals.accepted),
            )}{" "}
            %.
          </p>
          <h2>Vald sökradie</h2>
          {d.data.metrics.radii.map((x) => (
            <p key={x.radius}>
              {x.radius} km: {x.users} användare
            </p>
          ))}
          <h2>Återkommande användare</h2>
          <p>
            {d.data.metrics.returningUsers.count} har varit aktiva under flera
            dagar.
          </p>
          <details>
            <summary>Sök- och matchningshändelser</summary>
            <dl>
              {d.data.metrics.events.map((e, i) => (
                <div key={i}>
                  <dt>
                    {{
                      account_created: "Nya konton",
                      profile_updated: "Profiländringar",
                      radius_changed: "Ändrad sökradie",
                      search: "Sökningar",
                      matches_viewed: "Visade matchningar",
                      offer_sent: "Skickade förslag",
                      session: "Besök",
                    }[e.type] || "Övriga händelser"}
                    {e.radius_km ? ` · ${e.radius_km} km` : ""}
                  </dt>
                  <dd>{e.type === "matches_viewed" ? e.items : e.count}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details>
            <summary>Aktiva annonser per användare</summary>
            <dl>
              {d.data.metrics.perUser.map((p, i) => (
                <div key={i}>
                  <dt>{String(p.display_name)}</dt>
                  <dd>{Number(p.active_listings)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details>
            <summary>Tid till första matchning och förslag (minuter)</summary>
            <dl>
              {d.data.metrics.timings.map((p, i) => (
                <div key={i}>
                  <dt>
                    {String(
                      d.data!.metrics.perUser.find((u) => u.id === p.id)
                        ?.display_name || "Användare",
                    )}
                  </dt>
                  <dd>
                    Matchning:{" "}
                    {p.first_match_minutes === null
                      ? "—"
                      : Math.round(Number(p.first_match_minutes))}{" "}
                    · Förslag:{" "}
                    {p.first_offer_minutes === null
                      ? "—"
                      : Math.round(Number(p.first_offer_minutes))}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </>
  );
}
function Policy() {
  const auth = useData<{ method: "magic-link" | "password" }>("auth/config");
  return (
    <article className="narrow policy">
      <Back title="Så fungerar AllTing" />
      <h2>Byt saker med varandra</h2>
      <p>
        AllTing hjälper privatpersoner att hitta något de söker genom att
        erbjuda saker de redan har. Du och den andra personen avgör själva om ni
        vill byta. En eller flera saker kan ingå på båda sidor.
      </p>
      <h2>Kom överens innan ni ses</h2>
      <p>
        Ett förslag reserverar ingen sak. När förslaget accepteras blir sakerna
        reserverade. Bestäm mötesplats i er privata chatt och kontrollera
        sakerna när ni ses. Båda bekräftar efteråt att bytet är genomfört.
      </p>
      <h2>Det här får inte läggas upp</h2>
      <ul>
        {PROHIBITED.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p>
        Du måste ha rätt att byta bort saken. Beskriv skick och eventuella fel
        tydligt.
      </p>
      <h2>Om något inte stämmer</h2>
      <p>
        Rapportera saken, användaren eller meddelandet. AllTings moderatorer kan
        granska rapporterat innehåll, dölja saker och stänga av konton.
        Blockering stoppar nya förslag och meddelanden och avbryter pågående
        byten mellan er.
      </p>
      <h2>Dina uppgifter</h2>
      <p>
        Ditt visningsnamn, din ort, presentation, aktiva saker och betyg visas
        för andra. Din e-post är privat. Vi sparar ortens ungefärliga läge,
        aldrig din hemadress eller din exakta GPS-position. Bilder förbereds
        utan platsinformation före uppladdning.
      </p>
      <p>
        Favoriter och bevakningar syns bara för dig. Konversationer och
        bytesförslag kan bara läsas av deltagarna. En moderator ser ett
        meddelande när det rapporteras. Offline-läget sparar inga privata
        uppgifter.
      </p>
      <p>
        Om du godkänner användningsstatistik räknar vi händelser som sökningar,
        val av radie och skickade bytesförslag för att förbättra tjänsten.
        Meddelandetext och exakta mötesplatser ingår inte. Du kan ändra ditt val
        under <Link href="/cookies">Cookieinställningar</Link>.
      </p>
      <h2>Ditt konto</h2>
      <p>
        {auth.data?.method === "password"
          ? "Du skapar ett konto med din e-postadress och ett lösenord. Bekräfta adressen via mejlet innan du börjar byta. Om du glömmer lösenordet kan du återställa det via e-post."
          : auth.data?.method === "magic-link"
            ? "Du loggar in med en engångslänk till din e-post. För att återfå åtkomst ber du om en ny länk till samma adress."
            : "Ett konto med verifierad e-post behövs för att lägga upp saker och kontakta andra."}{" "}
        Du väljer själv ditt visningsnamn. Du kan redigera din profil, ta bort
        saker och radera bevakningar från din profil.
      </p>
      <p>
        {auth.data?.method === "password"
          ? "Firebase, en tjänst från Google, hanterar e-postadress, lösenord och mejl för verifiering och återställning. AllTing sparar inte ditt lösenord."
          : auth.data?.method === "magic-link"
            ? "Resend skickar inloggningsmejlen och får därför din e-postadress och innehållet i mejlet."
            : "Din e-postadress används för att skydda åtkomsten till ditt konto."}{" "}
        Tekniska sessionsuppgifter används för att hålla dig inloggad och skydda
        ditt konto. Din e-post visas aldrig på din offentliga profil.
      </p>
    </article>
  );
}
