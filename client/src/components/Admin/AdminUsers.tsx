import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Input, Popconfirm, Space, Table, Tag } from 'antd';
import { DeleteOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import { useAppSelector } from '../../store/hooks';
import PageContainer from '../Layout/PageContainer';
import AdminNav from './AdminNav';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { User } from '../../types';

const AdminUsers = () => {
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
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
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
      align: 'right',
      width: 90,
      sorter: (a, b) => a.trustScore - b.trustScore,
      render: (v: number) => v.toFixed(1),
    },
    {
      title: 'Joined',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      render: (d?: string) => (d ? new Date(d).toLocaleDateString() : '—'),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, u) => {
        const isSelf = u.id === profile?.id;
        if (u.role === 'admin' || isSelf) {
          return <span style={{ color: '#a1a1aa' }}>{isSelf ? 'You' : '—'}</span>;
        }
        return (
          <Space>
            {u.status === 'active' ? (
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={busyId === u.id}
                onClick={() => moderate(u, 'suspend')}
                aria-label={`Suspend ${u.name}`}
              />
            ) : (
              <Button
                size="small"
                icon={<UndoOutlined />}
                loading={busyId === u.id}
                onClick={() => moderate(u, 'activate')}
                aria-label={`Reactivate ${u.name}`}
              />
            )}
            <Popconfirm
              title={`Delete ${u.name}?`}
              description="Permanently removes their account and everything tied to it."
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(u)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${u.name}`} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="Users"
      subtitle="Suspend an account to block sign-in immediately, or delete it permanently."
    >
      <AdminNav />
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
