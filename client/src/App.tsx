import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import GigDetailPage from './pages/GigDetailPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminPendingGigsPage from './pages/AdminPendingGigsPage';
import AdminCompletedGigsPage from './pages/AdminCompletedGigsPage';
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
      {/* Verification now lives as a section on the Dashboard. */}
      <Route path="/verification" element={<Navigate to="/dashboard" replace />} />
      {/* Mentorship is now folded into the broader Notifications section. */}
      <Route path="/mentorship" element={<Navigate to="/notifications" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/gigs/:id" element={<GigDetailPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<ProtectedRoute allowedRoles={['worker', 'client', 'admin']} />}>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['worker', 'client']} />}>
            <Route path="/wallet" element={<WalletPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/gigs/pending" element={<AdminPendingGigsPage />} />
            <Route path="/admin/gigs/completed" element={<AdminCompletedGigsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
