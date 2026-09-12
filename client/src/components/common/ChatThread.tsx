import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Flex, Input, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { messageApi } from '../../api/messageApi';
import { connectSocket } from '../../lib/socket';
import Avatar from './Avatar';
import type { Message } from '../../types';

interface ChatThreadProps {
  recipientId: string;
  recipientName?: string;
  showHeader?: boolean;
  placeholder?: string;
  emptyText?: string;
}

const ChatThread = ({
  recipientId,
  recipientName,
  showHeader = false,
  placeholder,
  emptyText,
}: ChatThreadProps) => {
  const myId = useAppSelector((state) => state.auth.profile?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    messageApi.listMessages(recipientId).then((loaded) => {
      if (active) setMessages(loaded);
    });
    return () => {
      active = false;
    };
  }, [recipientId]);

  useEffect(() => {
    const socket = connectSocket();
    const onNewMessage = (message: Message) => {
      const other = message.senderId === myId ? message.recipientId : message.senderId;
      if (other !== recipientId) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
    };
    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
  }, [recipientId, myId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const sent = await messageApi.sendMessage({ recipientId, body });
      setDraft('');
      setMessages((current) =>
        current.some((m) => m.id === sent.id) ? current : [...current, sent],
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {showHeader && recipientName && (
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <Avatar name={recipientName} size={28} />
          <Typography.Text strong>{recipientName}</Typography.Text>
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
          background: 'rgba(24,24,27,0.03)',
          border: '1px solid rgba(24,24,27,0.06)',
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
          return (
            <div
              key={message.id}
              style={{
                alignSelf: own ? 'flex-end' : 'flex-start',
                maxWidth: '78%',
                padding: '7px 11px',
                borderRadius: 12,
                fontSize: 13,
                background: own ? '#18181b' : '#ffffff',
                color: own ? '#fff' : 'inherit',
                border: own ? 'none' : '1px solid rgba(24,24,27,0.1)',
              }}
            >
              {message.body}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <Flex gap={8} style={{ marginTop: 12 }}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={handleSend}
          placeholder={placeholder ?? (recipientName ? `Message ${recipientName}` : 'Message')}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          disabled={!draft.trim()}
          onClick={handleSend}
        />
      </Flex>
    </div>
  );
};

export default ChatThread;
