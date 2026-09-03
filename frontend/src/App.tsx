import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';

import { SetupWizardPage } from './features/auth/SetupWizardPage';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TableListPage } from './features/tables/TableListPage';
import { TableBuilderPage } from './features/tables/TableBuilderPage';
import { DynamicGridPage } from './features/records/DynamicGridPage';
import { ExcelImportWizard } from './features/imports/ExcelImportWizard';
import { ImportHistoryPage } from './features/imports/ImportHistoryPage';
import { ExportHistoryPage } from './features/exports/ExportHistoryPage';
import { UsersPage } from './features/security/UsersPage';
import { RolesPage } from './features/security/RolesPage';
import { SessionsPage } from './features/security/SessionsPage';
import { AuditLogsPage } from './features/audit/AuditLogsPage';
import { SensitiveAccessLogsPage } from './features/audit/SensitiveAccessLogsPage';
import { SystemSettingsPage } from './features/settings/SystemSettingsPage';

// Protected Route Wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, setupRequired } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public / Setup Routes */}
            <Route path="/setup" element={<SetupWizardPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Enterprise Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="tables" element={<TableListPage />} />
              <Route path="tables/create" element={<TableBuilderPage />} />
              <Route path="tables/:tableId" element={<DynamicGridPage />} />
              <Route path="imports/wizard" element={<ExcelImportWizard />} />
              <Route path="imports/history" element={<ImportHistoryPage />} />
              <Route path="exports/history" element={<ExportHistoryPage />} />
              <Route path="security/users" element={<UsersPage />} />
              <Route path="security/roles" element={<RolesPage />} />
              <Route path="security/sessions" element={<SessionsPage />} />
              <Route path="audit/logs" element={<AuditLogsPage />} />
              <Route path="audit/sensitive" element={<SensitiveAccessLogsPage />} />
              <Route path="settings" element={<SystemSettingsPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
