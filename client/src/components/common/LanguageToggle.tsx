import { useTranslation } from 'react-i18next';
import { Segmented } from 'antd';

const LanguageToggle = () => {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'rw' ? 'rw' : 'en';

  return (
    <Segmented
      size="small"
      value={lang}
      onChange={(v) => i18n.changeLanguage(v as string)}
      options={[
        { label: 'EN', value: 'en' },
        { label: 'RW', value: 'rw' },
      ]}
    />
  );
};

export default LanguageToggle;
