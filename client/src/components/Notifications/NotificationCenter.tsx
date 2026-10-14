import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Grid,
  List,
  Row,
  Segmented,
  Space,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  BellOutlined,
  CheckOutlined,
  InboxOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { skillTaskApi } from '../../api/skillTaskApi';
import { messageApi } from '../../api/messageApi';
import { notificationApi } from '../../api/notificationApi';
import { connectSocket } from '../../lib/socket';
import { fromNow } from '../../lib/time';
import PageContainer from '../Layout/PageContainer';
import Avatar from '../common/Avatar';
import ChatThread from '../common/ChatThread';
import NotificationList from './NotificationList';
import { KINDS, kindOf } from '../../lib/notificationKind';
import type { AppNotification, ChatContact, Message } from '../../types';

type Contact = ChatContact;
type NavState = { contact?: Contact; tab?: 'messages' | 'updates' };

const NotificationCenter = () => {
  const { t } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const location = useLocation();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [tab, setTab] = useState<'messages' | 'updates'>(
    (location.state as NavState | null)?.tab ?? 'messages',
  );
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // Below md the list and the thread don't fit side by side, so show one at a time.
  const stacked = !Grid.useBreakpoint().md;

  const myIdRef = useRef<string | undefined>(undefined);
  myIdRef.current = useAppSelector((state) => state.auth.profile?.id);
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  useEffect(() => {
    const taskContacts =
      role === 'worker' || role === 'admin'
        ? skillTaskApi.listTasks().then((tasks) => {
            const seen = new Map<string, Contact>();
            for (const task of tasks) {
              const contact = role === 'admin' ? task.worker : task.reviewer;
              if (contact) seen.set(contact.id, contact);
            }
            return [...seen.values()];
          })
        : Promise.resolve<Contact[]>([]);

    Promise.all([taskContacts, messageApi.listContacts()]).then(([fromTasks, fromHistory]) => {
      const merged = new Map<string, Contact>();
      for (const c of fromTasks) merged.set(c.id, c);
      for (const c of fromHistory) merged.set(c.id, c);
      const navContact = (location.state as NavState | null)?.contact;
      if (navContact) {
        merged.set(navContact.id, navContact);
        setSelectedContact(merged.get(navContact.id)!);
      }
      // Conversations with something new first, then most recent.
      setContacts(
        [...merged.values()].sort(
          (a, b) =>
            (b.unreadCount ?? 0) - (a.unreadCount ?? 0) ||
            (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''),
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    notificationApi.listNotifications().then(setNotifications);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    // Any new message moves its conversation to the top with a fresh preview
    // and unread count; the open thread clears its own count via onRead.
    const onNewMessage = (message: Message) => {
      if (message.senderId === myIdRef.current && message.recipientId === myIdRef.current) return;
      refreshContacts();
    };
    const onNewNotification = (n: AppNotification) => {
      setNotifications((cur) => (cur.some((x) => x.id === n.id) ? cur : [n, ...cur]));
    };
    socket.on('message:new', onNewMessage);
    socket.on('notification:new', onNewNotification);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('notification:new', onNewNotification);
    };
  }, []);

  const refreshContacts = () =>
    messageApi
      .listContacts()
      .then((fresh) => {
        setContacts((current) => {
          const byId = new Map(current.map((c) => [c.id, c]));
          for (const c of fresh) byId.set(c.id, { ...byId.get(c.id), ...c });
          return [...byId.values()].sort(
            (a, b) =>
              (b.unreadCount ?? 0) - (a.unreadCount ?? 0) ||
              (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''),
          );
        });
      })
      .catch(() => undefined);

  // Opening a notice marks it read and goes to what it is about.
  const openNotice = (n: AppNotification) => {
    if (!n.readAt) {
      setNotifications((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      notificationApi.markRead(n.id).catch(() => undefined);
    }
    navigate(KINDS[kindOf(n.title)].link(role));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.readAt);
    const updated = await Promise.all(unread.map((n) => notificationApi.markRead(n.id)));
    const byId = new Map(updated.map((u) => [u.id, u]));
    setNotifications((cur) => cur.map((x) => byId.get(x.id) ?? x));
  };

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <PageContainer title={t('sidebar.notifications')}>
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as 'messages' | 'updates')}
        style={{ marginBottom: 20 }}
        options={[
          { label: (<Space size={6}><MessageOutlined />{t('common.messages')}</Space>), value: 'messages' },
          {
            label: (
              <Space size={6}>
                <BellOutlined />
                {t('inbox.updates')}
                {unread > 0 && <Badge count={unread} size="small" />}
              </Space>
            ),
            value: 'updates',
          },
        ]}
      />

      {tab === 'messages' ? (
        <Row gutter={16}>
          <Col xs={24} md={9} lg={8} style={{ display: stacked && selectedContact ? 'none' : undefined }}>
            <Card styles={{ body: { padding: 6 } }} style={{ minHeight: stacked ? undefined : 440 }}>
              {contacts.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('common.noConversations')}
                  style={{ padding: '24px 0' }}
                />
              ) : (
                <List
                  dataSource={contacts}
                  renderItem={(contact) => {
                    const active = selectedContact?.id === contact.id;
                    return (
                      <List.Item
                        onClick={() => setSelectedContact(contact)}
                        style={{
                          cursor: 'pointer',
                          padding: '10px 12px',
                          borderRadius: 4,
                          borderBlockEnd: 'none',
                          background: active ? 'var(--isoko-navy-soft)' : undefined,
                        }}
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge count={active ? 0 : contact.unreadCount} size="small" offset={[-2, 2]}>
                              <Avatar name={contact.name} size={34} />
                            </Badge>
                          }
                          title={
                            <Flex justify="space-between" gap={8}>
                              <Typography.Text
                                ellipsis
                                style={{ fontWeight: active || contact.unreadCount ? 600 : 500 }}
                              >
                                {contact.name}
                              </Typography.Text>
                              {contact.lastMessage && (
                                <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                  {fromNow(contact.lastMessage.createdAt)}
                                </Typography.Text>
                              )}
                            </Flex>
                          }
                          description={
                            contact.lastMessage && (
                              <Typography.Text
                                type="secondary"
                                ellipsis
                                style={{
                                  fontSize: 12,
                                  display: 'block',
                                  color: contact.unreadCount && !active ? 'var(--ant-color-text)' : undefined,
                                }}
                              >
                                {contact.lastMessage.fromMe ? `${t('chat.you')}: ` : ''}
                                {contact.lastMessage.body ||
                                  (contact.lastMessage.hasAudio
                                    ? t('chat.sentVoice')
                                    : contact.lastMessage.hasImage
                                      ? t('chat.sentPhoto')
                                      : '')}
                              </Typography.Text>
                            )
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} md={15} lg={16} style={{ display: stacked && !selectedContact ? 'none' : undefined }}>
            {stacked && selectedContact && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => setSelectedContact(null)}
                style={{ marginBottom: 8, paddingInline: 4 }}
              >
                {t('common.allConversations')}
              </Button>
            )}
            <Card style={{ minHeight: stacked ? undefined : 440 }}>
              {selectedContact ? (
                <ChatThread
                  key={selectedContact.id}
                  recipientId={selectedContact.id}
                  recipientName={selectedContact.name}
                  showHeader
                  onRead={() =>
                    setContacts((cur) =>
                      cur.map((c) => (c.id === selectedContact.id ? { ...c, unreadCount: 0 } : c)),
                    )
                  }
                />
              ) : (
                <Flex vertical align="center" justify="center" gap={8} style={{ minHeight: 380 }}>
                  <InboxOutlined style={{ fontSize: 40, color: 'var(--isoko-border)' }} />
                  <Typography.Text type="secondary">
                    Select a conversation to start messaging.
                  </Typography.Text>
                </Flex>
              )}
            </Card>
          </Col>
        </Row>
      ) : (
        <Card
          style={{ maxWidth: 760 }}
          styles={{ body: { padding: '8px 8px 12px' } }}
          title={
            <Segmented
              size="small"
              value={filter}
              onChange={(v) => setFilter(v as 'all' | 'unread')}
              options={[
                { label: t('inbox.all'), value: 'all' },
                { label: unread ? `${t('inbox.unread')} (${unread})` : t('inbox.unread'), value: 'unread' },
              ]}
            />
          }
          extra={
            unread > 0 && (
              <Button type="link" icon={<CheckOutlined />} onClick={markAllRead} style={{ paddingInline: 0 }}>
                {t('inbox.markAllRead')}
              </Button>
            )
          }
        >
          <NotificationList
            items={filter === 'unread' ? notifications.filter((n) => !n.readAt) : notifications}
            onOpen={openNotice}
            emptyText={filter === 'unread' ? t('inbox.noUnread') : undefined}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default NotificationCenter;
