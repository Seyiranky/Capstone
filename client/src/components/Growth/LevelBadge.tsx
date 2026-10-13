import { useTranslation } from 'react-i18next';
import { Tooltip } from 'antd';
import type { LevelKey } from '../../types';

const TONE: Record<LevelKey, string> = {
  new: 'neutral',
  rising: 'info',
  trusted: 'success',
  master: 'warning',
};

/** A worker's level as a status pill; the tooltip says the criteria are public. */
const LevelBadge = ({ level }: { level?: LevelKey | null }) => {
  const { t } = useTranslation();
  if (!level) return null;
  return (
    <Tooltip title={t('growth.levelsPublic')}>
      <span className={`isoko-status isoko-status--${TONE[level]}`}>{t(`growth.level_${level}`)}</span>
    </Tooltip>
  );
};

export default LevelBadge;
