import { useTranslation } from 'react-i18next';
import PageContainer from '../components/Layout/PageContainer';
import CollusionReport from '../components/Admin/CollusionReport';

const AdminAuditPage = () => {
  const { t } = useTranslation();
  return (
    <PageContainer title={t('adminNav.audit')} subtitle={t('adminNav.auditSub')}>
      <CollusionReport />
    </PageContainer>
  );
};

export default AdminAuditPage;
