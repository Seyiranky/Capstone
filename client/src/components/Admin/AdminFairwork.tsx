import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import FairworkView from '../Fairwork/FairworkView';

const AdminFairwork = () => {
  const { t } = useTranslation();
  return (
    <PageContainer title={t('fairwork.title')} subtitle={t('fairwork.subtitle')} extra={<a href="/fairwork" target="_blank" rel="noreferrer">/fairwork ↗</a>}>
      <FairworkView />
    </PageContainer>
  );
};

export default AdminFairwork;
