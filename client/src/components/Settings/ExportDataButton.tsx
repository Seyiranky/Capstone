import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Space, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { userApi } from '../../api/userApi';

const ExportDataButton = () => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await userApi.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'isoko-talents-my-data.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Text type="secondary">{t('settings.exportDesc')}</Typography.Text>
      <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
        {t('settings.exportButton')}
      </Button>
    </Space>
  );
};

export default ExportDataButton;
