import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Typography } from 'antd';
import { userApi } from '../../api/userApi';
import type { WorkerHit } from '../../types';

/**
 * Finds a worker by name for a crew or an apprenticeship. Shows trust and
 * review count beside the name, so the choice is informed, and never contact
 * details.
 */
const WorkerPicker = ({
  value,
  onChange,
  exclude = [],
}: {
  value?: string;
  onChange: (id: string, worker: WorkerHit) => void;
  exclude?: string[];
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<WorkerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(() => {
      setLoading(true);
      userApi
        .searchWorkers(q)
        .then(setOptions)
        .finally(() => setLoading(false));
    }, 250);
  };

  return (
    <Select
      showSearch
      value={value}
      placeholder={t('team.pickWorker')}
      filterOption={false}
      onSearch={search}
      loading={loading}
      style={{ width: '100%' }}
      notFoundContent={null}
      onChange={(id) => {
        const hit = options.find((o) => o.id === id);
        if (hit) onChange(id, hit);
      }}
      options={options
        .filter((o) => !exclude.includes(o.id) || o.id === value)
        .map((o) => ({
          value: o.id,
          label: (
            <span>
              {o.name}{' '}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                · {o.reviewCount ? `${o.trustScore.toFixed(1)} trust` : 'new'}
              </Typography.Text>
            </span>
          ),
        }))}
    />
  );
};

export default WorkerPicker;
