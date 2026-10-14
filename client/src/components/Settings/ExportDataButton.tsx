import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Typography } from 'antd';
import { CodeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { userApi } from '../../api/userApi';

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/**
 * A copy of the person's data, in two forms: a PDF report most people can
 * open and print, and JSON for anyone who wants the records as data.
 */
const ExportDataButton = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'pdf' | 'json' | null>(null);

  const run = async (kind: 'pdf' | 'json') => {
    setBusy(kind);
    try {
      if (kind === 'pdf') {
        save(await userApi.exportMyDataPdf(), 'isoko-my-data.pdf');
      } else {
        const data = await userApi.exportMyData();
        save(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'isoko-my-data.json');
      }
    } catch {
      message.error(t('settings.exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Flex vertical gap={14}>
      <Typography.Text type="secondary">{t('settings.exportDesc')}</Typography.Text>
      <Flex gap={8} wrap="wrap">
        <Button type="primary" icon={<FilePdfOutlined />} onClick={() => run('pdf')} loading={busy === 'pdf'} disabled={busy === 'json'}>
          {t('settings.exportPdf')}
        </Button>
        <Button icon={<CodeOutlined />} onClick={() => run('json')} loading={busy === 'json'} disabled={busy === 'pdf'}>
          {t('settings.exportJson')}
        </Button>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
        {t('settings.exportFormats')}
      </Typography.Text>
    </Flex>
  );
};

export default ExportDataButton;
