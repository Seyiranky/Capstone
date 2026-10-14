import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Grid, Segmented, Space, Tooltip, Typography } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { connectSocket } from '../../lib/socket';
import { useThemeMode } from '../../theme/ThemeProvider';
import { NAV_ENTRIES, activeNavKey } from './navConfig';
import NotificationBell from '../Notifications/NotificationBell';
import type { Message } from '../../types';

const pageTitle = (pathname: string, t: (k: string) => string): string => {
  const key = activeNavKey(pathname);
  const entry = NAV_ENTRIES.find((e) => e.key === key);
  if (entry) return t(entry.labelKey);
  if (pathname.startsWith('/gigs/')) return t('sidebar.gigDetails');
  if (pathname.startsWith('/profile/')) return t('sidebar.profile');
  return '';
};

interface AppHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
}

const AppHeader = ({ collapsed, onToggle, onSearch }: AppHeaderProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAppSelector((state) => state.auth);
  const { isDark, setMode } = useThemeMode();
  const { notification } = App.useApp();
  const screens = Grid.useBreakpoint();
  const myId = useAppSelector((state) => state.auth.profile?.id);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    if (!role) return;
    const socket = connectSocket();
    // A message from someone else, while the inbox is not the page in front
    // of the user, gets a notice they can open the conversation from.
    const onMessage = (m: Message) => {
      if (!m.sender || m.senderId === myId || locationRef.current === '/notifications') return;
      const key = `message-${m.id}`;
      notification.open({
        key,
        message: t('chat.newFrom', { name: m.sender.name }),
        description: m.body || (m.audioUrl ? t('chat.sentVoice') : t('chat.sentPhoto')),
        placement: 'bottomRight',
        duration: 5,
        onClick: () => {
          notification.destroy(key);
          navigate('/notifications', { state: { contact: { id: m.sender!.id, name: m.sender!.name } } });
        },
        style: { cursor: 'pointer' },
      });
    };
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [role, notification, myId, navigate, t]);

  const lang = i18n.resolvedLanguage === 'rw' ? 'rw' : 'en';

  return (
    <Flex align="center" justify="space-between" style={{ height: '100%', width: '100%' }}>
      {/* minWidth 0 lets the title truncate instead of breaking mid-word on phones. */}
      <Flex align="center" gap={screens.sm ? 10 : 4} style={{ minWidth: 0, flex: 1 }}>
        <Button
          type="text"
          aria-label="Toggle navigation"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{ flexShrink: 0 }}
        />
        <Typography.Text strong ellipsis style={{ fontSize: 16 }}>
          {pageTitle(location.pathname, t)}
        </Typography.Text>
      </Flex>

      <Space size={screens.sm ? 8 : 2} align="center" style={{ flexShrink: 0 }}>
        {screens.sm ? (
          <Button onClick={onSearch} icon={<SearchOutlined />} style={{ color: 'var(--isoko-muted)', paddingInline: 10 }}>
            <span style={{ marginInlineEnd: 18 }}>{t('common.searchLabel')}</span>
            <kbd
              style={{
                fontSize: 11,
                lineHeight: '16px',
                padding: '0 5px',
                borderRadius: 4,
                border: '1px solid var(--isoko-border)',
                background: 'var(--ant-color-fill-quaternary)',
                fontFamily: 'inherit',
              }}
            >
              ⌘K
            </kbd>
          </Button>
        ) : (
          <Button type="text" aria-label="Search" icon={<SearchOutlined />} onClick={onSearch} />
        )}
        <Segmented
          size="small"
          className="isoko-header-fixed"
          value={lang}
          onChange={(v) => i18n.changeLanguage(v as string)}
          options={[
            { label: 'EN', value: 'en' },
            { label: 'RW', value: 'rw' },
          ]}
        />
        {/* Phones keep the header to essentials; theme stays reachable in Settings. */}
        {screens.sm && (
          // A fixed 32px circle and a tooltip below, removed when hidden: swapping
          // the sun and moon icons must not reflow the language switch or the bell.
          <Tooltip placement="bottom" destroyOnHidden title={isDark ? t('header.lightMode') : t('header.darkMode')}>
            <Button
              type="text"
              shape="circle"
              className="isoko-icon-btn"
              aria-label={isDark ? t('header.lightMode') : t('header.darkMode')}
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => setMode(isDark ? 'light' : 'dark')}
            />
          </Tooltip>
        )}
        <NotificationBell />
      </Space>
    </Flex>
  );
};

export default AppHeader;
