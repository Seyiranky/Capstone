import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Col, Empty, Flex, Row, Skeleton, Typography } from 'antd';
import { AuditOutlined, CheckCircleOutlined, FlagOutlined } from '@ant-design/icons';
import PageContainer from '../components/Layout/PageContainer';
import DisputeCard from '../components/Disputes/DisputeCard';
import { disputeApi } from '../api/disputeApi';
import { useAppSelector } from '../store/hooks';
import type { Dispute } from '../types';

const Section = ({ title, items, onChanged }: { title: string; items: Dispute[]; onChanged: () => void }) =>
  items.length === 0 ? null : (
    <section style={{ marginTop: 24 }}>
      <Typography.Title level={5} style={{ margin: '0 0 12px' }}>
        {title} <Typography.Text type="secondary">({items.length})</Typography.Text>
      </Typography.Title>
      <Flex vertical gap={16}>
        {items.map((d) => (
          <DisputeCard key={d.id} dispute={d} onChanged={onChanged} />
        ))}
      </Flex>
    </section>
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

  const steps = [
    { icon: <FlagOutlined />, title: t('dispute.how1Title'), body: t('dispute.how1Body') },
    { icon: <AuditOutlined />, title: t('dispute.how2Title'), body: t('dispute.how2Body') },
    { icon: <CheckCircleOutlined />, title: t('dispute.how3Title'), body: t('dispute.how3Body') },
  ];

  const toMediate = (disputes ?? []).filter(
    (d) => d.myRole === 'mediator' && d.status === 'open' && d.votes.some((v) => v.mediator?.id === me?.id && !v.voted),
  );
  const needsAdmin = (disputes ?? []).filter((d) => d.myRole === 'admin' && d.status === 'escalated');
  const yours = (disputes ?? []).filter((d) => d.myRole === 'party');
  const shown = new Set([...toMediate, ...needsAdmin, ...yours].map((d) => d.id));
  const others = (disputes ?? []).filter((d) => !shown.has(d.id));

  return (
    <PageContainer title={t('dispute.title')} subtitle={t('dispute.subtitle')}>
      <Card styles={{ body: { padding: '16px 20px' } }}>
        <Row gutter={[24, 16]}>
          {steps.map((s, i) => (
            <Col key={s.title} xs={24} md={8}>
              <Flex gap={12} align="flex-start">
                <span className="isoko-stat-icon">{s.icon}</span>
                <div>
                  <Typography.Text strong style={{ display: 'block' }}>
                    {i + 1}. {s.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {s.body}
                  </Typography.Text>
                </div>
              </Flex>
            </Col>
          ))}
        </Row>
      </Card>

      {!disputes ? (
        <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 24 }} />
      ) : disputes.length === 0 ? (
        <Card style={{ marginTop: 24 }}>
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
