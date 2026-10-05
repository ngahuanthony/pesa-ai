let audioContext: AudioContext | null = null;
const SOUND_PREFERENCE_KEY = "pesa-si-order-alert-sound";

function readSoundPreference() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

let enabledForSession = readSoundPreference();

function persistSoundPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Keep the preference for this session when browser storage is unavailable.
  }
}

function playTonePair(context: AudioContext) {
  const playTone = (frequency: number, startAt: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.13);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.14);
  };

  const now = context.currentTime;
  playTone(880, now);
  playTone(1175, now + 0.17);
}

export function isOrderAlertSoundEnabled() {
  return enabledForSession;
}

export async function activateOrderAlertSound() {
  if (!enabledForSession || typeof window === "undefined" || !window.AudioContext) return;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new window.AudioContext();
  }
  if (audioContext.state !== "running") await audioContext.resume();
}

export async function enableOrderAlertSound() {
  if (typeof window === "undefined" || !window.AudioContext) {
    throw new Error("This browser does not support sound alerts.");
  }

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new window.AudioContext();
  }
  await audioContext.resume();
  enabledForSession = true;
  persistSoundPreference(true);
  playTonePair(audioContext);
}

export function disableOrderAlertSound() {
  enabledForSession = false;
  persistSoundPreference(false);
  if (audioContext?.state === "running") void audioContext.suspend();
}

export function playOrderAlertBeep() {
  if (!enabledForSession || !audioContext) return;
  if (audioContext.state === "running") {
    playTonePair(audioContext);
    return;
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume().then(() => {
      if (enabledForSession && audioContext?.state === "running") playTonePair(audioContext);
    }).catch(() => undefined);
  }
}
