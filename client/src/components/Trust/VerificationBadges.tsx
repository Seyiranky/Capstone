import { useTranslation } from 'react-i18next';
import { Flex, Tooltip } from 'antd';
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons';

interface VerificationBadgesProps {
  phone?: boolean | string | null;
  email?: boolean | string | null;
  size?: 'small' | 'default';
}

/** Which of a person's contact details are confirmed, never the details themselves. */
const VerificationBadges = ({ phone, email, size = 'default' }: VerificationBadgesProps) => {
  const { t } = useTranslation();
  const font = size === 'small' ? 12 : 13;
  const item = (ok: boolean, label: string, hint: string) => (
    <Tooltip title={hint}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font, color: ok ? 'inherit' : 'var(--isoko-muted)' }}>
        {ok ? <CheckCircleFilled style={{ color: '#16a34a' }} /> : <MinusCircleOutlined />}
        {label}
      </span>
    </Tooltip>
  );
  return (
    <Flex gap={12} wrap="wrap" align="center">
      {item(Boolean(phone), t('trust.phoneConfirmed'), t(phone ? 'trust.phoneConfirmedHint' : 'trust.notConfirmedHint'))}
      {item(Boolean(email), t('trust.emailConfirmed'), t(email ? 'trust.emailConfirmedHint' : 'trust.notConfirmedHint'))}
    </Flex>
  );
};

export default VerificationBadges;
