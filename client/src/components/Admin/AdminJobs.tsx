import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Segmented, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import { paymentLabel } from '../../lib/money';
import type { Gig } from '../../types';

type View = 'live' | 'done';

const doneMatch = (g: Gig) => g.matches?.find((m) => m.status === 'completed');
const liveMatch = (g: Gig) => g.matches?.find((m) => m.status === 'accepted');

/**
 * Every job past approval: live ones (open for applications, or under way) and
 * finished ones, with who is doing or did the work and where the money stands.
 */
const AdminJobs = () => {
  const { t } = useTranslation();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('live');

  useEffect(() => {
    adminApi
      .listGigs()
      .then(setGigs)
      .finally(() => setLoading(false));
  }, []);

  const live = gigs.filter((g) => g.status === 'open' || g.status === 'matched');
  const done = gigs.filter((g) => g.status === 'completed');

  const columns: ColumnsType<Gig> = [
    {
      title: 'Gig',
      key: 'title',
      render: (_, g) => <Link to={`/gigs/${g.id}`}>{g.title}</Link>,
    },
    {
      title: 'Client',
      key: 'client',
      responsive: ['md'],
      render: (_, g) => (g.client ? <IdentityLink id={g.client.id} name={g.client.name} size={22} src={g.client.avatarUrl} /> : '—'),
    },
    {
      title: view === 'live' ? 'Worker' : 'Completed by',
      key: 'worker',
      responsive: ['md'],
      render: (_, g) => {
        const w = (view === 'live' ? liveMatch(g) : doneMatch(g))?.worker;
        return w ? <IdentityLink id={w.id} name={w.name} size={22} src={w.avatarUrl} /> : <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      title: 'Budget',
      key: 'budget',
      responsive: ['sm'],
      align: 'right',
      render: (_, g) => `${Number(g.budget).toLocaleString()} RWF`,
    },
    {
      title: view === 'live' ? 'Status' : 'Payment',
      key: 'state',
      render: (_, g) => {
        if (view === 'live') return <StatusTag status={g.status} />;
        const tx = doneMatch(g)?.transaction;
        if (!tx) return <Typography.Text type="secondary">—</Typography.Text>;
        const state = paymentLabel(tx);
        return <StatusTag status={state} />;
      },
    },
    {
      title: 'Updated',
      key: 'date',
      responsive: ['sm'],
      render: (_, g) => {
        const m = view === 'live' ? liveMatch(g) : doneMatch(g);
        return new Date(m?.updatedAt ?? g.createdAt).toLocaleDateString();
      },
    },
  ];

  return (
    <PageContainer title={t('adminNav.jobs')} subtitle={t('adminNav.jobsSub')}>
      <Segmented<View>
        value={view}
        onChange={setView}
        style={{ marginBottom: 16 }}
        options={[
          { label: `Live (${live.length})`, value: 'live' },
          { label: `Completed (${done.length})`, value: 'done' },
        ]}
      />
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={view === 'live' ? live : done}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminJobs;
