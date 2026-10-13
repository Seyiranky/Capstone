import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from 'antd';
import { skillTaskApi } from '../../api/skillTaskApi';
import PageContainer from '../Layout/PageContainer';
import AdminReviewQueue from '../Verification/AdminReviewQueue';
import type { SkillTask } from '../../types';

/** Skill submissions waiting for a decision, laid open with their evidence. */
const AdminSkillReviews = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<SkillTask[] | null>(null);

  const refresh = () => {
    skillTaskApi.listTasks().then(setTasks);
  };

  useEffect(refresh, []);

  const pending = tasks?.filter((task) => task.status === 'pending').length ?? 0;

  return (
    <PageContainer title={t('adminNav.skillReviews')} subtitle={t('adminNav.skillReviewsSub')}>
      <Card title={`${t('adminNav.skillReviews')} (${pending})`}>
        {tasks ? <AdminReviewQueue tasks={tasks} onReviewed={refresh} /> : <Skeleton active />}
      </Card>
    </PageContainer>
  );
};

export default AdminSkillReviews;
