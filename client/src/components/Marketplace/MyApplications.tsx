import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import StatusTag from '../common/StatusTag';
import { fromNow } from '../../lib/time';
import type { GigApplication } from '../../types';

const MyApplications = () => {
  const { t } = useTranslation();
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
      title: t('marketplace.myApplications.gig'),
      key: 'gig',
      render: (_, a) =>
        a.gig ? <Link to={`/gigs/${a.gigId}`}>{a.gig.title}</Link> : a.gigId,
    },
    {
      title: t('marketplace.myApplications.category'),
      key: 'category',
      render: (_, a) => a.gig?.skill?.name ?? '—',
    },
    {
      title: t('marketplace.myApplications.budget'),
      key: 'budget',
      align: 'right',
      render: (_, a) => (a.gig ? `${Number(a.gig.budget).toLocaleString()} RWF` : '—'),
    },
    {
      title: t('marketplace.myApplications.status'),
      key: 'status',
      render: (_, a) => <StatusTag status={a.status} />,
    },
    {
      title: t('marketplace.myApplications.applied'),
      key: 'applied',
      render: (_, a) => fromNow(a.createdAt),
    },
  ];

  if (!loading && apps.length === 0) {
    return (
      <Card>
        <Empty description={t('common.noApplications')} />
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
