import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Col, Empty, Flex, Modal, Row, Typography } from 'antd';
import {
  AuditOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileDoneOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchMatches } from '../../store/slices/matchSlice';
import { skillTaskApi } from '../../api/skillTaskApi';
import { transactionApi } from '../../api/transactionApi';
import { userApi } from '../../api/userApi';
import { adminApi } from '../../api/adminApi';
import { gigApi } from '../../api/gigApi';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import { awaitingPayment, countsAsMoved, movedAt } from '../../lib/money';
import HeroBanner from '../common/HeroBanner';
import StatTile from '../common/StatTile';
import StatusTag from '../common/StatusTag';
import ProvenanceTag from '../common/ProvenanceTag';
import ActivityFeed from './ActivityFeed';
import AttentionList from './AttentionList';
import GigsForYou from './GigsForYou';
import EarningsByMonth from './EarningsByMonth';
import OnboardingChecklist, { type ChecklistItem } from './OnboardingChecklist';
import SkillVerificationForm from '../Verification/SkillVerificationForm';
import GigApprovalQueue from '../Admin/GigApprovalQueue';
import type { AdminPayments, Gig, SkillCategory, SkillTask, Transaction, UserSkill } from '../../types';

/** A side panel row: a label on the left, a value or link on the right. */
const SideRow = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
  <Flex className="isoko-siderow" justify="space-between" align="center" gap={12} style={{ padding: '10px 0' }}>
    <Typography.Text type="secondary">{label}</Typography.Text>
    <span style={{ fontWeight: 600 }}>{children}</span>
  </Flex>
);

/**
 * The first screen after sign-in, built around what to do next.
 *
 * Every role gets the same shape: a header with the next action, four headline
 * numbers, a main column of things that need attention, and a narrow side
 * column for standing and history. History is kept short; the full record
 * lives on its own pages.
 */
