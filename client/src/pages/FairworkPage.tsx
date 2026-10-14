import { useTranslation } from 'react-i18next';
import { Flex, Typography } from 'antd';
import { Link } from 'react-router-dom';
import FairworkView from '../components/Fairwork/FairworkView';
import LanguageToggle from '../components/common/LanguageToggle';
import logo from '../assets/logo.png';

/** The public scorecard: no account needed, the platform answering for itself. */
const FairworkPage = () => {
  const { t } = useTranslation();
  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px 48px' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Link to="/">
          <img src={logo} alt="Isoko Talents" style={{ height: 44, display: 'block' }} />
        </Link>
        <LanguageToggle />
      </Flex>
      <Typography.Title level={2} style={{ marginBottom: 4, fontFamily: 'var(--font-heading)' }}>
        {t('fairwork.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24, maxWidth: 720 }}>
        {t('fairwork.subtitle')}
      </Typography.Paragraph>
      <FairworkView />
    </div>
  );
};

export default FairworkPage;
