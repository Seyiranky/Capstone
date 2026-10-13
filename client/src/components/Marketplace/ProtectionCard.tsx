import { useTranslation } from 'react-i18next';
import { Card, Flex, Typography } from 'antd';
import { AuditOutlined, FileProtectOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';

/**
 * What protects both sides on every Isoko job, shown where a worker decides to
 * apply and a client decides to hire. Each line is a feature the platform
 * actually enforces, not a promise.
 */
const ProtectionCard = () => {
  const { t } = useTranslation();
  const rows = [
    { key: 'escrow', icon: <LockOutlined /> },
    { key: 'code', icon: <KeyOutlined /> },
    { key: 'dispute', icon: <AuditOutlined /> },
    { key: 'receipt', icon: <FileProtectOutlined /> },
  ];
  return (
    <Card title={t('protection.title')}>
      <Flex vertical gap={14}>
        {rows.map((r) => (
          <Flex key={r.key} gap={12} align="flex-start">
            <span className="isoko-stat-icon" style={{ width: 30, height: 30, fontSize: 14 }}>
              {r.icon}
            </span>
            <div>
              <Typography.Text strong style={{ display: 'block', fontSize: 13.5 }}>
                {t(`protection.${r.key}`)}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                {t(`protection.${r.key}Detail`)}
              </Typography.Text>
            </div>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
};

export default ProtectionCard;
