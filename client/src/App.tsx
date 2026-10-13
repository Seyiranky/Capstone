import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import GigDetailPage from './pages/GigDetailPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminPendingGigsPage from './pages/AdminPendingGigsPage';
import AdminJobs from './components/Admin/AdminJobs';
import AdminPayments from './components/Admin/AdminPayments';
import AdminSkillReviews from './components/Admin/AdminSkillReviews';
import AdminReviewers from './components/Admin/AdminReviewers';
import AdminMetrics from './components/Admin/AdminMetrics';
import AdminMarket from './components/Admin/AdminMarket';
import AdminSystem from './components/Admin/AdminSystem';
import AdminAuditPage from './pages/AdminAuditPage';
import PassportPage from './pages/PassportPage';
import ReceiptPage from './pages/ReceiptPage';
import DisputesPage from './pages/DisputesPage';
import FairworkPage from './pages/FairworkPage';
import GrowthPage from './components/Growth/GrowthPage';
import RplPack from './components/Growth/RplPack';
import AdminFairwork from './components/Admin/AdminFairwork';
import AdminSafety from './components/Admin/AdminSafety';
import AdminReports from './components/Admin/AdminReports';
import WalletPage from './pages/WalletPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { fetchCurrentUser } from './store/slices/authSlice';

function App() {
  const dispatch = useAppDispatch();
  const { token, profile } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (token && !profile) {
      dispatch(fetchCurrentUser());
    }
  }, [token, profile, dispatch]);

  return (
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
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['worker']} />}>
            <Route path="/growth" element={<GrowthPage />} />
            <Route path="/growth/rpl" element={<RplPack />} />
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
            <Route path="/admin/audit" element={<AdminAuditPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
