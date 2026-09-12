import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { activeNavKey, visibleNavEntries } from './navConfig';

const ICONS: Record<string, ReactNode> = {
  '/dashboard': <DashboardOutlined />,
  '/marketplace': <AppstoreOutlined />,
  '/wallet': <WalletOutlined />,
  '/notifications': <BellOutlined />,
  '/admin': <SafetyCertificateOutlined />,
  '/settings': <SettingOutlined />,
};

const SideNav = ({ dark, onNavigate }: { dark: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();

  const items = useMemo(
    () =>
      visibleNavEntries(role).map((entry) => ({
        key: entry.key,
        icon: ICONS[entry.key],
        label: t(entry.labelKey),
      })),
    [role, t],
  );

  const selected = activeNavKey(location.pathname);

  return (
    <Menu
      theme={dark ? 'dark' : 'light'}
      mode="inline"
      selectedKeys={selected ? [selected] : []}
      items={items}
      onClick={({ key }) => {
        navigate(key);
        onNavigate?.();
      }}
      style={{ borderInlineEnd: 0, background: 'transparent', padding: '0 8px' }}
    />
  );
};

export default SideNav;
