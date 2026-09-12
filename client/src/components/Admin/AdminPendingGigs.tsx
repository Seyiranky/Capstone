import { useEffect, useState } from 'react';
import { Card, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import GigThumbnail from '../common/GigThumbnail';
import StatusTag from '../common/StatusTag';
import GigApprovalQueue from './GigApprovalQueue';
import AdminNav from './AdminNav';
import type { Gig } from '../../types';

const AdminPendingGigs = () => {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    adminApi
      .listGigs()
      .then(setGigs)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const pendingReview = gigs.filter((g) => g.status === 'pending_review');
  const inProgress = gigs.filter((g) => g.status === 'open' || g.status === 'matched');

  const columns: ColumnsType<Gig> = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Client',
      key: 'client',
      render: (_, g) =>
        g.client ? <IdentityLink id={g.client.id} name={g.client.name} size={22} /> : '—',
    },
    {
      title: 'Category',
      key: 'category',
      render: (_, g) => (
        <Space size={8}>
          <GigThumbnail gig={g} size={22} />
          {g.skill?.name}
        </Space>
      ),
    },
    {
      title: 'Budget',
      key: 'budget',
      align: 'right',
      render: (_, g) => `${Number(g.budget).toLocaleString()} RWF`,
    },
    { title: 'Status', key: 'status', render: (_, g) => <StatusTag status={g.status} /> },
  ];

  return (
    <PageContainer
      title="Pending gigs"
      subtitle="Gigs awaiting approval, plus gigs already live but not yet completed."
    >
      <AdminNav />
      <Card title={`Awaiting approval (${pendingReview.length})`}>
        <GigApprovalQueue gigs={gigs} onReviewed={refresh} />
      </Card>
      <Card title={`In progress (${inProgress.length})`} style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={inProgress}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: 'Nothing in progress right now.' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminPendingGigs;
