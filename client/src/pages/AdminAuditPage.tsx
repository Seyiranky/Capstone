import PageContainer from '../components/Layout/PageContainer';
import AdminNav from '../components/Admin/AdminNav';
import CollusionReport from '../components/Admin/CollusionReport';

const AdminAuditPage = () => (
  <PageContainer title="Review audit">
    <AdminNav />
    <CollusionReport />
  </PageContainer>
);

export default AdminAuditPage;
