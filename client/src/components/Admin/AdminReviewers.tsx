import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Card, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { isAxiosError } from 'axios';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import type { User } from '../../types';

/**
 * Who reviews skill evidence. Admins review by default; a worker can be enrolled
 * as a peer once they have a verified skill and a record (the server enforces
 * it and says why when it refuses). Which reviewer sees which submission is
 * still decided by the rotation rules, never chosen here.
 */
const AdminReviewers = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    adminApi
      .listUsers()
      .then((all) => setUsers(all.filter((u) => u.role === 'worker' || u.role === 'admin')))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const setTier = async (user: User, tier: 'admin' | 'peer' | null) => {
    try {
      await adminApi.setReviewerTier(user.id, tier);
      message.success(`${user.name}: ${tier ?? 'not a reviewer'}`);
      refresh();
    } catch (error) {
      message.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Could not change') : 'Could not change');
    }
  };

  const columns: ColumnsType<User> = [
    { title: 'Name', key: 'name', render: (_, u) => <IdentityLink id={u.id} name={u.name} size={24} /> },
    { title: 'Role', dataIndex: 'role', key: 'role', responsive: ['sm'], render: (r: string) => <Tag>{r}</Tag> },
    {
      title: 'Trust',
      key: 'trust',
      responsive: ['md'],
      render: (_, u) => (u.reviewCount ? `${u.trustScore.toFixed(1)} · ${u.reviewCount} reviews` : 'New'),
    },
    {
      title: 'Reviewer',
      key: 'tier',
      render: (_, u) =>
        u.role === 'admin' ? (
          <Tag color="blue">admin</Tag>
        ) : (
          <Select
            size="small"
            value={u.reviewerTier ?? 'none'}
            style={{ width: 130 }}
            onChange={(v) => setTier(u, v === 'none' ? null : (v as 'peer'))}
            options={[
              { value: 'none', label: 'Not a reviewer' },
              { value: 'peer', label: 'Peer reviewer' },
            ]}
          />
        ),
    },
  ];

  const peers = users.filter((u) => u.reviewerTier === 'peer').length;

  return (
    <PageContainer title={t('adminNav.reviewers')} subtitle={t('adminNav.reviewersSub')}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {peers} peer reviewer{peers === 1 ? '' : 's'} enrolled. Peers need a verified skill and at least two reviews of
        their own work.
      </Typography.Paragraph>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={users}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminReviewers;
