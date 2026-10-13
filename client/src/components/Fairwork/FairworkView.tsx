import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Col, Flex, Progress, Row, Skeleton, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import { fairworkApi } from '../../api/fairworkApi';
import { fromNow } from '../../lib/time';
import type { FairworkCheck, FairworkScorecard } from '../../types';

const show = (c: FairworkCheck, v: number | null) =>
  v == null ? '—' : c.unit === 'ratio' ? `${Math.round(v * 100)}%` : c.unit === 'days' ? `${v} d` : `${v}`;

/**
 * Isoko against the Fairwork principles: the total, then each principle with
 * its two checks, the measured value, the bar it must clear and how many
 * records it rests on. Unmet checks are shown as plainly as met ones.
 */
const FairworkView = () => {
  const { t } = useTranslation();
  const [card, setCard] = useState<FairworkScorecard | null>(null);

  useEffect(() => {
    fairworkApi.scorecard().then(setCard);
  }, []);

  if (!card) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Flex gap={28} align="center" wrap="wrap">
          <Progress
            type="circle"
            size={112}
            percent={Math.round((card.score / card.outOf) * 100)}
            strokeColor="var(--isoko-navy)"
            format={() => (
              <span style={{ fontWeight: 700, fontSize: 26, color: 'var(--isoko-ink)' }}>
                {card.score}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--isoko-muted)' }}>/{card.outOf}</span>
              </span>
            )}
          />
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {t('fairwork.score', { score: card.score, outOf: card.outOf })}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 6 }}>
              {t('fairwork.about')}
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined /> {t('fairwork.computed', { when: fromNow(card.computedAt) })}
            </Typography.Text>
          </div>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        {card.principles.map((p) => {
          const points = p.checks.filter((c) => c.met).length;
          return (
            <Col xs={24} md={12} key={p.key}>
              <Card
                title={t(`fairwork.p_${p.key}`)}
                extra={<Typography.Text strong>{points}/2</Typography.Text>}
                style={{ height: '100%' }}
              >
                <Flex vertical gap={16}>
                  {p.checks.map((c) => (
                    <Flex key={c.key} gap={12} align="flex-start">
                      {c.met ? (
                        <CheckCircleFilled style={{ color: '#16a34a', fontSize: 18, marginTop: 2 }} />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            marginTop: 2,
                            borderRadius: '50%',
                            border: '2px solid var(--isoko-border)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <Flex gap={8} align="center" wrap="wrap">
                          <Typography.Text strong>{t(`fairwork.c_${c.key}`)}</Typography.Text>
                          <span className={`isoko-status isoko-status--${c.met ? 'success' : 'neutral'}`}>
                            {c.met ? t('fairwork.met') : t('fairwork.notMet')}
                          </span>
                        </Flex>
                        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 2px', fontSize: 13 }}>
                          {t(`fairwork.c_${c.key}_d`)}
                        </Typography.Paragraph>
                        <Typography.Text style={{ fontSize: 12.5 }}>
                          {t('fairwork.measured', { value: show(c, c.value), threshold: show(c, c.threshold) })}
                          {c.basis > 0 && (
                            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                              {' · '}
                              {t('fairwork.basis', { count: c.basis })}
                            </Typography.Text>
                          )}
                        </Typography.Text>
                      </div>
                    </Flex>
                  ))}
                </Flex>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default FairworkView;
