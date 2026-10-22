import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
// Every page but sign-in and sign-up is loaded when it is first opened, so a
// visitor downloads the sign-in screen, not the whole app with its charts and
// map. On a low-end phone over slow 4G the single 3.6 MB bundle took about
// 7 s to show anything (docs/evidence/perf).
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const GigDetailPage = lazy(() => import('./pages/GigDetailPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminPendingGigsPage = lazy(() => import('./pages/AdminPendingGigsPage'));
const AdminJobs = lazy(() => import('./components/Admin/AdminJobs'));
const AdminPayments = lazy(() => import('./components/Admin/AdminPayments'));
const AdminSkillReviews = lazy(() => import('./components/Admin/AdminSkillReviews'));
const AdminReviewers = lazy(() => import('./components/Admin/AdminReviewers'));
const AdminMetrics = lazy(() => import('./components/Admin/AdminMetrics'));
const AdminMarket = lazy(() => import('./components/Admin/AdminMarket'));
const AdminSystem = lazy(() => import('./components/Admin/AdminSystem'));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage'));
const PassportPage = lazy(() => import('./pages/PassportPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const DisputesPage = lazy(() => import('./pages/DisputesPage'));
const FairworkPage = lazy(() => import('./pages/FairworkPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const AdminFairwork = lazy(() => import('./components/Admin/AdminFairwork'));
const AdminSafety = lazy(() => import('./components/Admin/AdminSafety'));
const AdminReports = lazy(() => import('./components/Admin/AdminReports'));
const AdminCover = lazy(() => import('./components/Admin/AdminCover'));
const FindWorkersPage = lazy(() => import('./components/Workers/FindWorkersPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const PeerReviewsPage = lazy(() => import('./pages/PeerReviewsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const SupportTicketPage = lazy(() => import('./pages/SupportTicketPage'));
const SupportTopicPage = lazy(() => import('./pages/SupportTopicPage'));
const SupportArticlePage = lazy(() => import('./pages/SupportArticlePage'));
const SupportRequestsPage = lazy(() => import('./pages/SupportRequestsPage'));
const GuestContactPage = lazy(() => import('./pages/GuestSupportPage').then((m) => ({ default: m.GuestContactPage })));
const GuestTicketPage = lazy(() => import('./pages/GuestSupportPage').then((m) => ({ default: m.GuestTicketPage })));
const AdminSupport = lazy(() => import('./components/Admin/AdminSupport'));
const AdminApplications = lazy(() => import('./components/Admin/AdminApplications'));
import { useAppDispatch, useAppSelector } from './store/hooks';
import { fetchCurrentUser } from './store/slices/authSlice';
import PageLoading from './components/common/PageLoading';

function App() {
  const dispatch = useAppDispatch();
  const { token, profile } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (token && !profile) {
      dispatch(fetchCurrentUser());
    }
  }, [token, profile, dispatch]);

  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Opened from a mail client, so it cannot require a session. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Public by design: a client checks a passport without an account. */}
      <Route path="/p/:token" element={<PassportPage />} />
      <Route path="/r/:number" element={<ReceiptPage />} />
      <Route path="/fairwork" element={<FairworkPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* Support for people who cannot sign in, and the private link they are emailed. */}
      <Route path="/support/contact" element={<GuestContactPage />} />
      <Route path="/support/t/:token" element={<GuestTicketPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/gigs/:id" element={<GigDetailPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/disputes" element={<DisputesPage />} />

          <Route element={<ProtectedRoute allowedRoles={['worker', 'client', 'admin']} />}>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['worker', 'client']} />}>
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/support/topics/:category" element={<SupportTopicPage />} />
            <Route path="/support/topics/:category/:n" element={<SupportArticlePage />} />
            <Route path="/support/requests" element={<SupportRequestsPage />} />
            <Route path="/support/:id" element={<SupportTicketPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['client', 'admin']} />}>
            <Route path="/workers" element={<FindWorkersPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['worker']} />}>
            <Route path="/reviews" element={<PeerReviewsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/gigs/pending" element={<AdminPendingGigsPage />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/reviews" element={<AdminSkillReviews />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/reviewers" element={<AdminReviewers />} />
            <Route path="/admin/metrics" element={<AdminMetrics />} />
            <Route path="/admin/market" element={<AdminMarket />} />
            <Route path="/admin/system" element={<AdminSystem />} />
            <Route path="/admin/fairwork" element={<AdminFairwork />} />
            <Route path="/admin/safety" element={<AdminSafety />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/support" element={<AdminSupport />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/cover" element={<AdminCover />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}

export default App;
