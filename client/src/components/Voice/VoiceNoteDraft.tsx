import { useTranslation } from 'react-i18next';
import { Button, Flex, Tooltip } from 'antd';
import { CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { VOICE_MAX_SECONDS, type VoiceRecorder } from '../../hooks/useVoiceRecorder';
import VoiceNotePlayer from './VoiceNotePlayer';
import { formatClock } from '../../utils/formatClock';

/**
 * The note being made: a live timer while recording, then a player to listen
 * back before it is sent. Renders nothing when the recorder is idle.
 */
const VoiceNoteDraft = ({ recorder }: { recorder: VoiceRecorder }) => {
  const { t } = useTranslation();
  if (recorder.state === 'idle') return null;

  return (
    <Flex
      align="center"
      gap={10}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid var(--isoko-border)',
        background: 'var(--ant-color-bg-container)',
      }}
    >
      {recorder.state === 'recording' ? (
        <>
          <span className="isoko-rec-dot" aria-hidden="true" />
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(recorder.elapsed)}
            <span style={{ color: 'var(--isoko-muted)' }}> / {formatClock(VOICE_MAX_SECONDS)}</span>
          </span>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--isoko-muted)' }}>{t('voice.recording')}</span>
          <Tooltip title={t('voice.discard')}>
            <Button type="text" icon={<DeleteOutlined />} aria-label={t('voice.discard')} onClick={recorder.discard} />
          </Tooltip>
          <Button icon={<CheckOutlined />} onClick={recorder.stop}>
            {t('voice.done')}
          </Button>
        </>
      ) : (
        recorder.clip && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <VoiceNotePlayer src={recorder.clip.url} durationSec={recorder.clip.durationSec} width="100%" />
            </div>
            <Tooltip title={t('voice.discard')}>
              <Button type="text" icon={<DeleteOutlined />} aria-label={t('voice.discard')} onClick={recorder.discard} />
            </Tooltip>
          </>
        )
      )}
    </Flex>
  );
};

export default VoiceNoteDraft;
