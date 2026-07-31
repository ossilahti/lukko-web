"use client";

import {
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Focus,
  Instagram,
  LockKeyhole,
  Mail,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
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
  pauseFocusSession,
  resetFocusSession,
  resumeFocusSession,
  type MockProtectedApp,
  type PersistedState,
} from "./focus-state";

const STORAGE_KEY = "lukko-web-mvp-state";

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
    return {
      ...DEFAULT_STATE,
      ...parsed,
      customMinutes: clampCustomMinutes(Number(parsed.customMinutes ?? DEFAULT_STATE.customMinutes)),
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

function AppIcon({ app, selected }: { app: MockProtectedApp; selected: boolean }) {
  const Icon = iconForApp[app.id];
  return (
    <span className={`app-icon app-icon-${app.id} ${selected ? "app-icon-selected" : ""}`} aria-hidden="true">
      <Icon size={19} strokeWidth={2.1} />
    </span>
  );
}

function TimerRing({ progress, children }: { progress: number; children: React.ReactNode }) {
  return (
    <div
      className="timer-ring"
      style={{ background: `conic-gradient(var(--primary) ${Math.max(0, Math.min(1, progress)) * 360}deg, var(--line) 0)` }}
    >
      <div className="timer-ring-inner">{children}</div>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  const updateState = (change: (current: PersistedState) => PersistedState) => {
    setState((current) => change(current));
  };

  const choosePreset = (presetId: PersistedState["presetId"]) => {
    if (state.isRunning) return;
    updateState((current) => resetFocusSession({ ...current, presetId }));
  };

  const changeCustomMinutes = (minutes: number) => {
    if (state.isRunning) return;
    const customMinutes = clampCustomMinutes(minutes);
    updateState((current) => resetFocusSession({ ...current, customMinutes }));
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

  const statusCopy = state.isRunning
    ? "Sovellukset ovat harjoitustilassa suojattuina"
    : isPaused
      ? "Istunto on tauolla"
      : "Valitse hetki, jolloin haluat keskittyä";

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Lukko, etusivu">
          <span className="brand-mark">
            <LockKeyhole size={18} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Lukko</strong>
            <small>rauha ruudun äärellä</small>
          </span>
        </Link>
        <div className="local-badge">
          <span className="status-dot" aria-hidden="true" />
          Paikallinen demo
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Lukon keskittymisnäkymä">
        <div className="main-column">
          <div className="eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            Keskittymishetki
          </div>
          <h1>Varaa tilaa tärkeälle.</h1>
          <p className="intro-copy">
            Lukko auttaa sulkemaan häiriöt ulkopuolelle. Valitse aika, aloita istunto ja anna ajatusten asettua.
          </p>

          <section className="timer-card" aria-labelledby="timer-heading">
            <div className="card-heading-row">
              <div>
                <p className="card-kicker">Tämän hetken tila</p>
                <h2 id="timer-heading">{statusCopy}</h2>
              </div>
              <span className={`session-state ${state.isRunning ? "session-state-active" : ""}`}>
                {state.isRunning ? "Käynnissä" : isPaused ? "Tauko" : "Valmis"}
              </span>
            </div>

            <div className="timer-area">
              <TimerRing progress={progress}>
                <span className="timer-label">jäljellä</span>
                <strong className="timer-value" aria-live="polite">
                  {formatClock(remainingSeconds)}
                </strong>
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
              <button
                className="icon-button"
                type="button"
                onClick={() => updateState((current) => resetFocusSession(current))}
                aria-label="Nollaa ajastin"
                title="Nollaa ajastin"
              >
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
                    <button
                      className={`preset-button ${active ? "preset-button-active" : ""}`}
                      type="button"
                      key={preset.id}
                      onClick={() => choosePreset(preset.id)}
                      disabled={state.isRunning}
                    >
                      <span>{preset.label}</span>
                      <small>{preset.minutes ? `${preset.minutes} min` : "Säädä"}</small>
                    </button>
                  );
                })}
              </div>

              {state.presetId === "custom" && (
                <label className="range-control">
                  <span>
                    Oma aika <strong>{state.customMinutes} min</strong>
                  </span>
                  <input
                    type="range"
                    min={MIN_CUSTOM_MINUTES}
                    max={MAX_CUSTOM_MINUTES}
                    step="5"
                    value={state.customMinutes}
                    onChange={(event) => changeCustomMinutes(Number(event.target.value))}
                    disabled={state.isRunning}
                  />
                </label>
              )}
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="soft-card protection-card" aria-labelledby="protection-heading">
            <div className="card-heading-row">
              <div className="heading-with-icon">
                <span className="feature-icon">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <p className="card-kicker">Keskittymisrauha</p>
                  <h2 id="protection-heading">Suojatut sovellukset</h2>
                </div>
              </div>
              <span className="count-pill">{selectedCount}/3</span>
            </div>

            <p className="card-copy">
              Valitse ne sovellukset, jotka haluat pitää poissa näkyvistä keskittymisen aikana.
            </p>

            <div className="app-list">
              {DEFAULT_PROTECTED_APPS.map((app) => {
                const selected = state.selectedAppIds.includes(app.id);
                return (
                  <button
                    className={`app-row ${selected ? "app-row-selected" : ""}`}
                    type="button"
                    key={app.id}
                    onClick={() => toggleApp(app.id)}
                    disabled={state.isRunning}
                    aria-pressed={selected}
                  >
                    <AppIcon app={app} selected={selected} />
                    <span className="app-row-copy">
                      <strong>{app.name}</strong>
                      <small>{app.description}</small>
                    </span>
                    <span className={`check-control ${selected ? "check-control-selected" : ""}`} aria-hidden="true">
                      {selected && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="notice-box">
              <LockKeyhole size={15} aria-hidden="true" />
              <span>Tämä on verkkodemo. Se ei estä oikeita sovelluksia tai verkkosivuja.</span>
            </div>
          </section>

          <section className="stats-card" aria-label="Tämän päivän yhteenveto">
            <div className="stats-icon">
              <Clock3 size={19} />
            </div>
            <div className="stats-copy">
              <span>Tänään keskitytty</span>
              <strong>{todayMinutes} min</strong>
            </div>
            <div className="stats-divider" />
            <div className="stats-copy stats-copy-right">
              <span>Istuntoja</span>
              <strong>{todaySessions.length}</strong>
            </div>
          </section>

          <section className="soft-card history-card" aria-labelledby="history-heading">
            <div className="card-heading-row">
              <div className="heading-with-icon">
                <span className="feature-icon feature-icon-warm">
                  <TimerReset size={18} />
                </span>
                <div>
                  <p className="card-kicker">Pienet askeleet</p>
                  <h2 id="history-heading">Viimeisimmät istunnot</h2>
                </div>
              </div>
            </div>
            {todaySessions.length === 0 ? (
              <div className="empty-history">
                <Coffee size={18} aria-hidden="true" />
                <p>Ensimmäinen istunto odottaa sinua.</p>
              </div>
            ) : (
              <div className="history-list">
                {todaySessions
                  .slice()
                  .reverse()
                  .slice(0, 4)
                  .map((session) => (
                    <div className="history-row" key={session.id}>
                      <span className="history-check">
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span>{new Date(session.completedAt).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}</span>
                      <strong>{session.durationMinutes} min</strong>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <div className="side-note">
            <Focus size={16} aria-hidden="true" />
            <span>Hyvä keskittyminen ei vaadi täydellistä päivää. Yksi rauhallinen hetki riittää.</span>
            <ChevronRight size={15} aria-hidden="true" />
          </div>
        </aside>
      </section>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Lukko</span>
        <span>Suunniteltu rauhallisempiin päiviin.</span>
      </footer>
    </main>
  );
}
