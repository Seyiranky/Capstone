import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Empty, Row, Skeleton, Statistic } from 'antd';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import AdminNav from './AdminNav';
import { ColumnChart, PieChart } from '../common/charts';
import type { Gig, User } from '../../types';

const GIG_STAGES: { key: Gig['status']; label: string }[] = [
  { key: 'pending_review', label: 'Pending' },
  { key: 'open', label: 'Open' },
  { key: 'matched', label: 'Matched' },
  { key: 'completed', label: 'Completed' },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
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
    return [...c.entries()].map(([type, value]) => ({ type, value }));
  }, [users]);

  const categoryBars = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of gigs) {
      const name = g.skill?.name ?? 'Other';
      c.set(name, (c.get(name) ?? 0) + 1);
    }
    return [...c.entries()].map(([label, value]) => ({ label, value }));
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
    { label: 'Users', value: users.length, to: '/admin/users' },
    { label: 'Suspended', value: suspended, to: '/admin/users' },
    { label: 'Pending approvals', value: pendingGigs, to: '/admin/gigs/pending' },
    { label: 'Completed gigs', value: completedGigs, to: '/admin/gigs/completed' },
  ];

  return (
    <PageContainer title="Admin" subtitle="Platform activity at a glance.">
      <AdminNav />
      {loading ? (
        <Skeleton active />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {tiles.map((tile) => (
              <Col xs={12} md={6} key={tile.label}>
                <Card size="small" hoverable onClick={() => navigate(tile.to)} style={{ height: '100%' }}>
                  <Statistic title={tile.label} value={tile.value} />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={8}>
              <Card title="Users by role" styles={{ body: { minHeight: 260 } }}>
                {roleSlices.length ? (
                  <PieChart data={roleSlices} height={220} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Gigs by category" styles={{ body: { minHeight: 260 } }}>
                {categoryBars.length ? (
                  <ColumnChart data={categoryBars} height={220} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Gig funnel" styles={{ body: { minHeight: 260 } }}>
                <ColumnChart data={stageBars} height={220} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </PageContainer>
  );
};

export default AdminDashboard;
