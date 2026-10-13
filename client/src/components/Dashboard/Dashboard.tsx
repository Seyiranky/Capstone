import { countsAsMoved, movedAt } from '../../lib/money';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Modal,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchMatches } from '../../store/slices/matchSlice';
import { skillTaskApi } from '../../api/skillTaskApi';
import { transactionApi } from '../../api/transactionApi';
import { userApi } from '../../api/userApi';
import { adminApi } from '../../api/adminApi';
import { gigApi } from '../../api/gigApi';
import { gigApplicationApi } from '../../api/gigApplicationApi';
import { LineChart, PieChart } from '../common/charts';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import ActivityFeed from './ActivityFeed';
import OnboardingChecklist, { type ChecklistItem } from './OnboardingChecklist';
import SkillVerificationForm from '../Verification/SkillVerificationForm';
import GigApprovalQueue from '../Admin/GigApprovalQueue';
import type { Gig, SkillTask, Transaction, UserSkill } from '../../types';

const Dashboard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { profile, role } = useAppSelector((state) => state.auth);
  const matches = useAppSelector((state) => state.matches.items);
  const [tasks, setTasks] = useState<SkillTask[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [verifiedSkills, setVerifiedSkills] = useState<UserSkill[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [myGigCount, setMyGigCount] = useState(0);
  const [myApplicationCount, setMyApplicationCount] = useState(0);
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
    if (role === 'admin') refreshGigs();
    if (role === 'worker') {
      gigApplicationApi.listApplications().then((a) => setMyApplicationCount(a.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (role === 'worker' && profile) userApi.getUserSkills(profile.id).then(setVerifiedSkills);
    if (role === 'client' && profile) {
      gigApi
        .listGigs()
        .then((all) => setMyGigCount(all.filter((g) => g.clientId === profile.id).length));
    }
  }, [role, profile]);

  const pendingReviews = tasks.filter((x) => x.status === 'pending');
  const decidedReviews = tasks.filter((x) => x.status !== 'pending');
  const pendingGigs = gigs.filter((g) => g.status === 'pending_review');
  const activeMatches = matches.filter(
    (m) => m.status === 'pending' || m.status === 'accepted',
  ).length;
  const confirmedTotal = transactions
    .filter((x) => countsAsMoved(x, role))
    .reduce((sum, x) => sum + Number(x.amount), 0);
  const needsLocation =
    role === 'worker' && (profile?.locationLat == null || profile?.locationLng == null);

  const earningsSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const tx of transactions.filter((x) => countsAsMoved(x, role))) {
      const day = new Date(movedAt(tx, role)).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Number(tx.amount));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, y]) => ({ x: day.slice(5), y }));
  }, [transactions, role]);

  const matchStatusSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
    return [...counts.entries()].map(([type, value]) => ({ type, value }));
  }, [matches]);

  if (!profile) return null;

  const isEarner = role === 'worker' || role === 'client';
  const showCharts = isEarner && (earningsSeries.length >= 2 || matchStatusSlices.length > 0);

  const checklist: ChecklistItem[] =
    role === 'worker'
      ? [
          {
            key: 'loc',
            label: t('dashboard.checklist.addLocation'),
            done: profile.locationLat != null,
            to: '/settings',
            action: t('dashboard.checklist.setLocation'),
          },
          {
            key: 'skill',
            label: t('dashboard.checklist.submitSkill'),
            done: verifiedSkills.length > 0 || tasks.length > 0,
            to: '/dashboard',
            action: t('dashboard.checklist.addSkill'),
          },
          {
            key: 'apply',
            label: t('dashboard.checklist.applyFirstGig'),
            done: myApplicationCount > 0,
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
              to: '/settings',
              action: t('dashboard.checklist.editProfile'),
            },
            {
              key: 'post',
              label: t('dashboard.checklist.postFirstGig'),
              done: myGigCount > 0,
              to: '/marketplace',
              action: t('dashboard.checklist.postGig'),
            },
          ]
        : [];

  // Three tiles: two share a row on phones, the last takes the full width
  // rather than sitting alone at half width.
  const kpi = (
    title: string,
    value: number | string,
    suffix?: string,
    accent?: string,
    last = false,
  ) => (
    <Col xs={last ? 24 : 12} sm={8}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={value} suffix={suffix} valueStyle={accent ? { color: accent } : undefined} />
      </Card>
    </Col>
  );

  return (
    <PageContainer
      title={t('dashboard.welcome', { name: profile.name })}
      subtitle={<span>{t(`common.roles.${profile.role}`)}</span>}
    >
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

      {isEarner && <OnboardingChecklist items={checklist} />}

      <Row gutter={[16, 16]}>
        {isEarner ? (
          <>
            <Col xs={12} sm={8}>
              <Card size="small" style={{ height: '100%' }}>
                {/* An unrated worker must not be shown a mid-scale number as
                    though it were a verdict on them. */}
                {profile.trustScoreBreakdown?.isProvisional ? (
                  <>
                    <Statistic title={t('dashboard.trustScore')} value="—" />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t('match.reason.trustProvisional')}
                    </Typography.Text>
                  </>
                ) : (
                  <>
                    <Statistic
                      title={t('dashboard.trustScore')}
                      value={profile.trustScore.toFixed(1)}
                      suffix="/ 5"
                    />
                    <Progress
                      percent={Math.round((profile.trustScore / 5) * 100)}
                      showInfo={false}
                      size="small"
                      strokeColor="#18181b"
                      style={{ marginTop: 8 }}
                    />
                  </>
                )}
              </Card>
            </Col>
            {kpi(role === 'client' ? t('dashboard.totalPaid') : t('dashboard.totalEarned'), confirmedTotal, 'RWF')}
            {kpi(t('dashboard.activeMatches'), activeMatches, undefined, undefined, true)}
          </>
        ) : (
          <>
            {kpi(t('dashboard.pendingReviews'), pendingReviews.length)}
            {kpi(t('dashboard.reviewsCompleted'), decidedReviews.length)}
            {kpi(
              t('dashboard.pendingGigApprovals'),
              pendingGigs.length,
              undefined,
              pendingGigs.length ? '#b45309' : undefined,
              true,
            )}
          </>
        )}
      </Row>

      {showCharts && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={14}>
            <Card
              title={role === 'client' ? t('dashboard.totalPaid') : t('dashboard.totalEarned')}
              styles={{ body: { minHeight: 140 } }}
            >
              {earningsSeries.length >= 2 ? (
                <LineChart data={earningsSeries} height={220} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noMatchesYet')} />
              )}
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card title={t('dashboard.matchesByStatus')} styles={{ body: { minHeight: 140 } }}>
              {matchStatusSlices.length > 0 ? (
                <PieChart data={matchStatusSlices} height={220} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noMatchesYet')} />
              )}
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {role === 'admin' ? (
          <>
            <Col xs={24} lg={12}>
              <Card
                title={t('dashboard.skillReviews')}
                extra={
                  <Link to="/admin/reviews">{t('dashboard.reviewSubmissions')}</Link>
                }
                style={{ height: '100%' }}
              >
                {pendingReviews.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.nothingToReview')} />
                ) : (
                  <List
                    size="small"
                    dataSource={pendingReviews.slice(0, 5)}
                    renderItem={(task) => (
                      <List.Item>
                        <List.Item.Meta
                          title={task.skill?.name}
                          description={
                            task.worker ? (
                              <IdentityLink id={task.worker.id} name={task.worker.name} size={18} />
                            ) : null
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              {/* Laid open: approve or reject right here, no pop-up in between. */}
              <Card
                title={`${t('dashboard.gigApprovals')} (${pendingGigs.length})`}
                style={{ height: '100%' }}
              >
                <GigApprovalQueue gigs={gigs} onReviewed={refreshGigs} limit={5} />
              </Card>
            </Col>
          </>
        ) : (
          <>
            <Col xs={24} lg={role === 'worker' ? 15 : 24}>
              <Card
                title={t('dashboard.yourMatches')}
                style={{ height: '100%' }}
                styles={{ body: { paddingBlock: matches.length ? 0 : 24 } }}
              >
                {matches.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <>
                        {t('dashboard.noMatchesYet')}{' '}
                        <Link to="/marketplace">{t('dashboard.goToMarketplace')}</Link>
                      </>
                    }
                  />
                ) : (
                  <List
                    dataSource={matches.slice(0, 6)}
                    renderItem={(match) => {
                      const counterparty = role === 'client' ? match.worker : match.gig?.client;
                      return (
                        <List.Item actions={[<StatusTag key="s" status={match.status} />]}>
                          <List.Item.Meta
                            title={<Link to={`/gigs/${match.gigId}`}>{match.gig?.title ?? 'Gig'}</Link>}
                            description={
                              counterparty ? (
                                <IdentityLink id={counterparty.id} name={counterparty.name} size={20} />
                              ) : null
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                )}
              </Card>
            </Col>

            {role === 'worker' && (
              <Col xs={24} lg={9}>
                <Card
                  title={t('dashboard.skills')}
                  extra={
                    <Button type="link" icon={<PlusOutlined />} onClick={() => setModal('skill')}>
                      {t('dashboard.addNewSkill')}
                    </Button>
                  }
                  style={{ height: '100%' }}
                >
                  {verifiedSkills.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noVerifiedSkills')} />
                  ) : (
                    <Space size={[8, 8]} wrap>
                      {verifiedSkills.map((us) => (
                        <Tag
                          key={us.id}
                          style={{ padding: '5px 12px', fontSize: 13, borderRadius: 4 }}
                        >
                          {us.skill?.name}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </Card>
              </Col>
            )}
          </>
        )}
      </Row>

      {isEarner &&
        (matches.length > 0 || transactions.length > 0 || decidedReviews.length > 0) && (
          <div style={{ marginTop: 16 }}>
            <ActivityFeed
              role={role as 'worker' | 'client'}
              matches={matches}
              transactions={transactions}
              tasks={tasks}
            />
          </div>
        )}

      <Modal open={modal === 'skill'} title={t('dashboard.addSkillModalTitle')} footer={null} onCancel={() => setModal(null)} destroyOnHidden>
        <SkillVerificationForm tasks={tasks} onSubmitted={refreshTasks} />
      </Modal>
    </PageContainer>
  );
};

export default Dashboard;
