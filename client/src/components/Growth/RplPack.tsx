import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Flex, Skeleton, Table, Typography } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { userApi } from '../../api/userApi';
import ProvenanceTag from '../common/ProvenanceTag';
import LevelBadge from './LevelBadge';
import logo from '../../assets/logo.png';
import type { Growth, UserSkill, WorkHistoryEntry } from '../../types';

/**
 * A printable summary of a worker's evidence for a Recognition of Prior
 * Learning assessment: who they are, each skill with how it was established,
 * and every paid job with its rating and receipt number, which an assessor can
 * check at /r/<number>. The sidebar and header drop out when printed.
 */
const RplPack = () => {
  const { t, i18n } = useTranslation();
  const me = useAppSelector((s) => s.auth.profile);
  const [skills, setSkills] = useState<UserSkill[] | null>(null);
  const [history, setHistory] = useState<WorkHistoryEntry[]>([]);
  const [growth, setGrowth] = useState<Growth | null>(null);

  useEffect(() => {
    if (!me) return;
    userApi.getUserSkills(me.id).then(setSkills);
    userApi.getWorkHistory(me.id).then(setHistory);
    userApi.growth().then(setGrowth);
  }, [me]);

  if (!me || !skills) return <Skeleton active />;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <style>{`@media print {
        .no-print, .ant-layout-sider, .ant-layout-header, .ant-drawer { display: none !important; }
        .ant-layout-content { padding: 0 !important; }
        body { background: #fff !important; }
      }`}</style>
      <Flex justify="space-between" align="center" className="no-print" style={{ marginBottom: 16 }}>
        <Link to="/growth">
          <ArrowLeftOutlined /> {t('growth.title')}
        </Link>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          {t('receipt.print')}
        </Button>
      </Flex>

      <Card>
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <div>
            <img src={logo} alt="Isoko Talents" style={{ height: 30, display: 'block', marginBottom: 14 }} />
            <Typography.Title level={3} style={{ margin: 0 }}>
              {t('rpl.title')}
            </Typography.Title>
            <Typography.Text type="secondary">{t('rpl.subtitle')}</Typography.Text>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Typography.Text strong style={{ fontSize: 16, display: 'block' }}>
              {me.name}
            </Typography.Text>
            {me.createdAt && (
              <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                {t('rpl.memberSince', { date: date(me.createdAt) })}
              </Typography.Text>
            )}
            {growth && (
              <div style={{ marginTop: 6 }}>
                <LevelBadge level={growth.level.level} />
              </div>
            )}
          </div>
        </Flex>

        <Divider />
        <Typography.Title level={5}>{t('rpl.skills')}</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={skills}
          columns={[
            { title: t('rpl.skill'), key: 'skill', render: (_, s) => s.skill?.name },
            { title: t('rpl.level'), key: 'level', render: (_, s) => s.proficiencyLevel ?? '—' },
            { title: t('rpl.evidence'), key: 'evidence', render: (_, s) => (s.provenance ? <ProvenanceTag provenance={s.provenance} showHelp={false} /> : '—') },
          ]}
        />

        <Divider />
        <Typography.Title level={5}>
          {t('rpl.jobs')} ({history.length})
        </Typography.Title>
        <Table
          rowKey="matchId"
          size="small"
          pagination={false}
          dataSource={history}
          locale={{ emptyText: t('workHistory.empty') }}
          columns={[
            { title: t('rpl.job'), dataIndex: 'gig', key: 'gig' },
            { title: t('rpl.skill'), dataIndex: 'skill', key: 'skill' },
            { title: t('rpl.date'), key: 'date', render: (_, e) => date(e.completedAt) },
            { title: t('rpl.rating'), key: 'rating', render: (_, e) => (e.rating != null ? `${e.rating}/5` : '—') },
            { title: t('receipt.number'), dataIndex: 'receiptNumber', key: 'receipt', render: (n: string | null) => n ?? '—' },
          ]}
        />

        <Divider />
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
          {t('rpl.verify', { origin: window.location.origin })}
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default RplPack;
