import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Flex, Menu } from 'antd';
import {
  AlertOutlined,
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
  TrophyOutlined,
  WifiOutlined,
  FlagOutlined,
  MedicineBoxOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { supportApi } from '../../api/supportApi';
import { safeVisitApi } from '../../api/safeVisitApi';
import { useAppSelector } from '../../store/hooks';
import { activeNavKey, visibleNavEntries } from './navConfig';

const ICONS: Record<string, ReactNode> = {
  '/dashboard': <DashboardOutlined />,
  '/marketplace': <AppstoreOutlined />,
  '/wallet': <WalletOutlined />,
  '/workers': <TeamOutlined />,
  '/admin/cover': <MedicineBoxOutlined />,
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
  '/admin/safety': <AlertOutlined />,
  '/admin/reports': <FlagOutlined />,
  '/support': <CustomerServiceOutlined />,
  '/admin/support': <CustomerServiceOutlined />,
};

const SideNav = ({ dark, onNavigate }: { dark: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();
  // Counts beside entries that need someone: support replies for people; for
  // admins, waiting support requests and open safety alerts (checked often).
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!role) return;
    const load = () => {
      if (role === 'admin') {
        supportApi.admin.unread().then((n) => setCounts((c) => ({ ...c, '/admin/support': n }))).catch(() => undefined);
        safeVisitApi.openCount().then((n) => setCounts((c) => ({ ...c, '/admin/safety': n }))).catch(() => undefined);
      } else {
        supportApi.unread().then((n) => setCounts((c) => ({ ...c, '/support': n }))).catch(() => undefined);
      }
    };
    load();
    const poll = window.setInterval(load, role === 'admin' ? 20000 : 60000);
    return () => window.clearInterval(poll);
  }, [role, location.pathname]);

  // Entries without a group come first, flat; grouped ones sit under a heading.
  // A collapsed sider hides the headings (antd shows a divider instead).
  const items = useMemo(() => {
    const entries = visibleNavEntries(role);
    const item = (entry: (typeof entries)[number]) => ({
      key: entry.key,
      icon: ICONS[entry.key],
      label:
        counts[entry.key] > 0 ? (
          <Flex justify="space-between" align="center" gap={8}>
            {t(entry.labelKey)}
            <Badge count={counts[entry.key]} size="small" />
          </Flex>
        ) : (
          t(entry.labelKey)
        ),
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
  }, [role, t, counts]);

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
