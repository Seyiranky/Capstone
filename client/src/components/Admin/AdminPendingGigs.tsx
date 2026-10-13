import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from 'antd';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import GigApprovalQueue from './GigApprovalQueue';
import type { Gig } from '../../types';

/** Gigs waiting for an admin, each laid open to approve or reject in place. */
const AdminPendingGigs = () => {
  const { t } = useTranslation();
  const [gigs, setGigs] = useState<Gig[] | null>(null);

  const refresh = () => {
    adminApi.listGigs().then(setGigs);
  };

  useEffect(refresh, []);

  const waiting = gigs?.filter((g) => g.status === 'pending_review').length ?? 0;

  return (
    <PageContainer title={t('adminNav.gigApprovals')} subtitle={t('adminNav.gigApprovalsSub')}>
      <Card title={`${t('adminNav.gigApprovals')} (${waiting})`}>
        {gigs ? <GigApprovalQueue gigs={gigs} onReviewed={refresh} /> : <Skeleton active />}
      </Card>
    </PageContainer>
  );
};

export default AdminPendingGigs;
