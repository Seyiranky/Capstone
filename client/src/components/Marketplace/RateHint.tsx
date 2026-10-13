import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { gigApi } from '../../api/gigApi';
import type { RateGuide } from '../../types';

/**
 * The usual price range for a skill, under a price field.
 *
 * Shown to a client setting a budget and to a worker quoting. Pricing below the
 * 25th percentile earns a gentle warning, worded for whichever side is pricing;
 * it never blocks, because a small job can honestly be cheap.
 */
const RateHint = ({
  skillId,
  amount,
  audience,
}: {
  skillId?: string;
  amount?: number | null;
  audience: 'client' | 'worker';
}) => {
  const { t } = useTranslation();
  const [guide, setGuide] = useState<RateGuide | null>(null);

  useEffect(() => {
    setGuide(null);
    if (!skillId) return;
    gigApi
      .rates(skillId)
      .then(setGuide)
      .catch(() => setGuide(null));
  }, [skillId]);

  if (!guide || guide.basis === 'none' || guide.p25 == null || guide.p75 == null || guide.median == null) {
    return null;
  }
  const fmt = (n: number) => n.toLocaleString();
  const below = amount != null && amount > 0 && amount < guide.p25;

  return (
    <div style={{ fontSize: 12, marginTop: 4 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
        {t('rates.usual', { low: fmt(guide.p25), high: fmt(guide.p75), median: fmt(guide.median) })}{' '}
        {t(`rates.basis_${guide.basis}`, { count: guide.sampleSize })}
      </Typography.Text>
      {below && (
        <Typography.Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
          <WarningOutlined /> {audience === 'client' ? t('rates.belowClient') : t('rates.belowWorker')}
        </Typography.Text>
      )}
    </div>
  );
};

export default RateHint;
