import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Flex, Skeleton, Typography } from 'antd';
import PageContainer from '../components/Layout/PageContainer';
import DisputeCard from '../components/Disputes/DisputeCard';
import { disputeApi } from '../api/disputeApi';
import { useAppSelector } from '../store/hooks';
import type { Dispute } from '../types';

const Section = ({ title, items, onChanged }: { title: string; items: Dispute[]; onChanged: () => void }) =>
  items.length === 0 ? null : (
    <div style={{ marginBottom: 28 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {title} ({items.length})
      </Typography.Title>
      <Flex vertical gap={16}>
        {items.map((d) => (
          <DisputeCard key={d.id} dispute={d} onChanged={onChanged} />
        ))}
      </Flex>
    </div>
  );

/** Disputes the viewer is a party to, sits on the panel of, or (as an admin) must decide. */
const DisputesPage = () => {
  const { t } = useTranslation();
  const me = useAppSelector((s) => s.auth.profile);
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);

  const load = () =>
    disputeApi
      .list()
      .then(setDisputes)
      .catch(() => setDisputes([]));

  useEffect(() => {
    load();
  }, []);

  if (!disputes) return <Skeleton active paragraph={{ rows: 6 }} />;

  const toMediate = disputes.filter(
    (d) =>
      d.myRole === 'mediator' &&
      d.status === 'open' &&
      d.votes.some((v) => v.mediator?.id === me?.id && !v.voted),
  );
  const needsAdmin = disputes.filter((d) => d.myRole === 'admin' && d.status === 'escalated');
  const yours = disputes.filter((d) => d.myRole === 'party');
  const shown = new Set([...toMediate, ...needsAdmin, ...yours].map((d) => d.id));
  const others = disputes.filter((d) => !shown.has(d.id));

  return (
    <PageContainer title={t('dispute.title')} subtitle={t('dispute.subtitle')}>
      {disputes.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dispute.empty')} />
        </Card>
      ) : (
        <>
          <Section title={t('dispute.needsAdmin')} items={needsAdmin} onChanged={load} />
          <Section title={t('dispute.toMediate')} items={toMediate} onChanged={load} />
          <Section title={t('dispute.yours')} items={yours} onChanged={load} />
          <Section title={t('dispute.others')} items={others} onChanged={load} />
        </>
      )}
    </PageContainer>
  );
};

export default DisputesPage;
