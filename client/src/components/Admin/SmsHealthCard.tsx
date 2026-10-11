import { useEffect, useState } from 'react';
import { Card, Col, Row, Skeleton, Statistic, Typography } from 'antd';
import { adminApi } from '../../api/adminApi';
import type { SmsHealth } from '../../types';

/**
 * Whether SMS is reaching people, and what it costs.
 *
 * Reach is what the pilot reports, so delivered and failed come from carrier
 * reports, and messages with no report after a day are their own figure rather
 * than being counted as delivered. Its own request, so a slow aggregate never
 * holds up the rest of the dashboard.
 */
const SmsHealthCard = () => {
  const [health, setHealth] = useState<SmsHealth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    adminApi
      .smsHealth()
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  const subtitle = health
    ? `Driver: ${health.driver} · sender "${health.sender}" · ${health.usersOnSms} user${
        health.usersOnSms === 1 ? '' : 's'
      } on SMS`
    : '';

  return (
    <Card title="SMS, last 7 days" style={{ marginTop: 16 }}>
      {failed ? (
        <Typography.Text type="secondary">Could not load SMS figures.</Typography.Text>
      ) : !health ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            {subtitle}
          </Typography.Paragraph>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={4}>
              <Statistic title="Delivered" value={health.counts.delivered} />
            </Col>
            <Col xs={12} md={4}>
              <Statistic title="Failed" value={health.counts.failed} />
            </Col>
            <Col xs={12} md={4}>
              {/* Recent ones only: the day-old ones are the next figure, not this one. */}
              <Statistic
                title="Awaiting report"
                value={health.counts.sent - health.noReportAfter24h}
              />
            </Col>
            <Col xs={12} md={4}>
              <Statistic title="No report after 24 h" value={health.noReportAfter24h} />
            </Col>
            <Col xs={12} md={4}>
              <Statistic title="Spent (USD)" value={health.cost} precision={3} />
            </Col>
            <Col xs={12} md={4}>
              <Statistic
                title="Balance (USD)"
                value={health.balance ? health.balance.amount : '—'}
                precision={health.balance ? 2 : undefined}
              />
            </Col>
          </Row>
          {health.averageSegments !== null && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '12px 0 0' }}>
              Average {health.averageSegments} segment(s) per message.
            </Typography.Paragraph>
          )}
        </>
      )}
    </Card>
  );
};

export default SmsHealthCard;
