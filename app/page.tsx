"use client";

import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  Focus,
  Globe2,
  Instagram,
  LockKeyhole,
  Mail,
  MonitorCheck,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  TimerReset,
  UsersRound,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  DEFAULT_BLOCKED_DOMAINS,
  DEFAULT_PROTECTED_APPS,
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
  type MockProtectedApp,
  type PersistedState,
  type ThemeMode,
} from "./focus-state";

const STORAGE_KEY = "lukko-web-mvp-state";
const EXTENSION_GUIDE_URL = "https://github.com/ossilahti/lukko-web/tree/main/extension";

const iconForApp = {
  mail: Mail,
  instagram: Instagram,
  youtube: Youtube,
} as const;

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
      selectedAppIds: Array.isArray(parsed.selectedAppIds)
        ? parsed.selectedAppIds.filter((id): id is MockProtectedApp["id"] =>
            DEFAULT_PROTECTED_APPS.some((app) => app.id === id),
          )
        : DEFAULT_STATE.selectedAppIds,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : DEFAULT_STATE.sessions,
      isRunning: Boolean(parsed.isRunning),
      endAt: typeof parsed.endAt === "number" ? parsed.endAt : null,
      pausedRemainingSeconds:
        typeof parsed.pausedRemainingSeconds === "number" ? parsed.pausedRemainingSeconds : null,
      activeDurationSeconds:
        typeof parsed.activeDurationSeconds === "number" ? parsed.activeDurationSeconds : null,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function LogoMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-loop" />
    </span>
  );
}

function AppIcon({ app }: { app: MockProtectedApp }) {
  const Icon = iconForApp[app.id];
  return (
    <span className={`app-icon app-icon-${app.id}`} aria-hidden="true">
      <Icon size={18} strokeWidth={2.1} />
    </span>
  );
}

