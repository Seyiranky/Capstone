import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Empty, Row, Skeleton } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, StopOutlined, TeamOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminApi';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import { BarChart, ColumnChart, PieChart } from '../common/charts';
import StatTile from '../common/StatTile';
import { useThemeMode } from '../../theme/ThemeProvider';
import { CHART_COLORS, CHART_COLORS_DARK } from '../../theme/tokens';
import type { Gig, User } from '../../types';

// Palette positions: 0 blue, 1 teal, 2 amber, 3 violet, 4 rose, 5 green.
// Each stage keeps its colour: waiting is amber, done is green.
const GIG_STAGES: { key: Gig['status']; label: string; color: number }[] = [
  { key: 'pending_review', label: 'Pending', color: 2 },
  { key: 'open', label: 'Open', color: 0 },
  { key: 'matched', label: 'Matched', color: 3 },
  { key: 'completed', label: 'Completed', color: 5 },
];
const ROLES: { key: string; label: string; color: number }[] = [
  { key: 'worker', label: 'Workers', color: 1 },
  { key: 'client', label: 'Clients', color: 0 },
  { key: 'admin', label: 'Admins', color: 3 },
];

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const palette = useThemeMode().isDark ? CHART_COLORS_DARK : CHART_COLORS;
  const [users, setUsers] = useState<User[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.listUsers(), adminApi.listGigs()])
      .then(([u, g]) => {
        setUsers(u);
        setGigs(g);
      })
      .finally(() => setLoading(false));
  }, []);

  const suspended = users.filter((u) => u.status === 'suspended').length;
  const pendingGigs = gigs.filter((g) => g.status === 'pending_review').length;
  const completedGigs = gigs.filter((g) => g.status === 'completed').length;

  const roleSlices = useMemo(() => {
    const c = new Map<string, number>();
    for (const u of users) c.set(u.role, (c.get(u.role) ?? 0) + 1);
    // A fixed order, so each role always gets the same colour.
    return ROLES.filter((r) => c.has(r.key)).map((r) => ({ type: r.label, value: c.get(r.key) ?? 0 }));
  }, [users]);
  const roleColors = ROLES.filter((r) => roleSlices.some((s) => s.type === r.label)).map((r) => palette[r.color]);

  const categoryBars = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of gigs) {
      const name = g.skill?.name ?? 'Other';
      c.set(name, (c.get(name) ?? 0) + 1);
    }
    return [...c.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [gigs]);

  const stageBars = useMemo(
    () =>
      GIG_STAGES.map((s) => ({
        label: s.label,
        value: gigs.filter((g) => g.status === s.key).length,
      })),
    [gigs],
  );

  const tiles = [
    { label: 'Users', value: users.length, to: '/admin/users', icon: <TeamOutlined />, accent: 'blue' },
    { label: 'Suspended', value: suspended, to: '/admin/users', icon: <StopOutlined />, accent: 'rose' },
    { label: 'Pending approvals', value: pendingGigs, to: '/admin/gigs/pending', icon: <ClockCircleOutlined />, accent: 'amber' },
    { label: 'Completed gigs', value: completedGigs, to: '/admin/jobs', icon: <CheckCircleOutlined />, accent: 'green' },
  ] as const;

  return (
    <PageContainer title={t('adminNav.analytics')} subtitle={t('adminNav.analyticsSub')}>
      {loading ? (
        <Skeleton active />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {tiles.map((tile) => (
              <Col xs={12} md={6} key={tile.label}>
                <div
                  role="link"
                  tabIndex={0}
                  className="isoko-tile-link"
                  onClick={() => navigate(tile.to)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(tile.to)}
                  style={{ height: '100%' }}
                >
                  <StatTile icon={tile.icon} label={tile.label} value={tile.value} accent={tile.accent} />
                </div>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={8}>
              <Card title="Users by role" styles={{ body: { minHeight: 260 } }}>
                {roleSlices.length ? (
                  <PieChart data={roleSlices} height={220} colors={roleColors} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Gigs by category" styles={{ body: { minHeight: 260 } }}>
                {categoryBars.length ? (
                  <BarChart data={categoryBars} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Gig funnel" styles={{ body: { minHeight: 260 } }}>
                <ColumnChart data={stageBars} height={220} colors={GIG_STAGES.map((g) => palette[g.color])} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </PageContainer>
  );
};

export default AdminDashboard;
