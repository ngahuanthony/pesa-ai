let audioContext: AudioContext | null = null;
let enabledForSession = false;

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
  return enabledForSession && audioContext?.state === "running";
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
  playTonePair(audioContext);
}

export function disableOrderAlertSound() {
  enabledForSession = false;
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
