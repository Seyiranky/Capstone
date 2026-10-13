import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import SmsHealthCard from './SmsHealthCard';

/** Whether notifications are getting through. */
const AdminSystem = () => {
  const { t } = useTranslation();
  return (
    <PageContainer title={t('adminNav.systemHealth')} subtitle={t('adminNav.systemSub')}>
      <SmsHealthCard />
    </PageContainer>
  );
};

export default AdminSystem;
