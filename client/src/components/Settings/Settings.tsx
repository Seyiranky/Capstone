import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Flex, Grid, Segmented, Space, Tabs, Typography } from 'antd';
import {
  BgColorsOutlined,
  DownloadOutlined,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { useThemeMode } from '../../theme/ThemeProvider';
import PageContainer from '../Layout/PageContainer';
import ProfileEditor from './ProfileEditor';
import ExportDataButton from './ExportDataButton';

const Settings = () => {
  const { t, i18n } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const { mode, setMode } = useThemeMode();
  const screens = Grid.useBreakpoint();
  const lang = i18n.resolvedLanguage === 'rw' ? 'rw' : 'en';

  const items = [
    {
      key: 'profile',
      label: (
        <Space size={8}>
          <UserOutlined />
          {t('settings.profile')}
        </Space>
      ),
      children: (
        <Card title={t('settings.profile')}>
          <Typography.Paragraph type="secondary">
            {role === 'worker' ? t('settings.profileDescWorker') : t('settings.profileDescOther')}
          </Typography.Paragraph>
          <ProfileEditor />
        </Card>
      ),
    },
    {
      key: 'appearance',
      label: (
        <Space size={8}>
          <BgColorsOutlined />
          Appearance
        </Space>
      ),
      children: (
        <Card title="Appearance">
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>Theme</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                Match your system, or pick a fixed look.
              </Typography.Paragraph>
              <Segmented
                value={mode}
                onChange={(v) => setMode(v as 'light' | 'dark' | 'system')}
                options={[
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                  { label: 'System', value: 'system' },
                ]}
              />
            </div>
            <div>
              <Typography.Text strong>Language</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                Interface language.
              </Typography.Paragraph>
              <Segmented
                value={lang}
                onChange={(v) => i18n.changeLanguage(v as string)}
                options={[
                  { label: 'English', value: 'en' },
                  { label: 'Kinyarwanda', value: 'rw' },
                ]}
              />
            </div>
          </Space>
        </Card>
      ),
    },
    {
      key: 'security',
      label: (
        <Space size={8}>
          <LockOutlined />
          {t('settings.security')}
        </Space>
      ),
      children: (
        <Card title={t('settings.security')}>
          <Typography.Paragraph type="secondary">
            {t('settings.securityDesc')}
          </Typography.Paragraph>
          <Link to="/forgot-password">
            <Button icon={<LockOutlined />}>{t('settings.resetPasswordLink')}</Button>
          </Link>
        </Card>
      ),
    },
    {
      key: 'data',
      label: (
        <Space size={8}>
          <DownloadOutlined />
          {t('settings.yourData')}
        </Space>
      ),
      children: (
        <Card title={t('settings.yourData')}>
          <ExportDataButton />
        </Card>
      ),
    },
  ];

  return (
    <PageContainer title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <Flex style={{ maxWidth: 860 }}>
        <Tabs
          items={items}
          tabPosition={screens.md ? 'left' : 'top'}
          style={{ width: '100%' }}
        />
      </Flex>
    </PageContainer>
  );
};

export default Settings;
