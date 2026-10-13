import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretRightFilled, PauseOutlined } from '@ant-design/icons';
import { formatClock } from '../../utils/formatClock';


interface VoiceNotePlayerProps {
  src: string;
  /** The length the sender's device measured; recorded WebM files do not carry one. */
  durationSec?: number | null;
  /** `inverse` for a dark chat bubble. */
  tone?: 'default' | 'inverse';
  width?: number | string;
}

/** A play button, a progress track and the time: the shape every messaging app uses. */
const VoiceNotePlayer = ({ src, durationSec, tone = 'default', width = 220 }: VoiceNotePlayerProps) => {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSec ?? 0);

  useEffect(() => setLength(durationSec ?? 0), [durationSec]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !length) return;
    const box = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - box.left) / box.width) * length;
  };

  const inverse = tone === 'inverse';
  const ink = inverse ? '#fff' : 'var(--ant-color-text)';
  const track = inverse ? 'rgba(255,255,255,0.28)' : 'var(--ant-color-fill-secondary)';
  const progress = length ? Math.min(1, position / length) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width, maxWidth: '100%' }}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (!durationSec && Number.isFinite(d)) setLength(d);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('voice.pause') : t('voice.play')}
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          background: inverse ? '#fff' : 'var(--isoko-navy)',
          color: inverse ? '#18181b' : 'var(--ant-color-bg-container)',
          fontSize: 14,
        }}
      >
        {playing ? <PauseOutlined /> : <CaretRightFilled style={{ marginLeft: 2 }} />}
      </button>
      <div
        role="slider"
        aria-label={t('voice.position')}
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(position)}
        tabIndex={0}
        onClick={seek}
        style={{ flex: 1, height: 18, display: 'flex', alignItems: 'center', cursor: length ? 'pointer' : 'default' }}
      >
        <div style={{ position: 'relative', width: '100%', height: 3, borderRadius: 2, background: track }}>
          <div style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, borderRadius: 2, background: ink }} />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${progress * 100}%`,
              width: 10,
              height: 10,
              borderRadius: 999,
              background: ink,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>
      <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: inverse ? 'rgba(255,255,255,0.8)' : 'var(--isoko-muted)' }}>
        {formatClock(playing || position ? position : length)}
      </span>
    </div>
  );
};

export default VoiceNotePlayer;
