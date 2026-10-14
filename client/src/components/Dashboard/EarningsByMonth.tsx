import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Typography } from 'antd';
import { ColumnChart } from '../common/charts';
import { countsAsMoved, movedAt } from '../../lib/money';
import type { Role, Transaction } from '../../types';

/** The last six months of money moved, one bar a month, with the total above. */
const EarningsByMonth = ({ transactions, role }: { transactions: Transaction[]; role: Role }) => {
  const { t, i18n } = useTranslation();
  const { bars, total } = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const sums = new Map(months.map((m) => [`${m.getFullYear()}-${m.getMonth()}`, 0]));
    let sum = 0;
    for (const tx of transactions.filter((x) => countsAsMoved(x, role))) {
      const d = new Date(movedAt(tx));
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (sums.has(key)) {
        const amount = Number(tx.releasedAmount ?? tx.amount);
        sums.set(key, (sums.get(key) ?? 0) + amount);
        sum += amount;
      }
    }
    return {
      bars: months.map((m) => ({
        label: m.toLocaleDateString(i18n.resolvedLanguage, { month: 'short' }),
        value: sums.get(`${m.getFullYear()}-${m.getMonth()}`) ?? 0,
      })),
      total: sum,
    };
  }, [transactions, role, i18n.resolvedLanguage]);

  return (
    <Card
      title={role === 'client' ? t('dashboard.paidByMonth') : t('dashboard.earnedByMonth')}
      extra={
        <Typography.Text strong>
          {total.toLocaleString()} <span style={{ fontWeight: 400, color: 'var(--isoko-muted)' }}>RWF</span>
        </Typography.Text>
      }
    >
      {total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.nothingYetMonths')} />
      ) : (
        <ColumnChart data={bars} height={200} single />
      )}
    </Card>
  );
};

export default EarningsByMonth;
