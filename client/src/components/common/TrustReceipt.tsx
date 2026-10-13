import { Alert, Progress, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TrustScoreBreakdown } from '../../types';

const detailFor = (
  key: string,
  detail: Record<string, unknown> | undefined,
  t: (k: string, o?: Record<string, unknown>) => string,
) => {
  if (!detail) return null;
  if (key === 'rating' && typeof detail.reviewCount === 'number') {
    return t('trust.detail.rating', { count: detail.reviewCount });
  }
  if (key === 'completion' && typeof detail.completed === 'number') {
    return t('trust.detail.completion', {
      completed: detail.completed,
      abandoned: detail.abandoned as number,
    });
  }
  if (key === 'verification' && typeof detail.verifiedSkills === 'number') {
    return t('trust.detail.verification', { count: detail.verifiedSkills });
  }
  return null;
};

/**
 * The breakdown behind a trust score.
 *
 * Two things this must never do: present the number without its inputs, and
 * show an unrated user as though they scored badly.
 */
const TrustReceipt = ({ breakdown }: { breakdown: TrustScoreBreakdown }) => {
  const { t } = useTranslation();

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {breakdown.isProvisional && (
        <Alert type="info" showIcon message={t('trust.provisional')} />
      )}

      {breakdown.components.map((component) => {
        const detail = detailFor(component.key, component.detail, t);
        return (
          <div key={component.key}>
            <Typography.Text style={{ fontSize: 13 }}>
              {t(`trust.component.${component.key}`)}
            </Typography.Text>{' '}
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('match.weightLabel', { percent: Math.round(component.weight * 100) })}
            </Typography.Text>
            <Progress
              percent={Math.round(component.value * 100)}
              size="small"
              showInfo={false}
              strokeColor="var(--isoko-navy)"
            />
            {detail && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {detail}
              </Typography.Text>
            )}
          </div>
        );
      })}

      {breakdown.penalty.value > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('trust.penalty', {
            points: (breakdown.penalty.value * 5).toFixed(2),
            count: (breakdown.penalty.detail?.recentAbandoned as number) ?? 0,
          })}
        />
      )}

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {t('trust.formulaNote', { version: breakdown.formulaVersion })}
      </Typography.Text>
    </Space>
  );
};

export default TrustReceipt;
