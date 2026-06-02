import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Spinner } from './components/UI';

// Pages
import Login          from './pages/Login';
import AdminOverview  from './pages/AdminOverview';
import AdminDrivers   from './pages/AdminDrivers';
import AdminInvestors from './pages/AdminInvestors';
import AdminPayments  from './pages/AdminPayments';
import AdminUpload    from './pages/AdminUpload';
import { AdminHistory } from './pages/AdminHistory';
import AdminUsers from './pages/AdminUsers';
import { InvestorOverview, InvestorVehicles } from './pages/InvestorDashboard';
import { DriverOverview, DriverPayments } from './pages/DriverDashboard';

// ── Route guard ──────────────────────────────────────────────────────────────
function RequireAuth({ role, children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner size={48} /></div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (role && profile?.role !== role) return <Navigate to="/login" replace />;
  return children;
}

// ── After login redirect ─────────────────────────────────────────────────────
function RootRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner size={48} /></div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (profile?.role === 'admin')    return <Navigate to="/admin"    replace />;
  if (profile?.role === 'investor') return <Navigate to="/investor" replace />;
  if (profile?.role === 'driver')   return <Navigate to="/driver"   replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/"      element={<RootRedirect />} />

          {/* ── Admin ─────────────────────────────────────────────── */}
          <Route path="/admin" element={
            <RequireAuth role="admin"><AdminOverview /></RequireAuth>
          }/>
          <Route path="/admin/drivers" element={
            <RequireAuth role="admin"><AdminDrivers /></RequireAuth>
          }/>
          <Route path="/admin/investors" element={
            <RequireAuth role="admin"><AdminInvestors /></RequireAuth>
          }/>
          <Route path="/admin/payments" element={
            <RequireAuth role="admin"><AdminPayments /></RequireAuth>
          }/>
          <Route path="/admin/upload" element={
            <RequireAuth role="admin"><AdminUpload /></RequireAuth>
          }/>
          <Route path="/admin/history" element={
            <RequireAuth role="admin"><AdminHistory /></RequireAuth>
          }/>
          <Route path="/admin/users" element={
            <RequireAuth role="admin"><AdminUsers /></RequireAuth>
          }/>

          {/* ── Investor ──────────────────────────────────────────── */}
          <Route path="/investor" element={
            <RequireAuth role="investor"><InvestorOverview /></RequireAuth>
          }/>
          <Route path="/investor/vehicles" element={
            <RequireAuth role="investor"><InvestorVehicles /></RequireAuth>
          }/>
          <Route path="/investor/payouts" element={
            <RequireAuth role="investor"><InvestorOverview /></RequireAuth>
          }/>

          {/* ── Driver ────────────────────────────────────────────── */}
          <Route path="/driver" element={
            <RequireAuth role="driver"><DriverOverview /></RequireAuth>
          }/>
          <Route path="/driver/payments" element={
            <RequireAuth role="driver"><DriverPayments /></RequireAuth>
          }/>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
