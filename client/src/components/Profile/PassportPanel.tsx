import { useState } from 'react';
import { App, Alert, Button, Card, Flex, Input, Space, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { passportApi } from '../../api/passportApi';

/**
 * Issue and share a skill passport.
 *
 * The QR matters more than the link: a worker showing a phone screen to a
 * client standing in front of them is the actual sharing mechanism here, not
 * emailing a URL.
 */
const PassportPanel = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const url = token ? `${window.location.origin}/p/${token}` : null;

  const issue = async () => {
    setBusy(true);
    try {
      const res = await passportApi.issue();
      setToken(res.token);
      message.success(t('passport.issued'));
    } catch {
      message.error(t('passport.issueFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await passportApi.revoke();
      setToken(null);
      message.success(t('passport.revoked'));
    } finally {
      setBusy(false);
    }
  };

  const downloadStatement = async () => {
    setBusy(true);
    try {
      const blob = await passportApi.incomeStatementCsv();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'isoko-income-statement.csv';
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      message.error(t('passport.statementFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={
          <Flex align="center" gap={8}>
            <SafetyCertificateOutlined />
            {t('passport.title')}
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('passport.explainer')}
        </Typography.Paragraph>

        {url ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Flex justify="center" style={{ padding: 12, background: '#fff', borderRadius: 8 }}>
              <QRCodeSVG value={url} size={168} />
            </Flex>
            <Input
              readOnly
              value={url}
              addonAfter={
                <CopyOutlined
                  onClick={() => {
                    navigator.clipboard?.writeText(url);
                    message.success(t('passport.copied'));
                  }}
                  style={{ cursor: 'pointer' }}
                />
              }
            />
            <Alert type="info" showIcon message={t('passport.shareNote')} />
            <Button danger onClick={revoke} loading={busy} block>
              {t('passport.revoke')}
            </Button>
          </Space>
        ) : (
          <Button type="primary" onClick={issue} loading={busy} block>
            {t('passport.issue')}
          </Button>
        )}
      </Card>

      <Card title={t('income.title')}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('income.explainer')}
        </Typography.Paragraph>
        <Button icon={<DownloadOutlined />} onClick={downloadStatement} loading={busy} block>
          {t('income.download')}
        </Button>
      </Card>
    </Space>
  );
};

export default PassportPanel;