function TimerRing({ progress, children }: { progress: number; children: ReactNode }) {
  return (
    <div
      className="timer-ring"
      style={{ background: `conic-gradient(var(--primary) ${Math.max(0, Math.min(1, progress)) * 360}deg, var(--line) 0)` }}
    >
      <div className="timer-ring-inner">{children}</div>
    </div>
  );
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
  const [proOpen, setProOpen] = useState(false);

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
        const currentTotalSeconds = getPresetMinutes(current.presetId, current.customMinutes) * 60;
        return current.isRunning && getSecondsRemaining(current, timestamp, currentTotalSeconds) <= 0
          ? completeFocusSession(current, timestamp)
          : current;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [state.isRunning]);

  useEffect(() => {
    if (!hydrated) return;
    if (state.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = state.theme;
    }
  }, [hydrated, state.theme]);

  useEffect(() => {
    const receiveExtensionStatus = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "lukko-extension") return;
      setExtensionConnected(Boolean(event.data.connected));
      setExtensionBlocking(Boolean(event.data.active));
    };

    const askExtensionStatus = () => {
      window.postMessage({ source: "lukko-web", type: "lukko-status" }, "*");
    };

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
    window.postMessage(
      {
        source: "lukko-web",
        type: "lukko-focus-state",
        payload: {
          active: state.isRunning && state.blockingEnabled,
          until: state.endAt,
          blockedDomains: state.blockedDomains,
        },
      },
      "*",
    );
  }, [hydrated, state.blockedDomains, state.blockingEnabled, state.endAt, state.isRunning]);

  const totalSeconds = getPresetMinutes(state.presetId, state.customMinutes) * 60;
  const remainingSeconds = getSecondsRemaining(state, now, totalSeconds);
  const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
  const todayKey = getDateKey(now);
  const todaySessions = useMemo(
    () => state.sessions.filter((session) => getDateKey(session.completedAt) === todayKey),
    [state.sessions, todayKey],
  );
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const selectedCount = state.selectedAppIds.length;
  const isPaused = !state.isRunning && state.pausedRemainingSeconds !== null;
  const themeOptions: ThemeMode[] = ["system", "light", "dark"];

  const updateState = (change: (current: PersistedState) => PersistedState) => {
    setState((current) => change(current));
  };

  const choosePreset = (presetId: PersistedState["presetId"]) => {
    if (state.isRunning) return;
    updateState((current) => resetFocusSession({ ...current, presetId }));
  };

  const changeCustomMinutes = (minutes: number) => {
    if (state.isRunning) return;
    updateState((current) => resetFocusSession({ ...current, customMinutes: clampCustomMinutes(minutes) }));
  };

  const toggleApp = (id: MockProtectedApp["id"]) => {
    if (state.isRunning) return;
    updateState((current) => ({
      ...current,
      selectedAppIds: current.selectedAppIds.includes(id)
        ? current.selectedAppIds.filter((selectedId) => selectedId !== id)
        : [...current.selectedAppIds, id],
    }));
  };

  const handleTimer = () => {
    if (state.isRunning) {
      updateState((current) => pauseFocusSession(current, Date.now()));
      return;
    }

    if (isPaused) {
      updateState((current) => resumeFocusSession(current, Date.now()));
      return;
    }

    updateState((current) => createRunningState(current, Date.now(), totalSeconds));
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

  const removeDomain = (domain: string) => {
    updateState((current) => ({
      ...current,
      blockedDomains: current.blockedDomains.filter((item) => item !== domain),
    }));
  };

  const cycleTheme = () => {
    const currentIndex = themeOptions.indexOf(state.theme);
    const nextTheme = themeOptions[(currentIndex + 1) % themeOptions.length];
    updateState((current) => ({ ...current, theme: nextTheme }));
  };

  const statusCopy = state.isRunning
    ? "Istunto on käynnissä"
    : isPaused
      ? "Hetki on tauolla"
      : "Valitse hetki, jolloin haluat keskittyä";

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <Link className="brand" href="/" aria-label="Lukko, etusivu">
          <LogoMark />
          <span>
            <strong>Lukko</strong>
            <small>rauha ruudun äärellä</small>
          </span>
        </Link>

        <div className="header-actions">
          <div className="theme-control" aria-label={`Teema: ${themeLabel(state.theme)}`}>
            <button className={state.theme === "system" ? "theme-option-active" : ""} type="button" onClick={() => updateState((current) => ({ ...current, theme: "system" }))} aria-label="Käytä järjestelmän teemaa">
              <CircleHelp size={13} />
            </button>
            <button className={state.theme === "light" ? "theme-option-active" : ""} type="button" onClick={() => updateState((current) => ({ ...current, theme: "light" }))} aria-label="Käytä vaaleaa teemaa">
              <Sun size={13} />
            </button>
            <button className={state.theme === "dark" ? "theme-option-active" : ""} type="button" onClick={() => updateState((current) => ({ ...current, theme: "dark" }))} aria-label="Käytä tummaa teemaa">
              <Moon size={13} />
            </button>
          </div>
          <button className="theme-label" type="button" onClick={cycleTheme} aria-label="Vaihda teemaa">
            {themeLabel(state.theme)}
          </button>
          <span className="local-badge">
            <span className="status-dot" aria-hidden="true" />
            Paikallinen
          </span>
        </div>
      </header>

      <section className="hero-grid" aria-label="Lukon keskittymisnäkymä">
        <div className="main-column">
          <div className="eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            Keskittymishetki
          </div>
          <h1>Yksi asia kerrallaan.</h1>
          <p className="intro-copy">
            Lukko tekee keskittymisestä helppoa: yksi ajastin, yksi rauhallinen tila ja vähemmän asioita, jotka yrittävät viedä huomiosi.
          </p>
          <div className="trust-row" aria-label="Lukon periaatteet">
            <span><ShieldCheck size={14} /> Paikallinen data</span>
            <span><Zap size={14} /> Ei mainoksia</span>
            <span><Focus size={14} /> Suunniteltu ihmisille</span>
          </div>

          <section className="timer-card" aria-labelledby="timer-heading">
            <div className="card-heading-row">
              <div>
                <p className="card-kicker">Focus timer</p>
                <h2 id="timer-heading">{statusCopy}</h2>
              </div>
              <span className={`session-state ${state.isRunning ? "session-state-active" : ""}`}>
                {state.isRunning ? "Käynnissä" : isPaused ? "Tauko" : "Valmis"}
              </span>
            </div>

            <div className="timer-area">
              <TimerRing progress={progress}>
                <span className="timer-label">jäljellä</span>
                <strong className="timer-value" aria-live="polite">{formatClock(remainingSeconds)}</strong>
                <span className="timer-caption">
                  {state.presetId === "custom" ? "Oma aika" : PRESETS.find((preset) => preset.id === state.presetId)?.label}
                </span>
              </TimerRing>
            </div>

            <div className="timer-actions">
              <button className="primary-button" type="button" onClick={handleTimer}>
                {state.isRunning ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                {state.isRunning ? "Tauota" : isPaused ? "Jatka" : "Aloita istunto"}
              </button>
              <button className="icon-button" type="button" onClick={() => updateState((current) => resetFocusSession(current))} aria-label="Nollaa ajastin" title="Nollaa ajastin">
                <RotateCcw size={17} />
              </button>
            </div>

            <div className="preset-section">
              <div className="section-label-row">
                <span>Valitse aika</span>
                <span className="muted-label">{state.isRunning ? "Lukittu istunnon ajaksi" : ""}</span>
              </div>
              <div className="preset-grid">
                {PRESETS.map((preset) => {
                  const active = state.presetId === preset.id;
                  return (
                    <button className={`preset-button ${active ? "preset-button-active" : ""}`} type="button" key={preset.id} onClick={() => choosePreset(preset.id)} disabled={state.isRunning}>
                      <span>{preset.label}</span>
                      <small>{preset.minutes ? `${preset.minutes} min` : "Säädä"}</small>
                    </button>
                  );
                })}
              </div>

              {state.presetId === "custom" && (
                <label className="range-control">
                  <span>Oma aika <strong>{state.customMinutes} min</strong></span>
                  <input type="range" min={MIN_CUSTOM_MINUTES} max={MAX_CUSTOM_MINUTES} step="5" value={state.customMinutes} onChange={(event) => changeCustomMinutes(Number(event.target.value))} disabled={state.isRunning} />
                </label>
              )}
            </div>
          </section>

          <div className="audience-card">
            <div className="audience-heading">
              <p className="card-kicker">Lukko sopii sinun päivääsi</p>
              <h2>Opiskeluun, työhön ja kotiin.</h2>
            </div>
            <div className="audience-list">
              <span><GraduationIcon /><strong>Opiskelu</strong><small>Lue, kirjoita, opi</small></span>
              <span><BriefcaseBusiness size={17} /><strong>Työ</strong><small>Suojaa tärkeä tunti</small></span>
              <span><UsersRound size={17} /><strong>Perhe</strong><small>Läsnä ilman hälyä</small></span>
            </div>
          </div>
        </div>

        <aside className="side-column">
          <section className="soft-card blocker-card" aria-labelledby="blocker-heading">
            <div className="card-heading-row">
              <div className="heading-with-icon">
                <span className="feature-icon feature-icon-dark"><Globe2 size={18} /></span>
                <div>
                  <p className="card-kicker">Website blocking</p>
                  <h2 id="blocker-heading">Sivustot pois tieltä</h2>
                </div>
              </div>
              <span className={`connection-pill ${extensionConnected ? "connection-pill-live" : ""}`}>
                <span className="connection-dot" />
                {extensionConnected ? "Yhdistetty" : "Asennus tarvitaan"}
              </span>
            </div>
            <p className="card-copy">Kun Lukko-laajennus on asennettu, nämä verkkotunnukset estetään oikeasti selaimessa aktiivisen istunnon ajan.</p>

            <div className="blocker-status-row">
              <div className="status-icon"><MonitorCheck size={17} /></div>
              <div>
                <strong>{extensionBlocking ? "Suojaus on päällä" : "Estä istunnon aikana"}</strong>
                <small>{extensionConnected ? "Lukko ohjaa selaimen sääntöjä." : "Selaimen lisäosa tekee eston."}</small>
              </div>
              <button className={`toggle ${state.blockingEnabled ? "toggle-on" : ""}`} type="button" role="switch" aria-checked={state.blockingEnabled} onClick={() => updateState((current) => ({ ...current, blockingEnabled: !current.blockingEnabled }))}>
                <span />
              </button>
            </div>

            <div className="domain-list" aria-label="Estettävät verkkotunnukset">
              {state.blockedDomains.map((domain) => (
                <span className="domain-chip" key={domain}>
                  <Globe2 size={12} />
                  {domain}
                  <button type="button" onClick={() => removeDomain(domain)} aria-label={`Poista ${domain}`}><X size={12} /></button>
                </span>
              ))}
            </div>

            <form className="domain-form" onSubmit={addDomain}>
              <input value={domainInput} onChange={(event) => { setDomainInput(event.target.value); setDomainError(""); }} placeholder="Lisää verkkotunnus" aria-label="Lisää estettävä verkkotunnus" />
              <button className="icon-button small-icon-button" type="submit" aria-label="Lisää verkkotunnus"><Plus size={15} /></button>
            </form>
            {domainError && <p className="form-error" role="alert">{domainError}</p>}
            <a className="text-link" href={EXTENSION_GUIDE_URL} target="_blank" rel="noreferrer">
              Asennusohjeet Chromiumille <ChevronRight size={14} />
            </a>
          </section>

          <section className="soft-card protection-card" aria-labelledby="protection-heading">
            <div className="card-heading-row">
              <div className="heading-with-icon">
                <span className="feature-icon"><ShieldCheck size={18} /></span>
                <div>
                  <p className="card-kicker">Laitekokemus</p>
                  <h2 id="protection-heading">Suojatut sovellukset</h2>
                </div>
              </div>
              <span className="count-pill">{selectedCount}/3</span>
            </div>
            <p className="card-copy">Valitse sovellukset, jotka haluat pitää poissa näkyvistä. Oikea iOS-tason esto kuuluu Lukon natiivisovellukseen.</p>

            <div className="app-list">
              {DEFAULT_PROTECTED_APPS.map((app) => {
                const selected = state.selectedAppIds.includes(app.id);
                return (
                  <button className={`app-row ${selected ? "app-row-selected" : ""}`} type="button" key={app.id} onClick={() => toggleApp(app.id)} disabled={state.isRunning} aria-pressed={selected}>
                    <AppIcon app={app} />
                    <span className="app-row-copy"><strong>{app.name}</strong><small>{app.description}</small></span>
                    <span className={`check-control ${selected ? "check-control-selected" : ""}`} aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
            <div className="notice-box"><LockKeyhole size={15} aria-hidden="true" /><span>Verkkosivu ei voi yksin estää iPhone-sovelluksia. Selainlaajennus hoitaa verkkotason eston.</span></div>
          </section>

          <section className="stats-card" aria-label="Tämän päivän yhteenveto">
            <div className="stats-icon"><Clock3 size={19} /></div>
            <div className="stats-copy"><span>Tänään keskitytty</span><strong>{todayMinutes} min</strong></div>
            <div className="stats-divider" />
            <div className="stats-copy stats-copy-right"><span>Istuntoja</span><strong>{todaySessions.length}</strong></div>
          </section>

          <section className="soft-card history-card" aria-labelledby="history-heading">
            <div className="card-heading-row">
              <div className="heading-with-icon"><span className="feature-icon feature-icon-soft"><TimerReset size={18} /></span><div><p className="card-kicker">Pienet askeleet</p><h2 id="history-heading">Viimeisimmät istunnot</h2></div></div>
            </div>
            {todaySessions.length === 0 ? (
              <div className="empty-history"><Coffee size={18} aria-hidden="true" /><p>Ensimmäinen istunto odottaa sinua.</p></div>
            ) : (
              <div className="history-list">
                {todaySessions.slice().reverse().slice(0, 4).map((session) => (
                  <div className="history-row" key={session.id}><span className="history-check"><Check size={13} strokeWidth={3} /></span><span>{new Date(session.completedAt).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}</span><strong>{session.durationMinutes} min</strong></div>
                ))}
              </div>
            )}
          </section>

          <section className="pro-card" aria-labelledby="pro-heading">
            <div className="pro-topline"><span className="pro-mark"><Zap size={14} fill="currentColor" /></span><span>Lukko Pro</span><span className="pro-coming">Suunnitteilla</span></div>
            <h2 id="pro-heading">Rauha, joka kulkee mukana.</h2>
            <p>Laajempi verkkosuojaus, perheprofiilit ja sama kokemus tulevaan iOS-sovellukseen.</p>
            <div className="pro-bottomline"><strong>4,99 €<small>/ kk</small></strong><button className="pro-button" type="button" onClick={() => setProOpen(true)}>Katso Pro <ChevronRight size={15} /></button></div>
            <small className="pro-note">Maksu voidaan kytkeä turvallisesti Stripe-hosted Checkoutiin.</small>
          </section>

          <div className="side-note"><Focus size={16} aria-hidden="true" /><span>Hyvä keskittyminen ei vaadi täydellistä päivää. Yksi rauhallinen hetki riittää.</span><ChevronRight size={15} aria-hidden="true" /></div>
        </aside>
      </section>

      <footer className="site-footer"><span>© {new Date().getFullYear()} Lukko</span><span>Sama rauha selaimessa ja myöhemmin iOS:llä.</span></footer>

      {proOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="pro-modal-heading">
            <button className="modal-close" type="button" onClick={() => setProOpen(false)} aria-label="Sulje"><X size={18} /></button>
            <span className="pro-mark pro-mark-large"><Zap size={17} fill="currentColor" /></span>
            <p className="card-kicker">Lukko Pro</p>
            <h2 id="pro-modal-heading">Keskittyminen ilman kompromisseja.</h2>
            <p className="modal-copy">Pro-versio yhdistää tehokkaan selaineston, perheen yhteiset profiilit ja tulevan iOS-sovelluksen.</p>
            <div className="modal-feature-list"><span><Check size={15} /> Säännöt, jotka oikeasti estävät sivut</span><span><Check size={15} /> Perhe- ja työprofiilit</span><span><Check size={15} /> Apple-tyylinen iOS-kokemus</span></div>
            <div className="modal-price"><strong>4,99 €<small>/ kk</small></strong><span>Peruuta milloin vain</span></div>
            <button className="primary-button modal-cta" type="button" disabled>Stripe Checkout valmistellaan</button>
            <p className="modal-note">Tämä MVP ei vielä pyydä maksutietoja. Kun Stripe yhdistetään, korttitiedot käsitellään Stripe-hosted Checkoutissa eikä Lukko tallenna niitä.</p>
          </section>
        </div>
      )}
    </main>
  );
}

function GraduationIcon() {
  return <BookOpen size={17} />;
}
