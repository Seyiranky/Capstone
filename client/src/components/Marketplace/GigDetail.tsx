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
  Checkbox,
  Flex,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AudioOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import ActionMenu from '../common/ActionMenu';
import ProtectionCard from './ProtectionCard';
import { fromNow } from '../../lib/time';
import WorkerPicker from '../Team/WorkerPicker';
import GigForm from './GigForm';
import ApplicantList from './ApplicantList';
import ApplyRequirements from './ApplyRequirements';
import ApplicationProgress from './ApplicationProgress';
import RejectionNotice from './RejectionNotice';
import RateHint from './RateHint';
import { useAppSelector } from '../../store/hooks';
import { gigApi } from '../../api/gigApi';
import { gigApplicationApi, type ApplyEligibility } from '../../api/gigApplicationApi';
import { matchApi } from '../../api/matchApi';
import { adminApi } from '../../api/adminApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import ChatThread from '../common/ChatThread';
import GigCover from '../common/GigCover';
import VoiceNotePlayer from '../Voice/VoiceNotePlayer';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { locationName } from '../../utils/locationName';
import type { Gig, GigApplication, RejectionReason } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';

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
  // For a worker: whether they may apply, checked by the same rules the server enforces.
  const [eligibility, setEligibility] = useState<ApplyEligibility | null>(null);
  // A worker already invited to this gig confirms the invitation rather than applying.
  const [invited, setInvited] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null);
  const [quoteNote, setQuoteNote] = useState('');
  const [crewOn, setCrewOn] = useState(false);
  const [crew, setCrew] = useState<{ userId?: string; sharePercent: number }[]>([]);
  const crewTotal = crew.reduce((sum, c) => sum + (c.sharePercent || 0), 0);
  const crewValid =
    !crewOn || (crew.length > 0 && crew.every((c) => c.userId && c.sharePercent >= 1) && crewTotal <= 90);
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

  useEffect(() => {
    if (role !== 'worker' || !id) return;
    gigApplicationApi.eligibility(id).then(setEligibility).catch(() => setEligibility(null));
    matchApi
      .listMatches()
      .then((all) => setInvited(all.some((m) => m.gigId === id && m.status === 'pending' && m.workerId === profile?.id)))
      .catch(() => setInvited(false));
  }, [role, id]);

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
  const loc = locationName(gig.locationLat, gig.locationLng);

  const handleApply = async () => {
    if (!id) return;
    setApplying(true);
    try {
      await gigApplicationApi.applyToGig(id, {
        // Quoting the budget itself is the same as not quoting.
        quoteAmount: quoteAmount && quoteAmount !== Number(gig.budget) ? quoteAmount : null,
        quoteNote: quoteNote.trim() || undefined,
        crew: crewOn ? crew.map((c) => ({ userId: c.userId as string, sharePercent: c.sharePercent })) : undefined,
      });
      setApplyOpen(false);
      message.success(t('marketplace.gigDetail.applySent'));
      refresh();
    } catch (err) {
      message.error(apiErrorMessage(err, t('marketplace.gigDetail.applyFailed')));
    } finally {
      setApplying(false);
    }
  };

  const handleGigDecision = async (decision: 'approved' | 'rejected', note?: string) => {
    if (!id) return;
    setBusyId(id);
    try {
      await adminApi.reviewGig(id, decision, note);
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
      {/* Header: the title and one line of facts, the owner's edit action on the right. */}
      <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap" style={{ marginBottom: 24 }}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <Typography.Title level={2} style={{ margin: 0, fontFamily: 'var(--font-heading)', lineHeight: 1.25 }}>
            {gig.title}
          </Typography.Title>
          <Flex align="center" gap="6px 14px" wrap="wrap" style={{ marginTop: 10 }}>
            {gig.skill?.name && <Tag style={{ margin: 0 }}>{gig.skill.name}</Tag>}
            {loc && (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                <EnvironmentOutlined /> {loc}
              </Typography.Text>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              <ClockCircleOutlined /> {t('marketplace.gigDetail.posted', { when: fromNow(gig.createdAt) })}
            </Typography.Text>
            <StatusTag status={gig.status} />
          </Flex>
        </div>
        {/* Editable until a worker is matched; the server refuses later edits. */}
        {isOwner && (gig.status === 'pending_review' || gig.status === 'open') && (
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            {t('common.editGig')}
          </Button>
        )}
      </Flex>

      <Row gutter={[24, 24]}>
        <Col xs={24} xl={15}>
          <div
            style={{
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--ant-color-border-secondary, #e4e4e7)',
              marginBottom: 20,
            }}
          >
            <GigCover gig={gig} style={{ height: 300 }} />
          </div>

          <Card title={t('common.about')}>
            <Typography.Paragraph style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
              {gig.description}
            </Typography.Paragraph>
            {gig.voiceNoteUrl && (
              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--isoko-border)',
                }}
              >
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                  <AudioOutlined /> {t('voice.gigListen')}
                </Typography.Text>
                <VoiceNotePlayer
                  src={resolveAssetUrl(gig.voiceNoteUrl) ?? ''}
                  durationSec={gig.voiceNoteDurationSec}
                  width="100%"
                />
              </div>
            )}
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
            <Card
              style={{ marginTop: 20 }}
              title={t('marketplace.gigDetail.approveThisGig')}
              extra={
                <ActionMenu
                  disabled={busyId === id}
                  actions={[
                    {
                      key: 'approve',
                      label: t('gigApproval.approve'),
                      icon: <CheckOutlined />,
                      confirmTitle: t('gigApproval.approveTitle', { title: gig.title }),
                      confirmBody: t('gigApproval.approveBody'),
                      onConfirm: () => handleGigDecision('approved'),
                    },
                    {
                      key: 'reject',
                      label: t('gigApproval.reject'),
                      icon: <CloseOutlined />,
                      danger: true,
                      confirmTitle: t('gigApproval.rejectTitle', { title: gig.title }),
                      confirmLabel: t('gigApproval.confirmReject'),
                      reason: { placeholder: t('gigApproval.rejectReason') },
                      onConfirm: (reason) => handleGigDecision('rejected', reason),
                    },
                  ]}
                />
              }
            >
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                {t('marketplace.gigDetail.approveInstructions')}
              </Typography.Paragraph>
            </Card>
          )}

        {showChat && gig.client && (
          <Card style={{ marginTop: 20 }} title={t('marketplace.gigDetail.messageClient')}>
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

          {role === 'worker' && myApplication && (
            <Card style={{ marginTop: 20 }} title={t('marketplace.gigDetail.yourApplication')}>
              <Flex align="center" gap="6px 10px" wrap="wrap" style={{ marginBottom: 16 }}>
                <StatusTag status={myApplication.status} />
                <Typography.Text type="secondary">
                  {myApplication.status === 'approved'
                    ? t('marketplace.gigDetail.applicationApprovedNote')
                    : myApplication.status === 'rejected'
                      ? t('marketplace.gigDetail.applicationRejectedNote')
                      : myApplication.status === 'expired'
                        ? t('applyRules.expiredNote')
                        : myApplication.status === 'withdrawn'
                          ? t('applyRules.withdrawnNote')
                          : t('applyRules.pendingNote')}
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

          {/* An empty applicants box only makes sense while the gig is still looking for someone. */}
          {(role === 'admin' || isOwner) && (applications.length > 0 || ['pending_review', 'open'].includes(gig.status)) && (
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
                  canDecide={isOwner || role === 'admin'}
                  busyId={busyId}
                  onDecide={handleApplicationDecision}
                />
              )}
            </Card>
          )}
        </Col>

        {/* Sidebar */}
        <Col xs={24} xl={9}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Budget
              </Typography.Text>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>
                {Number(gig.budget).toLocaleString()}{' '}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--isoko-muted)' }}>RWF</span>
              </div>

              <Divider style={{ margin: '14px 0' }} />

              <MetaRow label={t('common.category')}>{gig.skill?.name}</MetaRow>
              <MetaRow label={t('common.location')}>{loc ?? '—'}</MetaRow>
              {gig.sensitive && (
                <Tooltip title={t('applyRules.sensitiveTip')}>
                  <span className="isoko-sensitive-tag">
                    <SafetyOutlined /> {t('applyRules.sensitiveTag')}
                  </span>
                </Tooltip>
              )}

              {role === 'worker' && !myApplication && (
                <>
                  <Divider style={{ margin: '14px 0' }} />
                  {gig.status === 'open' && invited ? (
                    <div className="isoko-invited-note">
                      <strong>{t('applyRules.invitedTitle')}</strong>
                      <span>{t('applyRules.invitedBody')}</span>
                      <Link to="/marketplace?tab=matches">{t('applyRules.invitedLink')}</Link>
                    </div>
                  ) : gig.status === 'open' && eligibility && !eligibility.eligible ? (
                    <ApplyRequirements missing={eligibility.missing} sensitive={eligibility.sensitive} />
                  ) : gig.status === 'open' ? (
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

            {gig.client && (
              <Card title={t('marketplace.gigDetail.aboutClient')}>
                <IdentityLink id={gig.client.id} name={gig.client.name} size={36} src={gig.client.avatarUrl} />
                <div style={{ marginTop: 12 }}>
                  <MetaRow label={t('dashboard.trustScore')}>
                    {gig.client.reviewCount ? `${Number(gig.client.trustScore).toFixed(1)} / 5` : t('match.reason.trustProvisional')}
                  </MetaRow>
                  <MetaRow label={t('marketplace.gigDetail.reviewsReceived')}>{gig.client.reviewCount ?? 0}</MetaRow>
                  {gig.client.createdAt && (
                    <MetaRow label={t('marketplace.gigDetail.memberSince')}>
                      {new Date(gig.client.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </MetaRow>
                  )}
                </div>
              </Card>
            )}

            <ProtectionCard />

          </div>
        </Col>
      </Row>

      <Modal
        open={applyOpen}
        title={t('quote.applyTitle', { title: gig.title })}
        okText={t('quote.submit')}
        confirmLoading={applying}
        onOk={handleApply}
        okButtonProps={{ disabled: !quoteAmount || quoteAmount < 100 || !crewValid }}
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
        <Checkbox
          checked={crewOn}
          onChange={(e) => {
            setCrewOn(e.target.checked);
            if (e.target.checked && crew.length === 0) setCrew([{ sharePercent: 20 }]);
          }}
        >
          {t('team.crewApply')}
        </Checkbox>
        {crewOn && (
          <div style={{ marginTop: 8 }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              {t('team.crewHelp')}
            </Typography.Paragraph>
            <Flex vertical gap={8}>
              {crew.map((c, i) => (
                <Flex key={i} gap={6} align="center">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <WorkerPicker
                      value={c.userId}
                      exclude={crew.map((x) => x.userId ?? '').concat(profile?.id ?? '')}
                      onChange={(id) => setCrew((cur) => cur.map((x, j) => (j === i ? { ...x, userId: id } : x)))}
                    />
                  </div>
                  <InputNumber
                    min={1}
                    max={90}
                    value={c.sharePercent}
                    onChange={(v) => setCrew((cur) => cur.map((x, j) => (j === i ? { ...x, sharePercent: v ?? 1 } : x)))}
                    addonAfter="%"
                    style={{ width: 96 }}
                  />
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="Remove"
                    onClick={() => setCrew((cur) => cur.filter((_, j) => j !== i))}
                  />
                </Flex>
              ))}
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
              {crew.length < 4 ? (
                <Button size="small" onClick={() => setCrew((cur) => [...cur, { sharePercent: 10 }])}>
                  {t('team.addMember')}
                </Button>
              ) : (
                <span />
              )}
              <Typography.Text type={crewTotal > 90 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                {t('team.youKeep', { percent: 100 - crewTotal })}
              </Typography.Text>
            </Flex>
          </div>
        )}
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
