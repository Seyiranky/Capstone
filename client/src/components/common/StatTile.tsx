import type { ReactNode } from 'react';
import { Card, Flex, Typography } from 'antd';

/** A headline number with an icon badge, a unit and an optional footnote. */
const StatTile = ({
  icon,
  label,
  value,
  suffix,
  footer,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  /** Accepted for older callers; tiles use one brand tone. */
  tone?: 'navy' | 'gold' | 'terracotta';
  footer?: ReactNode;
}) => (
  <Card size="small" style={{ height: '100%' }} styles={{ body: { padding: 16 } }}>
    <Flex gap={12} align="flex-start">
      <span className="isoko-stat-icon isoko-stat-tile-icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
          {label}
        </Typography.Text>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value}
          {suffix && (
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--isoko-muted)', marginInlineStart: 4 }}>
              {suffix}
            </span>
          )}
        </div>
        {footer && <div style={{ marginTop: 6 }}>{footer}</div>}
      </div>
    </Flex>
  </Card>
);

export default StatTile;
