import type { ReactNode } from 'react';
import { Flex, Typography } from 'antd';

interface PageContainerProps {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}

// Standard page frame: title row (with optional actions) + content.
const PageContainer = ({ title, subtitle, extra, children }: PageContainerProps) => (
  <div>
    <Flex
      justify="space-between"
      align="flex-start"
      gap={16}
      wrap="wrap"
      style={{ marginBottom: 24 }}
    >
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra && <div>{extra}</div>}
    </Flex>
    {children}
  </div>
);

export default PageContainer;
