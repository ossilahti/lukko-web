"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  DEFAULT_BLOCKED_DOMAINS,
  DEFAULT_STATE,
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  PRESETS,
  clampCustomMinutes,
  completeFocusSession,
  createRunningState,
  formatClock,
  getDateKey,
  getPresetMinutes,
  getSecondsRemaining,
  normalizeDomain,
  normalizeDomains,
  pauseFocusSession,
  resetFocusSession,
  resumeFocusSession,
  type PersistedState,
  type ThemeMode,
} from "./focus-state";

const STORAGE_KEY = "lukko-web-mvp-state";
const EXTENSION_GUIDE_URL = "https://github.com/ossilahti/lukko-web/tree/main/extension";

type Membership = "checking" | "free" | "pro";

function loadState(): PersistedState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const theme = parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : DEFAULT_STATE.theme;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      theme,
      customMinutes: clampCustomMinutes(Number(parsed.customMinutes ?? DEFAULT_STATE.customMinutes)),
      blockedDomains: Array.isArray(parsed.blockedDomains) ? normalizeDomains(parsed.blockedDomains) : [...DEFAULT_BLOCKED_DOMAINS],
      blockingEnabled: typeof parsed.blockingEnabled === "boolean" ? parsed.blockingEnabled : DEFAULT_STATE.blockingEnabled,
      selectedAppIds: Array.isArray(parsed.selectedAppIds) ? parsed.selectedAppIds.filter((id) => ["mail", "instagram", "youtube"].includes(id as string)) as PersistedState["selectedAppIds"] : DEFAULT_STATE.selectedAppIds,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : DEFAULT_STATE.sessions,
      isRunning: Boolean(parsed.isRunning),
      endAt: typeof parsed.endAt === "number" ? parsed.endAt : null,
      pausedRemainingSeconds: typeof parsed.pausedRemainingSeconds === "number" ? parsed.pausedRemainingSeconds : null,
      activeDurationSeconds: typeof parsed.activeDurationSeconds === "number" ? parsed.activeDurationSeconds : null,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function LogoMark() {
  return <span className="brand-mark" aria-hidden="true"><span /></span>;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("fi-FI", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function themeLabel(theme: ThemeMode) {
  if (theme === "light") return "Vaalea";
  if (theme === "dark") return "Tumma";
  return "Järjestelmä";
}

export default function Home() {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [domainInput, setDomainInput] = useState("");
  const [domainError, setDomainError] = useState("");
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [extensionBlocking, setExtensionBlocking] = useState(false);
  const [membership, setMembership] = useState<Membership>("checking");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setState(loadState());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    if (!state.isRunning) return;
    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setState((current) => {
        const totalSeconds = getPresetMinutes(current.presetId, current.customMinutes) * 60;
        return current.isRunning && getSecondsRemaining(current, timestamp, totalSeconds) <= 0 ? completeFocusSession(current, timestamp) : current;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [state.isRunning]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = state.theme;
  }, [hydrated, state.theme]);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const endpoint = sessionId ? `/api/entitlement?session_id=${encodeURIComponent(sessionId)}` : "/api/entitlement";

    fetch(endpoint, { credentials: "include" })
      .then((response) => response.ok ? response.json() : { pro: false })
      .then((result: { pro?: boolean }) => setMembership(result.pro ? "pro" : "free"))
      .catch(() => setMembership("free"));

    if (sessionId) window.history.replaceState({}, "", "/?checkout=success");
  }, [hydrated]);

  useEffect(() => {
    const receiveExtensionStatus = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "lukko-extension") return;
      setExtensionConnected(Boolean(event.data.connected));
      setExtensionBlocking(Boolean(event.data.active));
    };

    const askExtensionStatus = () => window.postMessage({ source: "lukko-web", type: "lukko-status" }, "*");
    window.addEventListener("message", receiveExtensionStatus);
    askExtensionStatus();
    const interval = window.setInterval(askExtensionStatus, 4000);
    return () => {
      window.removeEventListener("message", receiveExtensionStatus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.postMessage({
      source: "lukko-web",
      type: "lukko-focus-state",
      payload: { active: state.isRunning && state.blockingEnabled, until: state.endAt, blockedDomains: state.blockedDomains },
    }, "*");
  }, [hydrated, state.blockedDomains, state.blockingEnabled, state.endAt, state.isRunning]);

  const totalSeconds = getPresetMinutes(state.presetId, state.customMinutes) * 60;
  const remainingSeconds = getSecondsRemaining(state, now, totalSeconds);
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds)) : 0;
  const todayKey = getDateKey(now);
  const todaySessions = useMemo(() => state.sessions.filter((session) => getDateKey(session.completedAt) === todayKey), [state.sessions, todayKey]);
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const isPaused = !state.isRunning && state.pausedRemainingSeconds !== null;

  const updateState = (change: (current: PersistedState) => PersistedState) => setState((current) => change(current));

  const choosePreset = (presetId: PersistedState["presetId"]) => {
    if (!state.isRunning) updateState((current) => resetFocusSession({ ...current, presetId }));
  };

  const handleTimer = () => {
    if (state.isRunning) updateState((current) => pauseFocusSession(current, Date.now()));
    else if (isPaused) updateState((current) => resumeFocusSession(current, Date.now()));
    else updateState((current) => createRunningState(current, Date.now(), totalSeconds));
  };

  const addDomain = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const domain = normalizeDomain(domainInput);
    if (!domain) {
      setDomainError("Kirjoita verkkotunnus, esimerkiksi tiktok.com.");
      return;
    }
    if (state.blockedDomains.includes(domain)) {
      setDomainError("Tämä verkkotunnus on jo listalla.");
      return;
    }
    updateState((current) => ({ ...current, blockedDomains: [...current.blockedDomains, domain] }));
    setDomainInput("");
    setDomainError("");
  };

  const startCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: checkoutEmail }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Maksamista ei voitu aloittaa.");
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Maksamista ei voitu aloittaa.");
      setCheckoutBusy(false);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const response = await fetch("/api/portal", { method: "POST", credentials: "include" });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Tilausta ei voitu avata.");
      window.location.assign(result.url);
    } catch {
      setPortalBusy(false);
    }
  };

  const showAd = membership !== "pro";
  const statusText = state.isRunning ? "Käynnissä" : isPaused ? "Tauolla" : "Valmis";

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Lukko, etusivu"><LogoMark /><span>Lukko</span></Link>
        <nav className="main-nav" aria-label="Päänavigaatio"><a href="#ajastin">Ajastin</a><a href="#estot">Estot</a><a href="#historia">Historia</a></nav>
        <div className="header-tools">
          <label className="theme-select"><span className="sr-only">Teema</span><select value={state.theme} onChange={(event) => updateState((current) => ({ ...current, theme: event.target.value as ThemeMode }))}><option value="system">{themeLabel("system")}</option><option value="light">{themeLabel("light")}</option><option value="dark">{themeLabel("dark")}</option></select></label>
          {membership === "pro" ? <span className="membership-tag">Pro</span> : <button className="button button-small" type="button" onClick={() => setCheckoutOpen(true)}>Lukko Pro</button>}
        </div>
      </header>

      {showAd && <aside className="ad-strip" aria-label="Mainos"><span className="ad-label">MAINOS</span><span>Keskitä päiväsi ilman rajoja.</span><button type="button" onClick={() => setCheckoutOpen(true)}>Poista mainokset Lukko Prolla →</button></aside>}

      <section className="intro"><p className="section-label">Keskittymisajastin</p><h1>Yksi asia kerrallaan.</h1><p>Valitse aika, aloita työ ja anna Lukon pitää häiriöt poissa.</p></section>

      <section className="workspace" id="ajastin" aria-labelledby="timer-heading">
        <div className="timer-pane">
          <div className="section-topline"><span>01 / AJASTIN</span><span className="plain-status">{statusText}</span></div>
          <h2 id="timer-heading">{state.isRunning ? "Keskity tähän hetkeen." : isPaused ? "Jatketaanko?" : "Aloita uusi hetki."}</h2>
          <div className="timer-display" aria-live="polite">{formatClock(remainingSeconds)}</div>
          <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="timer-controls"><button className="button button-primary" type="button" onClick={handleTimer}>{state.isRunning ? "Tauota" : isPaused ? "Jatka" : "Aloita"}</button><button className="button button-secondary" type="button" onClick={() => updateState((current) => resetFocusSession(current))}>Nollaa</button></div>
          <div className="preset-control"><span className="field-label">Valitse aika</span><div className="preset-row">{PRESETS.map((preset) => <button className={state.presetId === preset.id ? "preset-active" : ""} type="button" key={preset.id} onClick={() => choosePreset(preset.id)} disabled={state.isRunning}>{preset.label}{preset.minutes ? ` · ${preset.minutes} min` : ""}</button>)}</div>{state.presetId === "custom" && <label className="custom-range"><span>{state.customMinutes} min</span><input type="range" min={MIN_CUSTOM_MINUTES} max={MAX_CUSTOM_MINUTES} step="5" value={state.customMinutes} onChange={(event) => updateState((current) => resetFocusSession({ ...current, customMinutes: clampCustomMinutes(Number(event.target.value)) }))} disabled={state.isRunning} /></label>}</div>
        </div>

        <div className="settings-pane" id="estot">
          <div className="section-topline"><span>02 / ASETUKSET</span><span>{state.blockedDomains.length} sivustoa</span></div>
          <h2>Sivustoestot</h2>
          <label className="setting-row"><span><strong>Tämä istunto</strong><small>{extensionConnected ? extensionBlocking ? "Estot ovat päällä selaimessa." : "Laajennus on yhdistetty." : "Asenna selainlaajennus oikeaa estoa varten."}</small></span><input className="check-toggle" type="checkbox" checked={state.blockingEnabled} onChange={() => updateState((current) => ({ ...current, blockingEnabled: !current.blockingEnabled }))} /></label>
          <p className="field-label domain-label">Estettävät verkkotunnukset</p>
          <ul className="domain-list">{state.blockedDomains.map((domain) => <li key={domain}><span>{domain}</span><button type="button" onClick={() => updateState((current) => ({ ...current, blockedDomains: current.blockedDomains.filter((item) => item !== domain) }))}>poista</button></li>)}</ul>
          <form className="domain-form" onSubmit={addDomain}><input value={domainInput} onChange={(event) => { setDomainInput(event.target.value); setDomainError(""); }} placeholder="esim. reddit.com" aria-label="Lisää estettävä verkkotunnus" /><button className="button button-secondary" type="submit">Lisää</button></form>
          {domainError && <p className="form-error" role="alert">{domainError}</p>}
          <a className="text-link" href={EXTENSION_GUIDE_URL} target="_blank" rel="noreferrer">Asennusohjeet Chromiumille →</a>
          <p className="small-note">Selainlaajennus estää nämä sivustot aktiivisen istunnon aikana. Lukko Web ei voi estää iPhone-sovelluksia ilman erillistä iOS-sovellusta.</p>
        </div>
      </section>

      <section className="simple-section" id="historia" aria-labelledby="history-heading"><div className="section-heading"><div><p className="section-label">03 / HISTORIA</p><h2 id="history-heading">Tänään</h2></div><strong className="today-total">{todayMinutes} min</strong></div>{todaySessions.length === 0 ? <p className="empty-line">Valmiit keskittymishetket näkyvät täällä.</p> : <div className="history-table"><div className="history-table-head"><span>Aika</span><span>Kesto</span></div>{[...todaySessions].reverse().map((session) => <div className="history-table-row" key={session.id}><span>{formatDate(session.completedAt)}</span><strong>{session.durationMinutes} min</strong></div>)}</div>}</section>

      <section className="pro-section" aria-labelledby="pro-heading"><div><p className="section-label">LUKKO PRO</p><h2 id="pro-heading">Rauha ilman mainoksia.</h2><p>Pro poistaa mainokset ja pitää fokuksen yksinkertaisena. Tilauksen voi hallita turvallisesti Stripen omalla sivulla.</p></div><div className="pro-action">{membership === "pro" ? <><span className="pro-active">Pro on aktiivinen</span><button className="text-button" type="button" onClick={openPortal} disabled={portalBusy}>{portalBusy ? "Avataan…" : "Hallitse tilausta →"}</button></> : <><strong>4,99 € / kk</strong><button className="button button-primary" type="button" onClick={() => setCheckoutOpen(true)}>Osta Pro</button></>}</div></section>

      <footer className="site-footer"><span>© {new Date().getFullYear()} Lukko</span><span>Paikallinen käyttö · Ei seuraamista</span></footer>

      {checkoutOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-heading"><button className="dialog-close" type="button" onClick={() => setCheckoutOpen(false)} aria-label="Sulje">×</button><p className="section-label">LUKKO PRO</p><h2 id="checkout-heading">Poista mainokset.</h2><p>Stripe käsittelee maksun. Lukko ei näe korttinumeroasi.</p><form onSubmit={startCheckout}><label className="dialog-label" htmlFor="checkout-email">Sähköposti</label><input id="checkout-email" type="email" required value={checkoutEmail} onChange={(event) => setCheckoutEmail(event.target.value)} placeholder="sinä@example.com" autoComplete="email" /><button className="button button-primary dialog-submit" type="submit" disabled={checkoutBusy}>{checkoutBusy ? "Siirrytään Stripeen…" : "Jatka maksamaan →"}</button></form>{checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}<small>Maksu avautuu Stripen suojatussa Checkout-näkymässä. Tilaus voidaan perua myöhemmin.</small></section></div>}
    </main>
  );
}
