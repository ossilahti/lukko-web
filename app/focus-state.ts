export type PresetId = "pomodoro" | "reading" | "deepWork" | "custom";

export type FocusPreset = {
  id: PresetId;
  label: string;
  minutes: number;
};

export const PRESETS: FocusPreset[] = [
  { id: "pomodoro", label: "Pomodoro", minutes: 25 },
  { id: "reading", label: "Lukeminen", minutes: 45 },
  { id: "deepWork", label: "Syvä työ", minutes: 90 },
  { id: "custom", label: "Oma aika", minutes: 0 },
];

export const MIN_CUSTOM_MINUTES = 5;
export const MAX_CUSTOM_MINUTES = 240;

export type FocusSession = {
  id: string;
  startedAt: number;
  completedAt: number;
  durationMinutes: number;
};

export type MockProtectedApp = {
  id: "mail" | "instagram" | "youtube";
  name: string;
  description: string;
};

export const DEFAULT_PROTECTED_APPS: MockProtectedApp[] = [
  { id: "mail", name: "Mail", description: "Viestit ja ilmoitukset" },
  { id: "instagram", name: "Instagram", description: "Syöte ja tarinat" },
  { id: "youtube", name: "YouTube", description: "Videot ja suositukset" },
];

export type PersistedState = {
  presetId: PresetId;
  customMinutes: number;
  selectedAppIds: MockProtectedApp["id"][];
  sessions: FocusSession[];
  isRunning: boolean;
  endAt: number | null;
  pausedRemainingSeconds: number | null;
  activeDurationSeconds: number | null;
  startedAt: number | null;
};

export const DEFAULT_STATE: PersistedState = {
  presetId: "pomodoro",
  customMinutes: 30,
  selectedAppIds: ["mail", "instagram"],
  sessions: [],
  isRunning: false,
  endAt: null,
  pausedRemainingSeconds: null,
  activeDurationSeconds: null,
  startedAt: null,
};

export function clampCustomMinutes(value: number) {
  if (!Number.isFinite(value)) return MIN_CUSTOM_MINUTES;
  return Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, Math.round(value / 5) * 5));
}

export function getPresetMinutes(presetId: PresetId, customMinutes: number) {
  if (presetId === "custom") return clampCustomMinutes(customMinutes);
  return PRESETS.find((preset) => preset.id === presetId)?.minutes ?? PRESETS[0].minutes;
}

export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getSecondsRemaining(state: PersistedState, now: number, defaultTotalSeconds: number) {
  if (state.isRunning && state.endAt !== null) return Math.max(0, Math.ceil((state.endAt - now) / 1000));
  if (state.pausedRemainingSeconds !== null) return Math.max(0, Math.ceil(state.pausedRemainingSeconds));
  return state.activeDurationSeconds ?? defaultTotalSeconds;
}

export function createRunningState(state: PersistedState, now: number, totalSeconds: number): PersistedState {
  return {
    ...state,
    isRunning: true,
    endAt: now + totalSeconds * 1000,
    pausedRemainingSeconds: null,
    activeDurationSeconds: totalSeconds,
    startedAt: now,
  };
}

export function pauseFocusSession(state: PersistedState, now: number): PersistedState {
  if (!state.isRunning || state.endAt === null) return state;
  return {
    ...state,
    isRunning: false,
    endAt: null,
    pausedRemainingSeconds: Math.max(0, Math.ceil((state.endAt - now) / 1000)),
  };
}

export function resumeFocusSession(state: PersistedState, now: number): PersistedState {
  if (state.pausedRemainingSeconds === null || state.pausedRemainingSeconds <= 0) return state;
  return {
    ...state,
    isRunning: true,
    endAt: now + state.pausedRemainingSeconds * 1000,
    pausedRemainingSeconds: null,
    startedAt: state.startedAt ?? now,
  };
}

export function resetFocusSession(state: PersistedState): PersistedState {
  return {
    ...state,
    isRunning: false,
    endAt: null,
    pausedRemainingSeconds: null,
    activeDurationSeconds: null,
    startedAt: null,
  };
}

export function completeFocusSession(state: PersistedState, now: number): PersistedState {
  if (!state.isRunning || state.startedAt === null) return state;
  const durationSeconds = state.activeDurationSeconds ?? 0;
  const session: FocusSession = {
    id: `session-${now}`,
    startedAt: state.startedAt,
    completedAt: now,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
  };
  return {
    ...state,
    sessions: [...state.sessions, session].slice(-90),
    isRunning: false,
    endAt: null,
    pausedRemainingSeconds: null,
    activeDurationSeconds: null,
    startedAt: null,
  };
}

export function getDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
