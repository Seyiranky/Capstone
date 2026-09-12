import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Flex, Space, Tag, Typography } from 'antd';
import { AudioOutlined, CameraOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const MAX_FILES = 5;

const prettySize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/**
 * Captures proof of work as photos or a spoken note.
 *
 * The previous form demanded a pasted URL, which assumes the worker already
 * hosts their evidence somewhere. Photographing finished work or describing it
 * aloud is what this group can actually do, and voice matters specifically
 * because literacy is not a safe assumption here.
 */
const EvidenceCapture = ({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) => {
  const { t } = useTranslation();
  const photoInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Releasing the microphone on unmount matters: a forgotten stream leaves the
  // recording indicator on, which is alarming and looks like surveillance.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const addFiles = (incoming: File[]) => {
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setError(t('verification.tooManyFiles', { max: MAX_FILES }));
      return;
    }
    setError(null);
    onChange([...files, ...incoming.slice(0, room)]);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        addFiles([new File([blob], 'voice-note.webm', { type: blob.type })]);
        stream.getTracks().forEach((track) => track.stop());
      };
      mr.start();
      recorder.current = mr;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError(t('verification.micDenied'));
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    setRecording(false);
  };

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Flex gap={8} wrap>
        <Button icon={<CameraOutlined />} onClick={() => photoInput.current?.click()}>
          {t('verification.addPhoto')}
        </Button>
        {recording ? (
          <Button danger icon={<StopOutlined />} onClick={stopRecording}>
            {t('verification.stopRecording', { seconds })}
          </Button>
        ) : (
          <Button icon={<AudioOutlined />} onClick={startRecording}>
            {t('verification.recordVoice')}
          </Button>
        )}
      </Flex>

      <input
        ref={photoInput}
        type="file"
        accept="image/*,video/*"
        // `capture` opens the camera directly on Android, which is the
        // difference between one tap and a file-manager hunt.
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('verification.captureHint')}
      </Typography.Text>

      {error && <Alert type="warning" showIcon message={error} />}

      {files.length > 0 && (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {files.map((file, index) => (
            <Flex key={`${file.name}-${index}`} align="center" justify="space-between" gap={8}>
              <Space size={6}>
                <Tag style={{ margin: 0 }}>
                  {file.type.startsWith('audio')
                    ? t('verification.kind.voice')
                    : file.type.startsWith('video')
                      ? t('verification.kind.video')
                      : t('verification.kind.photo')}
                </Tag>
                <Typography.Text style={{ fontSize: 12 }}>
                  {file.name} · {prettySize(file.size)}
                </Typography.Text>
              </Space>
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              />
            </Flex>
          ))}
        </Space>
      )}
    </Space>
  );
};

export default EvidenceCapture;
