import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  DollarOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FundOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
  RiseOutlined,
  TrophyOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { activeNavKey, visibleNavEntries } from './navConfig';

const ICONS: Record<string, ReactNode> = {
  '/dashboard': <DashboardOutlined />,
  '/marketplace': <AppstoreOutlined />,
  '/wallet': <WalletOutlined />,
  '/growth': <RiseOutlined />,
  '/disputes': <AuditOutlined />,
  '/notifications': <BellOutlined />,
  '/settings': <SettingOutlined />,
  '/admin/gigs/pending': <CheckSquareOutlined />,
  '/admin/reviews': <SafetyCertificateOutlined />,
  '/admin/jobs': <ToolOutlined />,
  '/admin/payments': <DollarOutlined />,
  '/admin/users': <TeamOutlined />,
  '/admin/reviewers': <SolutionOutlined />,
  '/admin/audit': <FileSearchOutlined />,
  '/admin': <BarChartOutlined />,
  '/admin/metrics': <ExperimentOutlined />,
  '/admin/market': <FundOutlined />,
  '/admin/system': <WifiOutlined />,
  '/admin/fairwork': <TrophyOutlined />,
};

const SideNav = ({ dark, onNavigate }: { dark: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();

  // Entries without a group come first, flat; grouped ones sit under a heading.
  // A collapsed sider hides the headings (antd shows a divider instead).
  const items = useMemo(() => {
    const entries = visibleNavEntries(role);
    const item = (entry: (typeof entries)[number]) => ({
      key: entry.key,
      icon: ICONS[entry.key],
      label: t(entry.labelKey),
    });
    const flat = entries.filter((e) => !e.group).map(item);
    const groups: { type: 'group'; key: string; label: string; children: ReturnType<typeof item>[] }[] = [];
    for (const entry of entries.filter((e) => e.group)) {
      let group = groups.find((g) => g.key === entry.group);
      if (!group) {
        group = { type: 'group', key: entry.group as string, label: t(entry.group as string), children: [] };
        groups.push(group);
      }
      group.children.push(item(entry));
    }
    return [...flat, ...groups];
  }, [role, t]);

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