const Dashboard = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { profile, role } = useAppSelector((state) => state.auth);
  const matches = useAppSelector((state) => state.matches.items);
  const [tasks, setTasks] = useState<SkillTask[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [myGigs, setMyGigs] = useState<Gig[]>([]);
  const [myApplicationCount, setMyApplicationCount] = useState(0);
  const [payments, setPayments] = useState<AdminPayments | null>(null);
  const [modal, setModal] = useState<'skill' | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Arriving from a "verify this skill" link on a rejected application opens the
  // add-skill flow straight away; the state is cleared so a refresh does not reopen it.
  useEffect(() => {
    if ((location.state as { openAddSkill?: boolean } | null)?.openAddSkill) {
      setModal('skill');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    dispatch(fetchMatches());
  }, [dispatch]);

  const refreshTasks = () => {
    skillTaskApi.listTasks(role === 'admin' ? { assignedToMe: true } : undefined).then(setTasks);
  };
  const refreshGigs = () => {
    adminApi.listGigs().then(setGigs);
  };

  useEffect(() => {
    if (role === 'worker' || role === 'admin') refreshTasks();
    if (role === 'worker' || role === 'client') transactionApi.listTransactions().then(setTransactions);
    if (role === 'admin') {
      refreshGigs();
      adminApi.payments().then(setPayments).catch(() => undefined);
    }
    if (role === 'worker') gigApplicationApi.listApplications().then((a) => setMyApplicationCount(a.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (role === 'worker' && profile) userApi.getUserSkills(profile.id).then(setSkills);
    if (role === 'client' && profile) {
      gigApi.listGigs().then((all) => setMyGigs(all.filter((g) => g.clientId === profile.id)));
    }
  }, [role, profile]);

  if (!profile || !role) return null;

  const isEarner = role === 'worker' || role === 'client';
  const pendingReviews = tasks.filter((x) => x.status === 'pending');
  const pendingGigs = gigs.filter((g) => g.status === 'pending_review');
  const activeMatches = matches.filter((m) => m.status === 'pending' || m.status === 'accepted');
  const moved = transactions.filter((x) => countsAsMoved(x, role));
  const amountOf = (x: Transaction) => Number(x.releasedAmount ?? x.amount);
  const total = moved.reduce((sum, x) => sum + amountOf(x), 0);
  const now = new Date();
  const thisMonth = moved
    .filter((x) => {
      const d = new Date(movedAt(x));
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, x) => sum + amountOf(x), 0);
  const due = awaitingPayment(matches, role, profile.id);
  const needsLocation = role === 'worker' && (profile.locationLat == null || profile.locationLng == null);
  const categories = skills
    .map((s) => s.skill?.category)
    .filter((c): c is SkillCategory => Boolean(c));

  const checklist: ChecklistItem[] =
    role === 'worker'
      ? [
          {
            key: 'loc',
            label: t('dashboard.checklist.addLocation'),
            done: profile.locationLat != null,
            to: '/settings?tab=profile',
            action: t('dashboard.checklist.setLocation'),
          },
          {
            key: 'skill',
            label: t('dashboard.checklist.submitSkill'),
            done: skills.length > 0 || tasks.length > 0,
            to: '/settings?tab=skills',
            action: t('dashboard.checklist.addSkill'),
          },
          {
            key: 'apply',
            label: t('dashboard.checklist.applyFirstGig'),
            // Work also comes by invitation, so a worker with any job has done this step.
            done: myApplicationCount > 0 || matches.length > 0,
            to: '/marketplace',
            action: t('dashboard.checklist.browseGigs'),
          },
        ]
      : role === 'client'
        ? [
            {
              key: 'bio',
              label: t('dashboard.checklist.addBio'),
              done: !!profile.bio,
              to: '/settings?tab=profile',
              action: t('dashboard.checklist.editProfile'),
            },
            {
              key: 'post',
              label: t('dashboard.checklist.postFirstGig'),
              done: myGigs.length > 0,
              to: '/marketplace?post=1',
              action: t('dashboard.checklist.postGig'),
            },
          ]
        : [];

  const firstName = profile.name.split(' ')[0];
  const actions =
    role === 'worker' ? (
      // Skills are added from the Skills card, beside the skills themselves.
      <Button type="primary" size="large" onClick={() => navigate('/marketplace')}>
        {t('dashboard.hero.findWork')}
      </Button>
    ) : role === 'client' ? (
      <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/marketplace?post=1')}>
        {t('dashboard.hero.postGig')}
      </Button>
    ) : (
      <Button type="primary" size="large" onClick={() => navigate('/admin/gigs/pending')}>
        {t('dashboard.hero.reviewGigs', { count: pendingGigs.length })}
      </Button>
    );

  const tiles: { key: string; node: React.ReactNode }[] =
    role === 'worker'
      ? [
          {
            key: 'trust',
            node: (
              <StatTile
                icon={<SafetyCertificateOutlined />}
                label={t('dashboard.trustScore')}
                value={profile.trustScoreBreakdown?.isProvisional ? '—' : profile.trustScore.toFixed(1)}
                suffix={profile.trustScoreBreakdown?.isProvisional ? undefined : '/ 5'}
              />
            ),
          },
          {
            key: 'month',
            node: (
              <StatTile
                icon={<WalletOutlined />}
                label={t('dashboard.thisMonth')}
                value={thisMonth.toLocaleString()}
                suffix="RWF"
                footer={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('dashboard.allTime', { amount: total.toLocaleString() })}
                  </Typography.Text>
                }
              />
            ),
          },
          {
            key: 'due',
            node: <StatTile icon={<ClockCircleOutlined />} label={t('dashboard.toBePaid')} value={due.amount.toLocaleString()} suffix="RWF" />,
          },
          {
            key: 'active',
            node: <StatTile icon={<ThunderboltOutlined />} label={t('dashboard.activeJobs')} value={activeMatches.length} />,
          },
        ]
      : role === 'client'
        ? [
            {
              key: 'open',
              node: (
                <StatTile
                  icon={<FileDoneOutlined />}
                  label={t('dashboard.openGigs')}
                  value={myGigs.filter((g) => g.status === 'open' || g.status === 'pending_review').length}
                />
              ),
            },
            {
              key: 'active',
              node: <StatTile icon={<ThunderboltOutlined />} label={t('dashboard.activeJobs')} value={activeMatches.length} />,
            },
            {
              key: 'due',
              node: <StatTile icon={<ClockCircleOutlined />} label={t(role === 'client' ? 'dashboard.toPay' : 'dashboard.toBePaid')} value={due.amount.toLocaleString()} suffix="RWF" />,
            },
            {
              key: 'paid',
              node: <StatTile icon={<DollarOutlined />} label={t('dashboard.totalPaid')} value={total.toLocaleString()} suffix="RWF" />,
            },
          ]
        : [
            {
              key: 'gigs',
              node: <StatTile icon={<ClockCircleOutlined />} label={t('dashboard.pendingGigApprovals')} value={pendingGigs.length} />,
            },
            {
              key: 'reviews',
              node: <StatTile icon={<SafetyCertificateOutlined />} label={t('dashboard.pendingReviews')} value={pendingReviews.length} />,
            },
            {
              key: 'disputes',
              node: <StatTile icon={<AuditOutlined />} label={t('dashboard.liveDisputes')} value={payments?.liveDisputes ?? '—'} />,
            },
            {
              key: 'due',
              node: (
                <StatTile
                  icon={<ClockCircleOutlined />}
                  label={t('dashboard.awaitingPayment')}
                  value={(payments?.totals.awaiting?.amount ?? 0).toLocaleString()}
                  suffix="RWF"
                />
              ),
            },
          ];

  return (
    <div>
      <HeroBanner
        eyebrow={now.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={t('dashboard.hero.greeting', { name: firstName })}
        subtitle={t(`dashboard.hero.sub_${role}`)}
        actions={actions}
      />

      {needsLocation && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 20 }}
          message={
            <>
              {t('dashboard.locationPromptBefore')} <Link to="/settings">{t('sidebar.settings')}</Link>{' '}
              {t('dashboard.locationPromptAfter')}
            </>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {tiles.map((tile) => (
          <Col xs={12} xl={6} key={tile.key}>
            {tile.node}
          </Col>
        ))}
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} xl={16}>
          <Flex vertical gap={20}>
            {isEarner && <AttentionList matches={matches} role={role} userId={profile.id} />}
            {role === 'worker' && <GigsForYou categories={categories} exclude={matches.map((m) => m.gigId)} />}
            {role === 'client' && (
              <Card
                title={t('dashboard.yourGigs')}
                extra={<Link to="/marketplace">{t('dashboard.seeAll')}</Link>}
                styles={{ body: { paddingBlock: myGigs.length ? 4 : 20 } }}
              >
                {myGigs.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noGigsYet')} />
                ) : (
                  myGigs.slice(0, 5).map((g, i) => (
                    <Link
                      key={g.id}
                      to={`/gigs/${g.id}`}
                      style={{
                        display: 'block',
                        color: 'inherit',
                        padding: '12px 0',
                        borderTop: i === 0 ? undefined : '1px solid var(--isoko-border)',
                      }}
                    >
                      <Flex justify="space-between" align="center" gap={12}>
                        <Typography.Text strong ellipsis style={{ minWidth: 0 }}>
                          {g.title}
                        </Typography.Text>
                        <Flex align="center" gap={12} style={{ flexShrink: 0 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                            {Number(g.budget).toLocaleString()} RWF
                          </Typography.Text>
                          <StatusTag status={g.status} />
                        </Flex>
                      </Flex>
                    </Link>
                  ))
                )}
              </Card>
            )}
            {isEarner && <EarningsByMonth transactions={transactions} role={role} />}
            {role === 'admin' && (
              <Card
                title={`${t('dashboard.gigApprovals')} (${pendingGigs.length})`}
                extra={<Link to="/admin/gigs/pending">{t('dashboard.seeAll')}</Link>}
              >
                <GigApprovalQueue gigs={gigs} onReviewed={refreshGigs} limit={3} />
              </Card>
            )}
          </Flex>
        </Col>

        <Col xs={24} xl={8}>
          <Flex vertical gap={20}>
            {isEarner && <OnboardingChecklist items={checklist} />}

            {role === 'worker' && (
              <Card
                title={t('dashboard.skills')}
                extra={
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setModal('skill')}
                    style={{ paddingInline: 0 }}
                  >
                    {t('dashboard.add')}
                  </Button>
                }
              >
                {skills.length === 0 ? (
                  <Typography.Text type="secondary">{t('dashboard.noVerifiedSkills')}</Typography.Text>
                ) : (
                  <Flex vertical gap={10}>
                    {skills.map((us) => (
                      <div key={us.id}>
                        <Typography.Text style={{ display: 'block', marginBottom: 4 }}>{us.skill?.name}</Typography.Text>
                        {us.provenance && <ProvenanceTag provenance={us.provenance} />}
                      </div>
                    ))}
                  </Flex>
                )}
                <div style={{ marginTop: 14 }}>
                  <Link to={`/profile/${profile.id}`}>{t('dashboard.viewProfile')} →</Link>
                </div>
              </Card>
            )}

            {role === 'admin' && (
              <Card title={t('dashboard.atAGlance')} styles={{ body: { paddingBlock: 6 } }}>
                <SideRow label={t('adminNav.skillReviews')}>
                  <Link to="/admin/reviews">{pendingReviews.length}</Link>
                </SideRow>
                <SideRow label={t('sidebar.disputes')}>
                  <Link to="/disputes">{payments?.liveDisputes ?? '—'}</Link>
                </SideRow>
                <SideRow label={t('dashboard.awaitingPayment')}>
                  <Link to="/admin/payments">{(payments?.totals.awaiting?.amount ?? 0).toLocaleString()} RWF</Link>
                </SideRow>
                <SideRow label={t('dashboard.paidOut')}>
                  <Link to="/admin/payments">{(payments?.totals.paid?.amount ?? 0).toLocaleString()} RWF</Link>
                </SideRow>
                <SideRow label={t('adminNav.metrics')}>
                  <Link to="/admin/metrics">{t('dashboard.open')} →</Link>
                </SideRow>
              </Card>
            )}

            {isEarner && (matches.length > 0 || transactions.length > 0) && (
              <ActivityFeed
                role={role as 'worker' | 'client'}
                matches={matches}
                transactions={transactions}
                tasks={tasks}
                limit={5}
              />
            )}
          </Flex>
        </Col>
      </Row>

      <Modal
        open={modal === 'skill'}
        title={t('dashboard.addSkillModalTitle')}
        footer={null}
        onCancel={() => setModal(null)}
        destroyOnHidden
      >
        <SkillVerificationForm tasks={tasks} onSubmitted={refreshTasks} />
      </Modal>
    </div>
  );
};

export default Dashboard;
