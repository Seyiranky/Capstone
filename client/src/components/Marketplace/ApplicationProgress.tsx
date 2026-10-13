import { useTranslation } from 'react-i18next';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type { GigApplicationStatus } from '../../types';

/**
 * Where a worker's application stands, as three equal segments.
 *
 * Replaces antd Steps, whose dot layout centred its labels away from the card
 * edge on desktop and collapsed into a misaligned vertical list on phones. A
 * grid of equal columns keeps the first segment flush with the card's content
 * and reads the same at every width.
 */
const ApplicationProgress = ({ status }: { status: GigApplicationStatus }) => {
  const { t } = useTranslation();
  const rejected = status === 'rejected';
  const reached = status === 'pending' ? 2 : 3;

  const steps = [
    t('marketplace.gigDetail.steps.applied'),
    t('marketplace.gigDetail.steps.underReview'),
    rejected ? t('marketplace.gigDetail.steps.notAccepted') : t('marketplace.gigDetail.steps.approved'),
  ];

  return (
    <div
      role="list"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}
    >
      {steps.map((label, i) => {
        const done = i < reached;
        const isLast = i === steps.length - 1;
        const failed = rejected && isLast;
        const current = status === 'pending' && i === 1;
        const color = failed
          ? 'var(--ant-color-error, #dc2626)'
          : done
            ? 'var(--ant-color-success, #16a34a)'
            : 'var(--ant-color-fill-secondary, #e4e4e7)';
        return (
          <div role="listitem" key={label} aria-current={current ? 'step' : undefined}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: color,
                opacity: current ? 0.55 : 1,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, minWidth: 0 }}>
              {done && !current && (
                <span style={{ color, fontSize: 11, flexShrink: 0 }}>
                  {failed ? <CloseOutlined /> : <CheckOutlined />}
                </span>
              )}
              <Typography.Text
                type={done ? undefined : 'secondary'}
                strong={current || (isLast && done)}
                style={{ fontSize: 13 }}
                ellipsis={{ tooltip: label }}
              >
                {label}
              </Typography.Text>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ApplicationProgress;
