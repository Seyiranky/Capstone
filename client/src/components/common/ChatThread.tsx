import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Empty, Flex, Image, Input, Tooltip, Typography } from 'antd';
import { AudioOutlined, CloseOutlined, PictureOutlined, SendOutlined } from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { messageApi } from '../../api/messageApi';
import { connectSocket } from '../../lib/socket';
import { resolveAssetUrl } from '../../utils/assetUrl';
import Avatar from './Avatar';
import { clipFile, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import VoiceNoteDraft from '../Voice/VoiceNoteDraft';
import VoiceNotePlayer from '../Voice/VoiceNotePlayer';
import OffPlatformNote from '../Trust/OffPlatformNote';
import ReportUserButton from '../Trust/ReportUserButton';
import type { Message } from '../../types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface ChatThreadProps {
  recipientId: string;
  recipientName?: string;
  showHeader?: boolean;
  placeholder?: string;
  emptyText?: string;
  /** Called after the thread marks the contact's messages read, so a list can clear its badge. */
  onRead?: () => void;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * A conversation with one person: text, photos and voice notes, live in both directions.
 *
 * Opening the thread marks the other person's messages read and tells them,
 * so their side shows "Seen" under the last message they sent.
 */
const ChatThread = ({
  recipientId,
  recipientName,
  showHeader = false,
  placeholder,
  emptyText,
  onRead,
}: ChatThreadProps) => {
  const { t } = useTranslation();
  const { message: toast } = App.useApp();
  const myId = useAppSelector((state) => state.auth.profile?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const recorder = useVoiceRecorder();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const markRead = () =>
    messageApi
      .markRead(recipientId)
      .then(() => onReadRef.current?.())
      .catch(() => undefined);

  useEffect(() => {
    let active = true;
    messageApi.listMessages(recipientId).then((loaded) => {
      if (active) setMessages(loaded);
    });
    markRead();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientId]);

  useEffect(() => {
    const socket = connectSocket();
    const onNewMessage = (message: Message) => {
      const other = message.senderId === myId ? message.recipientId : message.senderId;
      if (other !== recipientId) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
      // They wrote while this thread is open: it is read as it arrives.
      if (message.senderId === recipientId && document.visibilityState === 'visible') markRead();
    };
    const onRead = ({ readerId, readAt }: { readerId: string; readAt: string }) => {
      if (readerId !== recipientId) return;
      setMessages((current) =>
        current.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt } : m)),
      );
    };
    socket.on('message:new', onNewMessage);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:read', onRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientId, myId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Release the preview's object URL when it is replaced or the thread closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('chat.notImage'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('chat.tooBig'));
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImage(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  useEffect(() => {
    if (recorder.error) toast.error(t(recorder.error === 'denied' ? 'voice.denied' : 'voice.unsupported'));
  }, [recorder.error, t, toast]);

  const clip = recorder.state === 'recorded' ? recorder.clip : null;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body && !image && !clip) return;
    setSending(true);
    try {
      const sent = await messageApi.sendMessage({
        recipientId,
        body,
        image,
        voice: clip ? { file: clipFile(clip), durationSec: clip.durationSec } : null,
      });
      setDraft('');
      clearImage();
      recorder.discard();
      setMessages((current) =>
        current.some((m) => m.id === sent.id) ? current : [...current, sent],
      );
    } catch {
      toast.error(t('chat.failed'));
    } finally {
      setSending(false);
    }
  };

  const lastOwn = [...messages].reverse().find((m) => m.senderId === myId);

  return (
    <div>
      {showHeader && recipientName && (
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <Avatar name={recipientName} size={28} />
          <Typography.Text strong style={{ flex: 1, minWidth: 0 }} ellipsis>
            {recipientName}
          </Typography.Text>
          <ReportUserButton userId={recipientId} name={recipientName} />
        </Flex>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 220,
          maxHeight: 420,
          overflowY: 'auto',
          padding: 12,
          borderRadius: 10,
          background: 'var(--ant-color-fill-quaternary, rgba(24,24,27,0.03))',
          border: '1px solid var(--ant-color-border-secondary, rgba(24,24,27,0.06))',
        }}
      >
        {messages.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={emptyText ?? 'No messages yet — say hello.'}
          />
        )}
        {messages.map((message) => {
          const own = message.senderId === myId;
          const src = resolveAssetUrl(message.imageUrl);
          const voice = resolveAssetUrl(message.audioUrl);
          return (
            <div
              key={message.id}
              style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '78%' }}
            >
              <div
                style={{
                  padding: src && !message.body ? 4 : '7px 11px',
                  borderRadius: 12,
                  fontSize: 13,
                  background: own ? 'var(--isoko-bubble-own)' : 'var(--ant-color-bg-container, #ffffff)',
                  color: own ? '#fff' : 'inherit',
                  border: own ? 'none' : '1px solid var(--isoko-border)',
                  overflowWrap: 'anywhere',
                }}
              >
                {src && (
                  <div style={{ marginBottom: message.body ? 6 : 0 }}>
                    <Image
                      src={src}
                      alt={t('chat.photo')}
                      width={200}
                      style={{
                        borderRadius: 9,
                        display: 'block',
                        maxHeight: 260,
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                )}
                {voice && (
                  <div style={{ padding: message.body || src ? '2px 0 6px' : '2px 0' }}>
                    <VoiceNotePlayer src={voice} durationSec={message.audioDurationSec} tone={own ? 'inverse' : 'default'} />
                  </div>
                )}
                {message.body && <div style={{ textAlign: 'left' }}>{message.body}</div>}
              </div>
              {message.offPlatformFlag && <OffPlatformNote flag={message.offPlatformFlag} own={own} />}
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, display: 'block', textAlign: own ? 'right' : 'left', marginTop: 2 }}
              >
                {time(message.createdAt)}
                {own && message.id === lastOwn?.id && (
                  <> · {message.readAt ? t('chat.seen') : t('chat.sent')}</>
                )}
              </Typography.Text>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {preview && (
        <Flex align="center" gap={8} style={{ marginTop: 10 }}>
          <div style={{ position: 'relative' }}>
            <img
              src={preview}
              alt={t('chat.photo')}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, display: 'block' }}
            />
            <Button
              size="small"
              shape="circle"
              icon={<CloseOutlined />}
              aria-label={t('chat.removePhoto')}
              onClick={clearImage}
              style={{ position: 'absolute', top: -8, right: -8 }}
            />
          </div>
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 200 }}>
            {image?.name}
          </Typography.Text>
        </Flex>
      )}

      {recorder.state !== 'idle' && (
        <div style={{ marginTop: 10 }}>
          <VoiceNoteDraft recorder={recorder} />
        </div>
      )}

      <Flex gap={8} style={{ marginTop: 12 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickImage(e.target.files?.[0])}
        />
        <Tooltip title={t('chat.attach')}>
          <Button
            icon={<PictureOutlined />}
            aria-label={t('chat.attach')}
            onClick={() => fileRef.current?.click()}
          />
        </Tooltip>
        <Tooltip title={t('voice.record')}>
          <Button
            icon={<AudioOutlined />}
            aria-label={t('voice.record')}
            disabled={recorder.state !== 'idle'}
            onClick={recorder.start}
          />
        </Tooltip>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={handleSend}
          maxLength={4000}
          placeholder={placeholder ?? (recipientName ? `Message ${recipientName}` : 'Message')}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          aria-label="Send"
          loading={sending}
          disabled={(!draft.trim() && !image && !clip) || recorder.state === 'recording'}
          onClick={handleSend}
        />
      </Flex>
    </div>
  );
};

export default ChatThread;
