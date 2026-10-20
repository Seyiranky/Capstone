import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from 'antd';
import PageContainer from '../components/Layout/PageContainer';
import PeerReviewQueue from '../components/Verification/PeerReviewQueue';
import { skillTaskApi } from '../api/skillTaskApi';
import { useAppSelector } from '../store/hooks';
import type { SkillTask } from '../types';

/** Skill submissions drawn for this peer reviewer to judge. */
const PeerReviewsPage = () => {
  const { t } = useTranslation();
  const { profile } = useAppSelector((state) => state.auth);
  const [tasks, setTasks] = useState<SkillTask[] | null>(null);

  const load = useCallback(
    () => skillTaskApi.listTasks({ assignedToMe: true }).then(setTasks).catch(() => setTasks((x) => x ?? [])),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (profile && profile.reviewerTier !== 'peer') return <Navigate to="/dashboard" replace />;

  return (
    <PageContainer title={t('peerReview.title')} subtitle={t('peerReview.subtitle')}>
      {tasks ? (
        <PeerReviewQueue tasks={tasks.filter((x) => x.status === 'pending')} onChanged={load} />
      ) : (
        <Card>
          <Skeleton active />
        </Card>
      )}
    </PageContainer>
  );
};

export default PeerReviewsPage;
