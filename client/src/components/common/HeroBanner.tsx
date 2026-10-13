import type { ReactNode } from 'react';
import { Flex, Typography } from 'antd';

/**
 * The header that opens the main pages: a small context line, a greeting or
 * headline, a line of explanation and the next thing to do. Plain on the white
 * page, like any well-made dashboard; the brand shows in the navy actions.
 */
const HeroBanner = ({
  eyebrow,
  title,
  subtitle,
  actions,
  aside,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) => (
  <div
    style={{
      padding: '4px 0 22px',
      marginBottom: 22,
      borderBottom: '1px solid var(--isoko-border)',
    }}
  >
    <Flex justify="space-between" align="flex-end" gap={20} wrap="wrap">
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        {eyebrow && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {eyebrow}
          </Typography.Text>
        )}
        <Typography.Title level={2} style={{ margin: '2px 0 6px', fontFamily: 'var(--font-heading)', lineHeight: 1.2 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 620 }}>
            {subtitle}
          </Typography.Paragraph>
        )}
        {children}
      </div>
      {(actions || aside) && (
        <Flex gap={16} align="center" wrap="wrap" style={{ flex: '0 0 auto' }}>
          {aside}
          {actions && (
            <Flex gap={10} wrap="wrap">
              {actions}
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  </div>
);

export default HeroBanner;
