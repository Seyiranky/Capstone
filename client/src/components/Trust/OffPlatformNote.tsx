import { useTranslation } from 'react-i18next';
import { SafetyOutlined } from '@ant-design/icons';

/**
 * Shown under a message that shares contact details or talks about paying
 * outside Isoko. The message itself is delivered unchanged; this only reminds
 * both people that only payments made through Isoko are recorded and protected.
 */
const OffPlatformNote = ({ flag, own }: { flag: 'contact' | 'payment'; own: boolean }) => {
  const { t } = useTranslation();
  const key = flag === 'payment' ? (own ? 'trust.paymentOwn' : 'trust.paymentOther') : 'trust.contactNote';
  return (
    <div role="note" className={`isoko-offplatform isoko-offplatform--${flag}`}>
      <SafetyOutlined />
      <span>{t(key)}</span>
    </div>
  );
};

export default OffPlatformNote;
