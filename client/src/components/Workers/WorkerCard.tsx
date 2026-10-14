import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Flex, Tooltip, Typography } from 'antd';
import {
  CheckCircleFilled,
  EnvironmentOutlined,
  MessageOutlined,
  SafetyCertificateFilled,
  SendOutlined,
  StarFilled,
} from '@ant-design/icons';
import Avatar from '../common/Avatar';
import type { DirectoryWorker } from '../../api/directoryApi';

const MAX_SKILLS = 3;

/** Skills that rest on more than the worker's own word. */
const isProven = (p: string | null) => p != null && p !== 'self_declared';

/**
 * One worker in the directory.
 *
 * The whole card opens the worker's profile. A skill narrows the list to its
 * trade, the area to that area, so a client can browse from what they see.
 */
const WorkerCard = ({
  worker,
  onOffer,
  onTrade,
  onArea,
}: {
  worker: DirectoryWorker;
  onOffer?: (w: DirectoryWorker) => void;
  onTrade?: (category: string) => void;
  onArea?: (area: string) => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const unrated = worker.reviewCount === 0;
  const verified = worker.phoneVerified && worker.emailVerified;
  const profile = `/profile/${worker.id}`;
  const shown = worker.skills.slice(0, MAX_SKILLS);
  const more = worker.skills.length - shown.length;

  // Buttons and chips inside the card act on their own, not as "open profile".
  const own = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="isoko-worker-card"
      role="link"
      tabIndex={0}
      onClick={() => navigate(profile)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(profile)}
    >
      <Flex gap={12} align="flex-start">
        <span className="isoko-worker-card__avatar">
          <Avatar name={worker.name} size={48} />
          <Tooltip title={t(`growth.av_${worker.availability}`)}>
            <span className={`isoko-worker-card__presence isoko-worker-card__presence--${worker.availability}`} />
          </Tooltip>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap={6}>
            <Link to={profile} onClick={(e) => e.stopPropagation()} className="isoko-worker-card__name">
              {worker.name}
            </Link>
            {verified && (
              <Tooltip title={t('workers.verified')}>
                <CheckCircleFilled style={{ color: '#2563eb', fontSize: 14, flexShrink: 0 }} />
              </Tooltip>
            )}
          </Flex>
          <div className="isoko-worker-card__sub">
            {worker.level && <span>{t(`growth.level_${worker.level}`)}</span>}
            {worker.level && worker.area && <span aria-hidden> · </span>}
            {worker.area && (
              <button
                type="button"
                className="isoko-worker-card__area"
                onClick={own(() => onArea?.(worker.area!))}
                title={t('workers.filterArea', { area: worker.area })}
              >
                <EnvironmentOutlined /> {worker.area}
              </button>
            )}
          </div>
        </div>
        <div className="isoko-worker-card__rating">
          {unrated ? (
            <span className="isoko-worker-card__new">{t('workers.new')}</span>
          ) : (
            <>
              <span className="isoko-worker-card__score">
                <StarFilled style={{ color: '#f59e0b', fontSize: 14 }} /> {worker.trustScore.toFixed(1)}
              </span>
              <span className="isoko-worker-card__count">{t('workers.reviews', { count: worker.reviewCount })}</span>
            </>
          )}
        </div>
      </Flex>

      {worker.summary && (
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 13, margin: '14px 0 0' }}>
          {worker.summary}
        </Typography.Paragraph>
      )}

      <Flex gap={6} wrap="wrap" style={{ marginTop: 14 }}>
        {shown.map((s) => (
          <Tooltip
            key={s.name}
            title={
              s.provenance
                ? `${t(`credentials.tier.${s.provenance}`)}. ${t('workers.filterTrade', { name: s.name })}`
                : t('workers.filterTrade', { name: s.name })
            }
          >
            <button type="button" className="isoko-skill-chip" onClick={own(() => onTrade?.(s.category))}>
              {isProven(s.provenance) && <SafetyCertificateFilled className="isoko-skill-chip__proof" />}
              {s.name}
            </button>
          </Tooltip>
        ))}
        {more > 0 && <span className="isoko-skill-chip isoko-skill-chip--more">+{more}</span>}
      </Flex>

      <div className="isoko-worker-card__stats">
        <span>
          <strong>{worker.completedJobCount}</strong> {t('workers.paidJobsLabel', { count: worker.completedJobCount })}
        </span>
        {worker.yearsExperience ? (
          <span>
            <strong>{worker.yearsExperience}</strong> {t('workers.yearsLabel', { count: worker.yearsExperience })}
          </span>
        ) : null}
        <span className={`isoko-worker-card__avail isoko-worker-card__avail--${worker.availability}`}>
          {t(`growth.av_${worker.availability}`)}
        </span>
      </div>

      <Flex gap={8} className="isoko-worker-card__actions">
        <Button
          block
          icon={<MessageOutlined />}
          onClick={own(() => navigate('/notifications', { state: { contact: { id: worker.id, name: worker.name } } }))}
        >
          {t('workers.message')}
        </Button>
        {onOffer && (
          <Button
            block
            type="primary"
            icon={<SendOutlined />}
            disabled={worker.availability === 'away'}
            onClick={own(() => onOffer(worker))}
          >
            {t('workers.offer')}
          </Button>
        )}
      </Flex>
    </div>
  );
};

export default WorkerCard;
