import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TariffProvider } from "./context/TariffContext";
import DashboardPage from "./pages/DashboardPage";
import DashboardOverview from "./pages/DashboardOverview";
import ReportSchedulerPage from "./pages/ReportSchedulerPage";
import TenantBillingPage from "./pages/TenantBillingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import "./App.css";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div id="loading-overlay">
      <div className="loading-inner">
        <div className="loading-spinner" />
        <div className="loading-text">Loading…</div>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <TariffProvider>
            <DashboardPage />
          </TariffProvider>
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <TariffProvider>
            <DashboardOverview />
          </TariffProvider>
        </ProtectedRoute>
      } />
      <Route path="/report-scheduler" element={
        <ProtectedRoute>
          <TariffProvider>
            <ReportSchedulerPage />
          </TariffProvider>
        </ProtectedRoute>
      } />
      <Route path="/tenant-billing" element={
        <ProtectedRoute>
          <TariffProvider>
            <TenantBillingPage />
          </TariffProvider>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}