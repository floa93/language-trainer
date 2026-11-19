// @ts-check
// Read Vietnamese aloud with the browser's built-in speech synthesis (Web Speech API).
// Speaker buttons are hidden by CSS until a Vietnamese voice is found
// (<html class="has-vi-voice">), so devices without one never see a broken button.
//
// Android / Chrome quirks handled here:
// - speak() right after cancel() is often silently dropped, so we only cancel when
//   something is playing and queue the new utterance a tick later.
// - Samsung's TTS engine may list a Vietnamese voice whose data isn't usable; speaking
//   with that voice object fails. On error we retry with only `lang` set, letting the
//   engine choose its own Vietnamese voice.
// - Chrome can garbage-collect an utterance mid-speech, so the current one is kept.

import { esc } from './util.js';

export const NORMAL = 0.85;
export const SLOW = 0.55;

/** @type {SpeechSynthesisVoice | null} */
let voice = null;
/** @type {SpeechSynthesisUtterance | null} */
let current = null;
/** Set once the explicit voice has failed; from then on only `lang` is used. */
let useLangOnly = false;
/** Last error code from the speech engine (shown in Settings for troubleshooting). */
let lastError = '';

export function initSpeech() {
  if (!('speechSynthesis' in window)) return;
  const pick = () => {
    const vi = speechSynthesis.getVoices().filter((v) => /^vi([-_]|$)/i.test(v.lang));
    // Prefer an on-device vi-VN voice, then any vi-VN, then any Vietnamese voice.
    voice =
      vi.find((v) => /^vi[-_]VN$/i.test(v.lang) && v.localService) ||
      vi.find((v) => /^vi[-_]VN$/i.test(v.lang)) ||
      vi[0] ||
      null;
    document.documentElement.classList.toggle('has-vi-voice', !!voice);
  };
  pick();
  speechSynthesis.addEventListener?.('voiceschanged', pick);
  // Some browsers (notably Safari) fill the voice list late without firing the event.
  setTimeout(pick, 300);
  setTimeout(pick, 1500);

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-speak]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    speak(btn.getAttribute('data-speak') || '', undefined, btn.hasAttribute('data-slow') ? SLOW : NORMAL);
  });
}

/**
 * @param {string} text
 * @param {(error: string) => void} [onDone] called with '' on success or an error code
 * @param {number} [rate] speaking rate (NORMAL or SLOW)
 */
export function speak(text, onDone, rate = NORMAL) {
  if (!('speechSynthesis' in window) || !text) return;
  const synth = speechSynthesis;
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  // Chrome can get stuck in a paused state (e.g. after the tab was in the background).
  if (synth.paused) synth.resume();
  setTimeout(() => say(text, !useLangOnly, onDone, rate), busy ? 100 : 0);
}

/**
 * @param {string} text
 * @param {boolean} withVoice
 * @param {(error: string) => void} [onDone]
 * @param {number} rate
 */
function say(text, withVoice, onDone, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang.replace('_', '-') || 'vi-VN';
  if (withVoice && voice) u.voice = voice;
  u.rate = rate;
  u.onend = () => {
    lastError = '';
    onDone?.('');
  };
  u.onerror = (e) => {
    // Interruptions are caused by our own cancel() and are not failures.
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    if (withVoice) {
      useLangOnly = true;
      say(text, false, onDone, rate);
      return;
    }
    lastError = e.error || 'unknown';
    onDone?.(lastError);
  };
  current = u;
  speechSynthesis.speak(u);
}

/** Details about the selected voice, for the Settings page. */
export function voiceInfo() {
  return voice ? { name: voice.name, lang: voice.lang, lastError, langOnly: useLangOnly } : null;
}

/** True once a Vietnamese voice has been found. */
export function hasVoice() {
  return !!voice;
}

/** HTML for a speaker button that reads `text` aloud (`slow`: turtle button at a lower rate). */
export function speakButton(text, label = 'Listen', slow = false) {
  return `<button type="button" class="speak${slow ? ' speak-slow' : ''}" data-speak="${esc(text)}"${slow ? ' data-slow' : ''} aria-label="${esc(label)}" title="${esc(label)}"><span aria-hidden="true">${slow ? '🐢' : '🔊'}</span></button>`;
}
