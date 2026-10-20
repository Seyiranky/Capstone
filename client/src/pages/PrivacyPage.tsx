import { useTranslation } from 'react-i18next';
import { Card, Flex, Typography } from 'antd';
import { Link } from 'react-router-dom';
import LanguageToggle from '../components/common/LanguageToggle';
import logo from '../assets/logo.png';

/** The sections, in order; each has a title and a body in both languages. */
const SECTIONS = ['who', 'collect', 'why', 'share', 'keep', 'rights', 'security', 'age', 'changes'] as const;

/**
 * How Isoko handles personal data, under Rwanda's Law No. 058/2021 on the
 * protection of personal data and privacy (NFR-7). Public: no account needed,
 * so it can be read before signing up.
 */
const PrivacyPage = () => {
  const { t } = useTranslation();
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 48px' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Link to="/">
          <span className="isoko-logo-tile">
            <img src={logo} alt="Isoko" style={{ height: 44, display: 'block' }} />
          </span>
        </Link>
        <LanguageToggle />
      </Flex>
      <Typography.Title level={2} style={{ marginBottom: 4, fontFamily: 'var(--font-heading)' }}>
        {t('privacy.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
        {t('privacy.updated')}
      </Typography.Paragraph>
      <Typography.Paragraph>{t('privacy.intro')}</Typography.Paragraph>
      <Card styles={{ body: { padding: '8px 24px 20px' } }}>
        {SECTIONS.map((key, i) => (
          <section key={key} id={key} style={{ paddingTop: 16 }}>
            <Typography.Title level={4} style={{ marginBottom: 6 }}>
              {i + 1}. {t(`privacy.${key}.title`)}
            </Typography.Title>
            {String(t(`privacy.${key}.body`))
              .split('\n')
              .map((para, n) => (
                <Typography.Paragraph key={n} style={{ marginBottom: 8 }}>
                  {para}
                </Typography.Paragraph>
              ))}
          </section>
        ))}
      </Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 20 }}>
        {t('privacy.contact')} <Link to="/support/contact">{t('privacy.contactLink')}</Link>
      </Typography.Paragraph>
    </div>
  );
};

export default PrivacyPage;
