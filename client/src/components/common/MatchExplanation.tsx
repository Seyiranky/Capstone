import { Progress, Space, Tag, Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { MatchScoreBreakdown } from '../../types';

/**
 * Shows why a worker ranked where they did.
 *
 * A ranking a worker cannot interrogate is the opaque-reputation problem this
 * platform exists to avoid, so the breakdown is shown to both sides of the
 * match rather than kept as an internal score.
 */
const MatchExplanation = ({
  breakdown,
  compact = false,
}: {
  breakdown: MatchScoreBreakdown;
  compact?: boolean;
}) => {
  const { t } = useTranslation();

  if (compact) {
    return (
      <Space size={[4, 4]} wrap>
        {breakdown.reasons.map((reason) => (
          <Tag key={reason.key} style={{ marginInlineEnd: 0 }}>
            {t(reason.key, reason.params)}
          </Tag>
        ))}
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Space size={[4, 4]} wrap>
        {breakdown.reasons.map((reason) => (
          <Tag key={reason.key} style={{ marginInlineEnd: 0 }}>
            {t(reason.key, reason.params)}
          </Tag>
        ))}
      </Space>

      <div>
        {breakdown.components.map((component) => (
          <div key={component.key} style={{ marginBottom: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t(`match.component.${component.key}`)}{' '}
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ({t('match.weightLabel', { percent: Math.round(component.weight * 100) })})
              </Typography.Text>
            </Typography.Text>
            <Tooltip
              title={t('match.contributionTooltip', {
                value: component.value.toFixed(2),
                weight: component.weight.toFixed(2),
                contribution: component.contribution.toFixed(3),
              })}
            >
              <Progress
                percent={Math.round(component.value * 100)}
                size="small"
                showInfo={false}
                strokeColor="#1f1f1f"
              />
            </Tooltip>
          </div>
        ))}
      </div>

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {t('match.weightProfileNote', {
          profile: t(`match.profile.${breakdown.weightProfile.name}`, {
            defaultValue: breakdown.weightProfile.name,
          }),
        })}
      </Typography.Text>
    </Space>
  );
};

export default MatchExplanation;
