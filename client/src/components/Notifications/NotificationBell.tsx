import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Badge, Button, Flex, Popover, Segmented, Typography } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { notificationApi } from '../../api/notificationApi';
import { connectSocket } from '../../lib/socket';
import { KINDS, kindOf } from '../../lib/notificationKind';
import NotificationList from './NotificationList';
import type { AppNotification } from '../../types';

/**
 * The bell in the header: an unread count, a panel with the latest notices,
 * and a toast when one arrives while the app is open. Opening a notice marks
 * it read and goes to the page it is about.
 */
const NotificationBell = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { notification } = App.useApp();
  const role = useAppSelector((s) => s.auth.role);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = () =>
    notificationApi
      .listNotifications()
      .then(setItems)
      .catch(() => undefined);

  // Reloaded on navigation too, so a notice read on the Notifications page
  // stops counting here.
  useEffect(() => {
    load();
  }, [location.pathname, role]);

  useEffect(() => {
    if (!role) return;
    const socket = connectSocket();
    const onNew = (n: AppNotification) => {
      setItems((cur) => (cur.some((x) => x.id === n.id) ? cur : [n, ...cur]));
      const kind = KINDS[kindOf(n.title)];
      const key = `notice-${n.id}`;
      notification.open({
        key,
        message: n.title,
        description: n.body,
        icon: <span className={`isoko-notif__icon isoko-accent-${kind.tone}`}>{kind.icon}</span>,
        placement: 'bottomRight',
        duration: 6,
        className: 'isoko-notif-toast',
        onClick: () => {
          notification.destroy(key);
          openNotice(n);
        },
      });
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
    // openNotice reads the latest role through the closure it is defined in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, notification]);

  const openNotice = (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      notificationApi.markRead(n.id).catch(() => undefined);
    }
    navigate(KINDS[kindOf(n.title)].link(role));
  };

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.readAt);
    const now = new Date().toISOString();
    setItems((cur) => cur.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    await Promise.all(unread.map((n) => notificationApi.markRead(n.id).catch(() => undefined)));
  };

  const unread = items.filter((n) => !n.readAt).length;
  const shown = (filter === 'unread' ? items.filter((n) => !n.readAt) : items).slice(0, 20);

  const panel = (
    <div className="isoko-notif-panel">
      <div className="isoko-notif-panel__head">
        <Flex justify="space-between" align="center">
          <Typography.Text strong style={{ fontSize: 16 }}>
            {t('inbox.title')}
          </Typography.Text>
          {unread > 0 && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={markAllRead} style={{ paddingInline: 0 }}>
              {t('inbox.markAllRead')}
            </Button>
          )}
        </Flex>
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'unread')}
          style={{ marginTop: 10 }}
          options={[
            { label: t('inbox.all'), value: 'all' },
            { label: unread ? `${t('inbox.unread')} (${unread})` : t('inbox.unread'), value: 'unread' },
          ]}
        />
      </div>
      <div className="isoko-notif-panel__list">
        <NotificationList
          items={shown}
          onOpen={openNotice}
          emptyText={filter === 'unread' ? t('inbox.noUnread') : undefined}
        />
      </div>
      <div className="isoko-notif-panel__foot">
        <Button
          type="link"
          block
          onClick={() => {
            setOpen(false);
            navigate('/notifications', { state: { tab: 'updates' } });
          }}
        >
          {t('inbox.viewAll')}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={panel}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      open={open}
      onOpenChange={setOpen}
      classNames={{ root: 'isoko-notif-popover' }}
      destroyOnHidden
    >
      <Badge count={unread} size="small" overflowCount={99} offset={[-3, 3]}>
        <Button
          type="text"
          shape="circle"
          className="isoko-icon-btn"
          aria-label={t('sidebar.notifications')}
          icon={<BellOutlined />}
        />
      </Badge>
    </Popover>
  );
};

export default NotificationBell;
