import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import type { RejectionBreakdown, RejectionReason } from '../../types';

const REASONS: RejectionReason[] = ['skillLevel', 'distance', 'timing', 'other', 'choseAnother'];

/** Rejection reasons by skill: where workers fall short, and where they are missing. */
const RejectionBreakdownCard = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RejectionBreakdown[] | null>(null);

  useEffect(() => {
    adminApi
      .rejectionReasons()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const columns: ColumnsType<RejectionBreakdown> = [
    { title: t('rejection.skill'), dataIndex: 'skill', key: 'skill' },
    ...REASONS.map((r) => ({
      title: t(`rejection.${r}`),
      key: r,
      align: 'right' as const,
      responsive: r === 'skillLevel' || r === 'distance' ? undefined : (['md'] as ('md')[]),
      render: (_: unknown, row: RejectionBreakdown) => row.counts[r] ?? '—',
    })),
  ];

  return (
    <Card title={t('rejection.breakdownTitle')} style={{ marginTop: 16 }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
        {t('rejection.breakdownHelp')}
      </Typography.Paragraph>
      {rows && rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rejection.none')} />
      ) : (
        <Table
          rowKey="skill"
          size="small"
          loading={!rows}
          columns={columns}
          dataSource={rows ?? []}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
    </Card>
  );
};

export default RejectionBreakdownCard;
