import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { App, Button, Card, Col, DatePicker, Empty, Flex, InputNumber, Progress, Row, Segmented, Skeleton, Typography } from 'antd';
import { CheckCircleFilled, PrinterOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import LevelBadge from './LevelBadge';
import { userApi } from '../../api/userApi';
import { locationName } from '../../utils/locationName';
import type { Growth, Provenance } from '../../types';

const RUNGS: Provenance[] = ['self_declared', 'supervised', 'document_sighted', 'peer_reviewed', 'work_earned'];

/**
 * The worker's Growth page: level and what the next one takes, availability,
 * monthly goal, the evidence ladder per trade with its next step, an RPL pack
 * for a national qualification, and where open work in their trades is.
 */
const GrowthPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [g, setG] = useState<Growth | null>(null);
  const [goal, setGoal] = useState<number | null>(null);

  const load = () =>
    userApi.growth().then((data) => {
      setG(data);
      setGoal(data.goal.monthlyGoal);
    });

  useEffect(() => {
    load();
  }, []);

  const save = async (payload: Parameters<typeof userApi.updateProfile>[0]) => {
    try {
      await userApi.updateProfile(payload);
      await load();
    } catch {
      message.error('Could not save');
    }
  };

  const areas = useMemo(() => {
    if (!g) return [];
    const byArea = new Map<string, { count: number; total: number }>();
    for (const gig of g.demand.gigs) {
      const area = locationName(gig.lat, gig.lng) ?? '—';
      const row = byArea.get(area) ?? { count: 0, total: 0 };
      row.count += 1;
      row.total += gig.budget;
      byArea.set(area, row);
    }
    return [...byArea.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [g]);

  if (!g) return <Skeleton active paragraph={{ rows: 10 }} />;

  const nextStep = g.level.steps.find((s) => s.key === g.level.next);
  const goalPct = g.goal.monthlyGoal ? Math.min(100, Math.round((g.goal.earnedThisMonth / g.goal.monthlyGoal) * 100)) : 0;

  return (
    <PageContainer title={t('growth.title')} subtitle={t('growth.subtitle')}>
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <Card title={t('growth.levelTitle')} extra={<LevelBadge level={g.level.level} />} style={{ height: '100%' }}>
            {/* The ladder of levels, the current one marked. */}
            <Flex gap={8} style={{ marginBottom: 18 }}>
              {(['new', 'rising', 'trusted', 'master'] as const).map((key) => {
                const order = ['new', 'rising', 'trusted', 'master'];
                const reached = order.indexOf(key) <= order.indexOf(g.level.level);
                return (
                  <div key={key} style={{ flex: 1 }}>
                    <div style={{ height: 6, borderRadius: 3, background: reached ? 'var(--isoko-navy)' : 'var(--isoko-border)' }} />
                    <Typography.Text type={reached ? undefined : 'secondary'} strong={key === g.level.level} style={{ fontSize: 12.5, display: 'block', marginTop: 6 }}>
                      {t(`growth.level_${key}`)}
                    </Typography.Text>
                  </div>
                );
              })}
            </Flex>
            {nextStep ? (
              <>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('growth.nextLevel', { level: t(`growth.level_${nextStep.key}`) })}
                </Typography.Text>
                <Flex vertical gap={10}>
                  {nextStep.criteria.map((c) => (
                    <div key={c.key}>
                      <Flex justify="space-between" gap={8}>
                        <Typography.Text style={{ fontSize: 13 }}>
                          {c.met && <CheckCircleFilled style={{ color: '#16a34a', marginInlineEnd: 6 }} />}
                          {t(`growth.c_${c.key}`)}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                          {c.key === 'recentAbandoned' ? `${c.value} (${t('growth.atMost', { target: c.target })})` : `${c.value} / ${c.target}`}
                        </Typography.Text>
                      </Flex>
                      {c.key !== 'recentAbandoned' && (
                        <Progress percent={Math.min(100, Math.round((c.value / c.target) * 100))} showInfo={false} size="small" strokeColor="var(--isoko-navy)" />
                      )}
                    </div>
                  ))}
                </Flex>
              </>
            ) : (
              <Typography.Text>{t('growth.topLevel')}</Typography.Text>
            )}
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '14px 0 0' }}>
              {t('growth.levelsPublic')}
            </Typography.Paragraph>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Flex vertical gap={20} style={{ height: '100%' }}>
            <Card title={t('growth.availability')}>
              <Segmented
                block
                value={g.availability}
                onChange={(v) => save({ availability: v as Growth['availability'] })}
                options={(['available', 'busy', 'away'] as const).map((a) => ({ value: a, label: t(`growth.av_${a}`) }))}
              />
              {g.availability === 'away' && (
                <Flex align="center" gap={8} style={{ marginTop: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {t('growth.awayUntil')}
                  </Typography.Text>
                  <DatePicker
                    size="small"
                    value={g.availableFrom ? dayjs(g.availableFrom) : null}
                    disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                    onChange={(d) => save({ availability: 'away', availableFrom: d ? d.toISOString() : null })}
                  />
                </Flex>
              )}
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '10px 0 0' }}>
                {t('growth.availabilityHelp')}
              </Typography.Paragraph>
            </Card>

            <Card title={t('growth.goalTitle')}>
              {g.goal.monthlyGoal ? (
                <>
                  <Progress percent={goalPct} strokeColor="var(--isoko-navy)" />
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {t('growth.goalOf', {
                      earned: g.goal.earnedThisMonth.toLocaleString(),
                      goal: g.goal.monthlyGoal.toLocaleString(),
                    })}
                  </Typography.Text>
                </>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t('growth.goalNone')}
                </Typography.Text>
              )}
              <Flex gap={8} style={{ marginTop: 12 }}>
                <InputNumber
                  min={0}
                  step={10000}
                  value={goal}
                  onChange={setGoal}
                  addonAfter="RWF"
                  style={{ flex: 1 }}
                  formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number((v ?? '').replace(/,/g, ''))}
                />
                <Button onClick={() => save({ monthlyGoal: goal ?? null })}>{t('growth.goalSave')}</Button>
              </Flex>
            </Card>
          </Flex>
        </Col>

        <Col xs={24} xl={14}>
          <Card title={t('growth.ladderTitle')}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
              {t('growth.ladderHelp')}
            </Typography.Paragraph>
            {g.ladder.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('growth.noSkills')}>
                <Link to="/dashboard" state={{ openAddSkill: true }}>
                  {t('growth.addSkill')}
                </Link>
              </Empty>
            ) : (
              g.ladder.map((s, i) => {
                const at = RUNGS.indexOf(s.provenance);
                return (
                  <div key={s.skillId} style={{ paddingTop: i ? 16 : 0, marginTop: i ? 16 : 0, borderTop: i ? '1px solid var(--isoko-border)' : undefined }}>
                    <Typography.Text strong>{s.skill}</Typography.Text>
                    <Flex gap={6} style={{ margin: '10px 0 8px' }}>
                      {RUNGS.map((r, k) => (
                        <div key={r} style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ height: 6, borderRadius: 3, background: k <= at ? 'var(--isoko-navy)' : 'var(--isoko-border)' }} />
                          <Typography.Text
                            type={k <= at ? undefined : 'secondary'}
                            strong={k === at}
                            style={{ fontSize: 11.5, display: 'block', marginTop: 5, lineHeight: 1.3 }}
                          >
                            {t(`growth.rung_${r}`)}
                          </Typography.Text>
                        </div>
                      ))}
                    </Flex>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t(`growth.nextStep_${s.provenance}`)}
                    </Typography.Text>
                  </div>
                );
              })
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Flex vertical gap={20}>
            <Card title={t('growth.demandTitle')}>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
                {t('growth.demandHelp')}
              </Typography.Paragraph>
              {areas.length === 0 ? (
                <Typography.Text type="secondary">{t('growth.noDemand')}</Typography.Text>
              ) : (
                areas.slice(0, 6).map(([area, row]) => (
                  <Flex key={area} justify="space-between" align="center" className="isoko-siderow" style={{ padding: '9px 0' }}>
                    <Typography.Text>{area}</Typography.Text>
                    <Flex gap={12} align="center">
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {t('growth.typical', { amount: Math.round(row.total / row.count).toLocaleString() })}
                      </Typography.Text>
                      <span className="isoko-status isoko-status--info">{t('growth.gigsOpen', { count: row.count })}</span>
                    </Flex>
                  </Flex>
                ))
              )}
              <div style={{ marginTop: 12 }}>
                <Link to="/marketplace">{t('dashboard.seeAll')} →</Link>
              </div>
            </Card>

            <Card title={t('growth.rplTitle')}>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                {t('growth.rplHelp')}
              </Typography.Paragraph>
              <Link to="/growth/rpl">
                <Button icon={<PrinterOutlined />}>{t('growth.rplOpen')}</Button>
              </Link>
            </Card>
          </Flex>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default GrowthPage;
