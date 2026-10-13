import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, Empty, Flex, Grid, List, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import StatusTag from '../common/StatusTag';
import RejectionNotice from './RejectionNotice';
import { fromNow } from '../../lib/time';
import type { GigApplication } from '../../types';

const MyApplications = () => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<GigApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const screens = Grid.useBreakpoint();

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
      // The reason sits under the title, where it has the row's width on a phone.
      render: (_, a) => (
        <>
          {a.gig ? <Link to={`/gigs/${a.gigId}`}>{a.gig.title}</Link> : a.gigId}
          <RejectionNotice application={a} />
        </>
      ),
    },
    {
      title: t('marketplace.myApplications.category'),
      key: 'category',
      responsive: ['md'],
      render: (_, a) => a.gig?.skill?.name ?? '—',
    },
    {
      title: t('marketplace.myApplications.budget'),
      key: 'budget',
      responsive: ['sm'],
      align: 'right',
      // The worker's own quote when they gave one, since that is the price on the table.
      render: (_, a) =>
        a.quoteAmount != null
          ? `${Number(a.quoteAmount).toLocaleString()} RWF`
          : a.gig
            ? `${Number(a.gig.budget).toLocaleString()} RWF`
            : '—',
    },
    {
      title: t('marketplace.myApplications.status'),
      key: 'status',
      render: (_, a) => <StatusTag status={a.status} />,
    },
    {
      title: t('marketplace.myApplications.applied'),
      key: 'applied',
      responsive: ['sm'],
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

  // Phones get a list: the table sizes itself to its widest cell and pushes the
  // status off screen.
  if (!screens.sm) {
    return (
      <Card styles={{ body: { paddingBlock: 4 } }}>
        <List
          loading={loading}
          dataSource={apps}
          renderItem={(a) => (
            <List.Item style={{ paddingInline: 0 }}>
              <Flex justify="space-between" align="flex-start" gap={12} style={{ width: '100%' }}>
                <div style={{ minWidth: 0 }}>
                  {a.gig ? <Link to={`/gigs/${a.gigId}`}>{a.gig.title}</Link> : a.gigId}
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {a.quoteAmount != null
                      ? `${Number(a.quoteAmount).toLocaleString()} RWF`
                      : a.gig
                        ? `${Number(a.gig.budget).toLocaleString()} RWF`
                        : ''}{' '}
                    · {fromNow(a.createdAt)}
                  </Typography.Text>
                  <RejectionNotice application={a} />
                </div>
                <StatusTag status={a.status} />
              </Flex>
            </List.Item>
          )}
        />
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
