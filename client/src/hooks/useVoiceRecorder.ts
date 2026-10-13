import { useCallback, useEffect, useRef, useState } from 'react';

/** The server refuses anything longer; recording stops itself here. */
export const VOICE_MAX_SECONDS = 120;

export interface VoiceClip {
  blob: Blob;
  url: string;
  durationSec: number;
}

type RecorderState = 'idle' | 'recording' | 'recorded';

// Chrome and Firefox record Opus in WebM; Safari only records AAC in MP4.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const pickMime = () =>
  typeof MediaRecorder === 'undefined'
    ? undefined
    : MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));

/**
 * Records one voice note from the microphone.
 *
 * The length is measured here, from the clock, because WebM files written by
 * MediaRecorder carry no duration and a player would show "Infinity" for them.
 */
export const useVoiceRecorder = () => {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [error, setError] = useState<'unsupported' | 'denied' | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((track) => track.stop());

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    window.clearInterval(timer.current);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('unsupported');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('denied');
      return;
    }
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stopTracks();
      if (cancelled.current) return;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      const blob = new Blob(chunks, { type: (rec.mimeType || mimeType || 'audio/webm').split(';')[0] });
      setClip({ blob, url: URL.createObjectURL(blob), durationSec: Math.min(durationSec, VOICE_MAX_SECONDS) });
      setState('recorded');
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start();
    setState('recording');
    timer.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(secs);
      if (secs >= VOICE_MAX_SECONDS) stop();
    }, 250);
  }, [stop]);

  /** Throws away the recording in progress or the finished clip. */
  const discard = useCallback(() => {
    cancelled.current = true;
    stop();
    stopTracks();
    setClip((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setElapsed(0);
    setState('idle');
  }, [stop]);

  useEffect(
    () => () => {
      cancelled.current = true;
      window.clearInterval(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
    },
    [],
  );

  return { state, elapsed, clip, error, start, stop, discard };
};

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;

/** The file name the server keys the extension from. */
export const clipFile = (clip: VoiceClip) => {
  const ext = clip.blob.type.includes('mp4') ? 'm4a' : clip.blob.type.includes('ogg') ? 'ogg' : 'webm';
  return new File([clip.blob], `voice-note.${ext}`, { type: clip.blob.type });
};
