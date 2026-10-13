import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Flex, Grid, Segmented, Space, Tabs, Typography } from 'antd';
import {
  BellOutlined,
  BgColorsOutlined,
  DownloadOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../store/hooks';
import { useThemeMode } from '../../theme/ThemeProvider';
import PageContainer from '../Layout/PageContainer';
import ProfileEditor from './ProfileEditor';
import ExportDataButton from './ExportDataButton';
import NotificationPreferences from './NotificationPreferences';
import PassportPanel from '../Profile/PassportPanel';
import MySkillsPanel from '../Verification/MySkillsPanel';
import TrustedContactForm from '../Safety/TrustedContactForm';

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
          {t('common.appearance')}
        </Space>
      ),
      children: (
        <Card title={t('common.appearance')}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>{t('common.theme')}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {t('common.themeHint')}
              </Typography.Paragraph>
              <Segmented
                value={mode}
                onChange={(v) => setMode(v as 'light' | 'dark' | 'system')}
                options={[
                  { label: t('common.light'), value: 'light' },
                  { label: t('common.dark'), value: 'dark' },
                  { label: t('common.system'), value: 'system' },
                ]}
              />
            </div>
            <div>
              <Typography.Text strong>{t('common.language')}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {t('common.languageHint')}
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
      key: 'notifications',
      label: (
        <Space size={8}>
          <BellOutlined />
          {t('settings.notifications.title')}
        </Space>
      ),
      children: (
        <Card title={t('settings.notifications.title')}>
          <NotificationPreferences />
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

  // Only workers hold skills, credentials or a passport. These splice by
  // position, so anything new belongs after them -- inserting above would push
  // Credentials and Passport out of their intended slots.
  if (role === 'worker') {
    items.splice(1, 0, {
      key: 'skills',
      label: (
        <Space>
          <SafetyCertificateOutlined />
          {t('credentials.title')}
        </Space>
      ),
      children: <MySkillsPanel />,
    });
    items.splice(2, 0, {
      key: 'passport',
      label: (
        <Space>
          <SafetyCertificateOutlined />
          {t('passport.title')}
        </Space>
      ),
      children: <PassportPanel />,
    });
    items.push({
      key: 'safety',
      label: (
        <Space>
          <AlertOutlined />
          {t('safety.title')}
        </Space>
      ),
      children: (
        <Card title={t('safety.title')}>
          <TrustedContactForm />
        </Card>
      ),
    });
  }

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
