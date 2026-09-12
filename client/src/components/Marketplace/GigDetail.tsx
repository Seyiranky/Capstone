import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Flex,
  Result,
  Row,
  Skeleton,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import { EditOutlined, HomeOutlined } from '@ant-design/icons';
import GigForm from './GigForm';
import type { ColumnsType } from 'antd/es/table';
import { useAppSelector } from '../../store/hooks';
import { gigApi } from '../../api/gigApi';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import { adminApi } from '../../api/adminApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import ChatThread from '../common/ChatThread';
import { gigImageSrc } from '../../utils/gigImage';
import { locationName } from '../../utils/locationName';
import type { Gig, GigApplication } from '../../types';

const MetaRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Flex justify="space-between" align="center" gap={12} style={{ padding: '9px 0' }}>
    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
      {label}
    </Typography.Text>
    <span style={{ textAlign: 'right', fontWeight: 500 }}>{children}</span>
  </Flex>
);

const GigDetail = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const { role, profile } = useAppSelector((state) => state.auth);
  const [gig, setGig] = useState<Gig | null>(null);
  const [applications, setApplications] = useState<GigApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const refresh = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([gigApi.getGig(id), gigApplicationApi.listApplications({ gigId: id })])
      .then(([gigData, applicationsData]) => {
        setGig(gigData);
        setApplications(applicationsData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!gig) return <Result status="404" title={t('marketplace.gigDetail.notFound')} />;

  const isOwner = role === 'client' && profile?.id === gig.clientId;
  const myApplication =
    role === 'worker' ? applications.find((a) => a.workerId === profile?.id) : undefined;
  const sortedApplicants = [...applications].sort(
    (a, b) => (b.worker?.trustScore ?? 0) - (a.worker?.trustScore ?? 0),
  );
  const cover = gigImageSrc(gig);
  const loc = locationName(gig.locationLat, gig.locationLng);

  const handleApply = async () => {
    if (!id) return;
    setApplying(true);
    try {
      await gigApplicationApi.applyToGig(id);
      message.success('Application sent to the client.');
      refresh();
    } catch {
      message.error('Could not send your application.');
    } finally {
      setApplying(false);
    }
  };

  const handleGigDecision = async (decision: 'approved' | 'rejected') => {
    if (!id) return;
    setBusyId(id);
    try {
      await adminApi.reviewGig(id, decision);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleApplicationDecision = async (
    applicationId: string,
    decision: 'approved' | 'rejected',
  ) => {
    setBusyId(applicationId);
    try {
      await gigApplicationApi.reviewApplication(applicationId, decision);
      message.success(decision === 'approved' ? 'Applicant approved.' : 'Applicant rejected.');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const applicantColumns: ColumnsType<GigApplication> = [
    {
      title: 'Worker',
      key: 'worker',
      render: (_, a) =>
        a.worker ? <IdentityLink id={a.worker.id} name={a.worker.name} size={26} /> : '—',
    },
    { title: 'Trust', key: 'trust', width: 80, render: (_, a) => a.worker?.trustScore.toFixed(1) ?? '—' },
    { title: 'Status', key: 'status', width: 110, render: (_, a) => <StatusTag status={a.status} /> },
    {
      title: '',
      key: 'actions',
      width: 170,
      render: (_, a) =>
        role === 'admin' && a.status === 'pending' ? (
          <Space>
            <Button
              size="small"
              type="primary"
              loading={busyId === a.id}
              onClick={() => handleApplicationDecision(a.id, 'approved')}
            >
              {t('marketplace.gigDetail.approve')}
            </Button>
            <Button
              size="small"
              danger
              loading={busyId === a.id}
              onClick={() => handleApplicationDecision(a.id, 'rejected')}
            >
              {t('marketplace.gigDetail.reject')}
            </Button>
          </Space>
        ) : null,
    },
  ];

  const showChat = role === 'worker' && gig.client;

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 14 }}
        items={[
          { title: <Link to="/dashboard"><HomeOutlined /></Link> },
          { title: <Link to="/marketplace">{t('sidebar.marketplace')}</Link> },
          { title: gig.title },
        ]}
      />
      {/* Header */}
      <Space size={8} style={{ marginBottom: 8 }}>
        <Tag
          style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em', margin: 0 }}
        >
          {gig.skill?.name}
        </Tag>
        {gig.status !== 'open' && <StatusTag status={gig.status} />}
      </Space>
      <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {gig.title}
        </Typography.Title>
        {isOwner && (
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Edit gig
          </Button>
        )}
      </Flex>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={15}>
          {cover && (
            <div
              style={{
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid var(--ant-color-border-secondary, #e4e4e7)',
                marginBottom: 20,
              }}
            >
              <img
                src={cover}
                alt=""
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          )}

          <Card title="About this gig">
            <Typography.Paragraph style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
              {gig.description}
            </Typography.Paragraph>
          </Card>

          {isOwner && (gig.status === 'pending_review' || gig.status === 'rejected') && (
            <Card style={{ marginTop: 20 }}>
              <Typography.Text type={gig.status === 'rejected' ? 'danger' : 'secondary'}>
                {gig.status === 'rejected'
                  ? t('marketplace.gigDetail.rejectedNotice')
                  : t('marketplace.gigDetail.pendingReviewNotice')}
              </Typography.Text>
            </Card>
          )}

          {role === 'admin' && gig.status === 'pending_review' && (
            <Card style={{ marginTop: 20 }} title={t('marketplace.gigDetail.approveThisGig')}>
              <Typography.Paragraph type="secondary">
                {t('marketplace.gigDetail.approveInstructions')}
              </Typography.Paragraph>
              <Space>
                <Button
                  type="primary"
                  loading={busyId === id}
                  onClick={() => handleGigDecision('approved')}
                >
                  {t('marketplace.gigDetail.approve')}
                </Button>
                <Button danger loading={busyId === id} onClick={() => handleGigDecision('rejected')}>
                  {t('marketplace.gigDetail.reject')}
                </Button>
              </Space>
            </Card>
          )}

          {role === 'worker' && myApplication && (
            <Card style={{ marginTop: 20 }} title={t('marketplace.gigDetail.yourApplication')}>
              <Flex align="center" gap={10} style={{ marginBottom: 16 }}>
                <StatusTag status={myApplication.status} />
                <Typography.Text type="secondary">
                  {myApplication.status === 'approved'
                    ? "You're approved for this gig."
                    : myApplication.status === 'rejected'
                      ? 'This application was not accepted.'
                      : 'Your application is with the reviewer.'}
                </Typography.Text>
              </Flex>
              <Steps
                size="small"
                progressDot
                current={myApplication.status === 'approved' ? 2 : 1}
                status={myApplication.status === 'rejected' ? 'error' : 'process'}
                items={[{ title: 'Applied' }, { title: 'Under review' }, { title: 'Approved' }]}
              />
            </Card>
          )}

          {(role === 'admin' || isOwner) && (
            <Card
              style={{ marginTop: 20 }}
              title={t('marketplace.gigDetail.applicants', { count: applications.length })}
            >
              {applications.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('marketplace.gigDetail.noApplicationsYet')}
                />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={applicantColumns}
                  dataSource={sortedApplicants}
                />
              )}
            </Card>
          )}
        </Col>

        {/* Sidebar */}
        <Col xs={24} lg={9}>
          <div style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Budget
              </Typography.Text>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>
                {Number(gig.budget).toLocaleString()}{' '}
                <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>RWF</span>
              </div>

              <Divider style={{ margin: '14px 0' }} />

              <MetaRow label="Category">{gig.skill?.name}</MetaRow>
              <MetaRow label="Location">{loc ?? '—'}</MetaRow>
              <MetaRow label={t('marketplace.gigDetail.postedBy')}>
                {gig.client ? (
                  <IdentityLink id={gig.client.id} name={gig.client.name} size={20} />
                ) : (
                  '—'
                )}
              </MetaRow>

              {role === 'worker' && !myApplication && (
                <>
                  <Divider style={{ margin: '14px 0' }} />
                  {gig.status === 'open' ? (
                    <Button type="primary" size="large" block loading={applying} onClick={handleApply}>
                      {t('marketplace.gigDetail.applyButton')}
                    </Button>
                  ) : (
                    <Typography.Text type="secondary">
                      {gig.status === 'pending_review'
                        ? t('marketplace.gigDetail.awaitingApprovalNotice')
                        : t('marketplace.gigDetail.noLongerAcceptingNotice')}
                    </Typography.Text>
                  )}
                </>
              )}
            </Card>

            {showChat && gig.client && (
              <Card title={t('marketplace.gigDetail.messageClient')}>
                <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                  {t('marketplace.gigDetail.messageClientHint', { name: gig.client.name })}
                </Typography.Paragraph>
                <ChatThread
                  recipientId={gig.client.id}
                  recipientName={gig.client.name}
                  placeholder={t('marketplace.gigDetail.messagePlaceholder', {
                    name: gig.client.name,
                  })}
                  emptyText={t('marketplace.gigDetail.messageEmpty')}
                />
              </Card>
            )}
          </div>
        </Col>
      </Row>

      <Drawer
        title="Edit gig"
        width={480}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        destroyOnHidden
      >
        <GigForm
          gig={gig}
          onPosted={() => {
            setEditOpen(false);
            refresh();
          }}
        />
      </Drawer>
    </div>
  );
};

export default GigDetail;
