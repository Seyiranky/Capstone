import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Badge, Button, Flex, Grid, Segmented, Space, Tooltip, Typography } from 'antd';
import {
  BellOutlined,
  BulbOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { notificationApi } from '../../api/notificationApi';
import { connectSocket } from '../../lib/socket';
import { useThemeMode } from '../../theme/ThemeProvider';
import { NAV_ENTRIES, activeNavKey } from './navConfig';
import type { AppNotification } from '../../types';

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
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    notificationApi
      .listNotifications()
      .then((n) => setUnread(n.filter((x) => !x.readAt).length))
      .catch(() => setUnread(0));
  }, [location.pathname, role]);

  useEffect(() => {
    if (!role) return;
    const socket = connectSocket();
    const onNew = (n: AppNotification) => {
      setUnread((u) => u + 1);
      notification.open({
        message: n.title,
        description: n.body,
        placement: 'bottomRight',
        duration: 4,
      });
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [role, notification]);

  const lang = i18n.resolvedLanguage === 'rw' ? 'rw' : 'en';

  return (
    <Flex align="center" justify="space-between" style={{ height: '100%', width: '100%' }}>
      <Space size={10}>
        <Button
          type="text"
          aria-label="Toggle navigation"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
        <Typography.Text strong style={{ fontSize: 16 }}>
          {pageTitle(location.pathname, t)}
        </Typography.Text>
      </Space>

      <Space size={8} align="center">
        {screens.sm ? (
          <button
            type="button"
            onClick={onSearch}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 32,
              padding: '0 10px',
              borderRadius: 4,
              border: '1px solid var(--ant-color-border, #e4e4e7)',
              background: 'var(--ant-color-fill-quaternary, #fafafa)',
              color: '#71717a',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
          >
            <SearchOutlined />
            <span>Search</span>
            <kbd
              style={{
                fontSize: 11,
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid var(--ant-color-border, #e4e4e7)',
                background: 'var(--ant-color-bg-container, #fff)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        ) : (
          <Button type="text" aria-label="Search" icon={<SearchOutlined />} onClick={onSearch} />
        )}
        <Segmented
          size="small"
          value={lang}
          onChange={(v) => i18n.changeLanguage(v as string)}
          options={[
            { label: 'EN', value: 'en' },
            { label: 'RW', value: 'rw' },
          ]}
        />
        <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
          <Button
            type="text"
            aria-label="Toggle theme"
            icon={<BulbOutlined />}
            onClick={() => setMode(isDark ? 'light' : 'dark')}
          />
        </Tooltip>
        <Badge count={unread} size="small" offset={[-2, 4]}>
          <Button
            type="text"
            aria-label={t('sidebar.notifications')}
            icon={<BellOutlined />}
            onClick={() => navigate('/notifications')}
          />
        </Badge>
      </Space>
    </Flex>
  );
};

export default AppHeader;
