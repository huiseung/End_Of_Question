'use client';
import { useEffect, useRef } from 'react';
import type { Verdict } from '@eoq/shared';
export const QUESTION_SOUNDS: Record<Verdict, string | undefined> = {
  TRUE: 'yes_voice.mp3', FALSE: 'no_voice.mp3', MIXED: 'maybe_voice.mp3',
  UNKNOWN: 'notimport_voice.mp3', INVALID: undefined,
};
const FILES = ['yes_voice.mp3', 'no_voice.mp3', 'maybe_voice.mp3', 'notimport_voice.mp3', 'correct_voice.mp3', 'incorrect_voice.mp3'];
export function useVerdictAudio() {
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const source = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => () => {
    source.current?.stop();
    source.current = null;
    const current = context.current;
    context.current = null;
    buffers.current.clear();
    if (current) void current.close().catch(() => {});
  }, []);
  // Resume inside the submit gesture, before the asynchronous API response.
  function prepareAudio() {
    try {
      const current = context.current ?? new AudioContext();
      context.current = current;
      void current.resume().catch(() => {});
      source.current?.stop();
      source.current = null;
      for (const file of FILES) {
        if (!buffers.current.has(file)) buffers.current.set(file,
          fetch('/audio/' + file).then(response => {
            if (!response.ok) throw new Error('Audio unavailable');
            return response.arrayBuffer();
          }).then(data => current.decodeAudioData(data)).catch(() => {
            buffers.current.delete(file);
            return null;
          }));
      }
    } catch { /* Audio is optional; judging still works without browser audio support. */ }
  }
  async function playAudio(file?: string) {
    const fallbackDuration = 3200;
    if (!file) return fallbackDuration;
    try {
      const buffer = await buffers.current.get(file);
      const current = context.current;
      if (!buffer || !current || current.state !== 'running') return fallbackDuration;
      source.current?.stop();
      const node = current.createBufferSource();
      node.buffer = buffer;
      node.connect(current.destination);
      source.current = node;
      node.onended = () => { node.disconnect(); if (source.current === node) source.current = null; };
      node.start();
      return Math.max(fallbackDuration, buffer.duration * 1000 + 600);
    } catch { return fallbackDuration; }
  }
  return { prepareAudio, playAudio };
}
