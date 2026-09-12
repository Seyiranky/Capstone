import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import StatusTag from '../common/StatusTag';
import { fromNow } from '../../lib/time';
import type { GigApplication } from '../../types';

const MyApplications = () => {
  const [apps, setApps] = useState<GigApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gigApplicationApi
      .listApplications()
      .then(setApps)
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<GigApplication> = [
    {
      title: 'Gig',
      key: 'gig',
      render: (_, a) =>
        a.gig ? <Link to={`/gigs/${a.gigId}`}>{a.gig.title}</Link> : a.gigId,
    },
    {
      title: 'Category',
      key: 'category',
      render: (_, a) => a.gig?.skill?.name ?? '—',
    },
    {
      title: 'Budget',
      key: 'budget',
      align: 'right',
      render: (_, a) => (a.gig ? `${Number(a.gig.budget).toLocaleString()} RWF` : '—'),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, a) => <StatusTag status={a.status} />,
    },
    {
      title: 'Applied',
      key: 'applied',
      render: (_, a) => fromNow(a.createdAt),
    },
  ];

  if (!loading && apps.length === 0) {
    return (
      <Card>
        <Empty description="You haven't applied to any gigs yet." />
      </Card>
    );
  }

  return (
    <Card>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={apps}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default MyApplications;
