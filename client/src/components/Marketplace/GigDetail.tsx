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
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { EditOutlined, HomeOutlined } from '@ant-design/icons';
import GigForm from './GigForm';
import ApplicantList from './ApplicantList';
import ApplicationProgress from './ApplicationProgress';
import RejectionNotice from './RejectionNotice';
import RateHint from './RateHint';
import { useAppSelector } from '../../store/hooks';
import { gigApi } from '../../api/gigApi';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import { adminApi } from '../../api/adminApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import ChatThread from '../common/ChatThread';
import { gigImageSrc } from '../../utils/gigImage';
import { locationName } from '../../utils/locationName';
import type { Gig, GigApplication, RejectionReason } from '../../types';

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
  const [applyOpen, setApplyOpen] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null);
  const [quoteNote, setQuoteNote] = useState('');
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
  // Ranked by the combined match score (distance, trust, skill fit,
  // availability) rather than trust alone, falling back to trust for
  // applications submitted before scoring existed.
  const sortedApplicants = [...applications].sort((a, b) => {
    const aScore = a.rankScore ?? null;
    const bScore = b.rankScore ?? null;
    if (aScore !== null && bScore !== null) return bScore - aScore;
    if (aScore !== null) return -1;
    if (bScore !== null) return 1;
    return (b.worker?.trustScore ?? 0) - (a.worker?.trustScore ?? 0);
  });
  const cover = gigImageSrc(gig);
  const loc = locationName(gig.locationLat, gig.locationLng);

  const handleApply = async () => {
    if (!id) return;
    setApplying(true);
    try {
      await gigApplicationApi.applyToGig(id, {
        // Quoting the budget itself is the same as not quoting.
        quoteAmount: quoteAmount && quoteAmount !== Number(gig.budget) ? quoteAmount : null,
        quoteNote: quoteNote.trim() || undefined,
      });
      setApplyOpen(false);
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
    rejection?: { reason: RejectionReason; note?: string },
  ) => {
    setBusyId(applicationId);
    try {
      await gigApplicationApi.reviewApplication(applicationId, decision, rejection);
      message.success(decision === 'approved' ? 'Applicant approved.' : 'Applicant rejected.');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

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

          <Card title={t('common.about')}>
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
              <Flex align="center" gap="6px 10px" wrap="wrap" style={{ marginBottom: 16 }}>
                <StatusTag status={myApplication.status} />
                <Typography.Text type="secondary">
                  {myApplication.status === 'approved'
                    ? t('marketplace.gigDetail.applicationApprovedNote')
                    : myApplication.status === 'rejected'
                      ? t('marketplace.gigDetail.applicationRejectedNote')
                      : t('marketplace.gigDetail.applicationPendingNote')}
                </Typography.Text>
              </Flex>
              <ApplicationProgress status={myApplication.status} />
              <RejectionNotice application={myApplication} />
              {myApplication.quoteAmount != null && (
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 14, fontSize: 13 }}>
                  {t('quote.yourQuote')}:{' '}
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {Number(myApplication.quoteAmount).toLocaleString()} RWF
                  </Typography.Text>
                  {myApplication.quoteNote ? ` · ${myApplication.quoteNote}` : ''}
                </Typography.Text>
              )}
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
                <ApplicantList
                  applicants={sortedApplicants}
                  budget={Number(gig.budget)}
                  canDecide={role === 'admin'}
                  busyId={busyId}
                  onDecide={handleApplicationDecision}
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

              <MetaRow label={t('common.category')}>{gig.skill?.name}</MetaRow>
              <MetaRow label={t('common.location')}>{loc ?? '—'}</MetaRow>
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
                    <Button
                      type="primary"
                      size="large"
                      block
                      onClick={() => {
                        setQuoteAmount(Number(gig.budget));
                        setApplyOpen(true);
                      }}
                    >
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

      <Modal
        open={applyOpen}
        title={t('quote.applyTitle', { title: gig.title })}
        okText={t('quote.submit')}
        confirmLoading={applying}
        onOk={handleApply}
        okButtonProps={{ disabled: !quoteAmount || quoteAmount < 100 }}
        onCancel={() => setApplyOpen(false)}
        destroyOnHidden
      >
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          {t('quote.priceLabel')}
        </Typography.Text>
        <InputNumber
          value={quoteAmount}
          onChange={(v) => setQuoteAmount(v)}
          min={100}
          max={99_999_999}
          step={1000}
          style={{ width: '100%' }}
          formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v ?? '').replace(/,/g, ''))}
          addonAfter="RWF"
        />
        <RateHint skillId={gig.skillId} amount={quoteAmount} audience="worker" />
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: '6px 0 16px' }}>
          {t('quote.priceHelp', { budget: Number(gig.budget).toLocaleString() })}
        </Typography.Paragraph>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          {t('quote.noteLabel')}
        </Typography.Text>
        <Input.TextArea
          rows={3}
          maxLength={280}
          showCount
          value={quoteNote}
          onChange={(e) => setQuoteNote(e.target.value)}
          placeholder={t('quote.notePlaceholder')}
          style={{ marginBottom: 16 }}
        />
      </Modal>

      <Drawer
        title={t('common.editGig')}
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
