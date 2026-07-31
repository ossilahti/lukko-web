import assert from "node:assert/strict";
import test from "node:test";

const stateUrl = new URL("../app/focus-state.ts", import.meta.url);
const {
  DEFAULT_STATE,
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  clampCustomMinutes,
  completeFocusSession,
  createRunningState,
  getPresetMinutes,
  getSecondsRemaining,
  normalizeDomain,
  pauseFocusSession,
  resetFocusSession,
  resumeFocusSession,
} = await import(stateUrl.href);

test("preset and custom durations stay within the MVP limits", () => {
  assert.equal(getPresetMinutes("pomodoro", 30), 25);
  assert.equal(getPresetMinutes("reading", 30), 45);
  assert.equal(getPresetMinutes("deepWork", 30), 90);
  assert.equal(getPresetMinutes("custom", 1), MIN_CUSTOM_MINUTES);
  assert.equal(clampCustomMinutes(999), MAX_CUSTOM_MINUTES);
  assert.equal(clampCustomMinutes(32), 30);
});

test("timestamp timer starts, pauses, resumes, and resets accurately", () => {
  const started = createRunningState(DEFAULT_STATE, 1_000, 1_500);
  assert.equal(started.endAt, 1_501_000);
  assert.equal(getSecondsRemaining(started, 1_001_000, 1_500), 500);

  const paused = pauseFocusSession(started, 601_000);
  assert.equal(paused.isRunning, false);
  assert.equal(paused.pausedRemainingSeconds, 900);

  const resumed = resumeFocusSession(paused, 700_000);
  assert.equal(resumed.isRunning, true);
  assert.equal(resumed.endAt, 1_600_000);
  assert.equal(getSecondsRemaining(resumed, 1_150_000, 1_500), 450);

  const reset = resetFocusSession(resumed);
  assert.equal(reset.isRunning, false);
  assert.equal(reset.pausedRemainingSeconds, null);
  assert.equal(reset.activeDurationSeconds, null);
});

test("completion creates a local history entry and clears the active timer", () => {
  const started = createRunningState(DEFAULT_STATE, 10_000, 1_500);
  const completed = completeFocusSession(started, 1_510_000);

  assert.equal(completed.isRunning, false);
  assert.equal(completed.sessions.length, 1);
  assert.equal(completed.sessions[0].startedAt, 10_000);
  assert.equal(completed.sessions[0].completedAt, 1_510_000);
  assert.equal(completed.sessions[0].durationMinutes, 25);
});

test("blocker domain input is normalized and rejects unsafe values", () => {
  assert.equal(normalizeDomain("https://www.TikTok.com/feed"), "tiktok.com");
  assert.equal(normalizeDomain("reddit.com"), "reddit.com");
  assert.equal(normalizeDomain("javascript:alert(1)"), null);
  assert.equal(normalizeDomain("not a domain"), null);
});
