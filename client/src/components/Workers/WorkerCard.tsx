import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Flex, Typography } from 'antd';
import { EnvironmentOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import Avatar from '../common/Avatar';
import ProvenanceTag from '../common/ProvenanceTag';
import LevelBadge from '../Growth/LevelBadge';
import VerificationBadges from '../Trust/VerificationBadges';
import type { DirectoryWorker } from '../../api/directoryApi';

/** One worker in the directory: who they are, how their skills were proven, and how to reach them. */
const WorkerCard = ({ worker, onOffer }: { worker: DirectoryWorker; onOffer?: (w: DirectoryWorker) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const unrated = worker.reviewCount === 0;

  return (
    <Card style={{ height: '100%' }} styles={{ body: { padding: 18, height: '100%', display: 'flex', flexDirection: 'column' } }}>
      <Flex gap={12} align="flex-start">
        <Avatar name={worker.name} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/profile/${worker.id}`} style={{ color: 'inherit' }}>
            <Typography.Text strong style={{ fontSize: 15 }} ellipsis>
              {worker.name}
            </Typography.Text>
          </Link>
          <Flex gap={6} wrap="wrap" align="center" style={{ marginTop: 4 }}>
            <LevelBadge level={worker.level} />
            <span
              className={`isoko-status isoko-status--${
                worker.availability === 'available' ? 'success' : worker.availability === 'busy' ? 'warning' : 'neutral'
              }`}
            >
              {t(`growth.av_${worker.availability}`)}
            </span>
          </Flex>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography.Text strong style={{ fontSize: 18, display: 'block', lineHeight: 1.1 }}>
            {unrated ? t('workers.new') : worker.trustScore.toFixed(1)}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
            {unrated ? t('workers.noReviews') : t('workers.reviews', { count: worker.reviewCount })}
          </Typography.Text>
        </div>
      </Flex>

      {worker.summary && (
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 13, margin: '12px 0 0' }}>
          {worker.summary}
        </Typography.Paragraph>
      )}

      <Flex vertical gap={6} style={{ marginTop: 12 }}>
        {worker.skills.map((s) => (
          <Flex key={s.name} justify="space-between" align="center" gap="4px 8px" wrap="wrap">
            <Typography.Text style={{ fontSize: 13 }}>{s.name}</Typography.Text>
            {s.provenance && <ProvenanceTag provenance={s.provenance} />}
          </Flex>
        ))}
      </Flex>

      <div style={{ marginTop: 12 }}>
        <VerificationBadges phone={worker.phoneVerified} email={worker.emailVerified} size="small" />
      </div>

      <Typography.Text type="secondary" style={{ fontSize: 12.5, marginTop: 8 }}>
        {t('workers.paidJobs', { count: worker.completedJobCount })}
        {worker.yearsExperience ? ` · ${t('workers.years', { count: worker.yearsExperience })}` : ''}
        {worker.area && (
          <>
            {' · '}
            <EnvironmentOutlined /> {worker.area}
          </>
        )}
      </Typography.Text>

      <Flex gap={8} style={{ marginTop: 'auto', paddingTop: 14 }}>
        <Button
          block
          icon={<MessageOutlined />}
          onClick={() => navigate('/notifications', { state: { contact: { id: worker.id, name: worker.name } } })}
        >
          {t('workers.message')}
        </Button>
        {onOffer && (
          <Button block type="primary" icon={<SendOutlined />} disabled={worker.availability === 'away'} onClick={() => onOffer(worker)}>
            {t('workers.offer')}
          </Button>
        )}
      </Flex>
    </Card>
  );
};

export default WorkerCard;
