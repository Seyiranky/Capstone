import { useEffect, useMemo, useState } from 'react';
import { App, Card, Input, Table, Tag } from 'antd';
import { DeleteOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import { useAppSelector } from '../../store/hooks';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import ActionMenu from '../common/ActionMenu';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { User } from '../../types';

const AdminUsers = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { profile } = useAppSelector((state) => state.auth);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const refresh = () => {
    setLoading(true);
    adminApi
      .listUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const moderate = async (user: User, action: 'suspend' | 'activate') => {
    setBusyId(user.id);
    try {
      const updated = await adminApi.moderateUser(user.id, action);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      message.error(`Could not ${action} ${user.name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (user: User) => {
    setBusyId(user.id);
    try {
      await adminApi.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      message.success(`${user.name} deleted.`);
    } catch {
      message.error(`Could not delete ${user.name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const columns: ColumnsType<User> = [
    {
      title: 'Name',
      key: 'name',
      render: (_, u) => <IdentityLink id={u.id} name={u.name} size={26} />,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    { title: 'Email', dataIndex: 'email', key: 'email', responsive: ['md'] },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      responsive: ['sm'],
      filters: [
        { text: 'Worker', value: 'worker' },
        { text: 'Client', value: 'client' },
        { text: 'Admin', value: 'admin' },
      ],
      onFilter: (v, u) => u.role === v,
      render: (r: string) => <Tag style={{ textTransform: 'capitalize' }}>{r}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Suspended', value: 'suspended' },
      ],
      onFilter: (v, u) => u.status === v,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: 'Trust',
      dataIndex: 'trustScore',
      key: 'trustScore',
      responsive: ['md'],
      align: 'right',
      width: 90,
      sorter: (a, b) => a.trustScore - b.trustScore,
      render: (v: number) => v.toFixed(1),
    },
    {
      title: 'Joined',
      dataIndex: 'createdAt',
      key: 'createdAt',
      responsive: ['md'],
      sorter: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      render: (d?: string) => (d ? new Date(d).toLocaleDateString() : '—'),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      fixed: 'right',
      render: (_, u) => {
        const isSelf = u.id === profile?.id;
        if (u.role === 'admin' || isSelf) {
          return <span style={{ color: 'var(--isoko-muted)' }}>{isSelf ? 'You' : '—'}</span>;
        }
        return (
          <ActionMenu
            size="small"
            disabled={busyId === u.id}
            actions={[
              u.status === 'active'
                ? {
                    key: 'suspend',
                    label: t('actions.suspend'),
                    icon: <StopOutlined />,
                    danger: true,
                    confirmTitle: t('actions.suspendTitle', { name: u.name }),
                    confirmBody: t('actions.suspendBody'),
                    onConfirm: () => moderate(u, 'suspend'),
                  }
                : {
                    key: 'activate',
                    label: t('actions.reactivate'),
                    icon: <UndoOutlined />,
                    confirmTitle: t('actions.reactivateTitle', { name: u.name }),
                    onConfirm: () => moderate(u, 'activate'),
                  },
              {
                key: 'delete',
                label: t('actions.delete'),
                icon: <DeleteOutlined />,
                danger: true,
                confirmTitle: t('actions.deleteTitle', { name: u.name }),
                confirmBody: t('actions.deleteBody'),
                onConfirm: () => remove(u),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <PageContainer
      title={t('adminNav.users')}
      subtitle={t('adminNav.usersSub')}
    >
      <Card>
        <Input.Search
          placeholder="Search name or email"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320, marginBottom: 16 }}
        />
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminUsers;
