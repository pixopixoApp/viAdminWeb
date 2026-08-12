import { Navigate, Route, Routes } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { getToken } from './api'
import { AuthProvider, useAuth } from './auth'
import AppLayout from './layout/AppLayout'
import AnnotatePage from './pages/AnnotatePage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import LoginPage from './pages/LoginPage'
import RunDetailPage from './pages/RunDetailPage'
import RunListPage from './pages/RunListPage'
import SettingsPage from './pages/SettingsPage'
import AccountsPage from './pages/AccountsPage'
import StaffPage from './pages/StaffPage'
import StoryEditPage, { StoryRedirect } from './pages/StoryEditPage'
import CreatorInvitesPage from './pages/CreatorInvitesPage'
import ModerationPage from './pages/ModerationPage'
import HtmlImportsPage from './pages/HtmlImportsPage'
import AppVersionPolicyPage from './pages/AppVersionPolicyPage'
import InteractionIntentCatalogPage from './pages/InteractionIntentCatalogPage'

function Private({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (!getToken()) return <Navigate to="/login" replace />
  if (loading) return null
  if (me?.must_change_password) return <Navigate to="/change-password" replace />
  return <>{children}</>
}

function ChangePasswordGate({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminGate({ page }: { page: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (loading) return null
  if (me?.role !== 'admin') return <Navigate to="/" replace />
  return <>{page}</>
}

function StaffGate() {
  const { me, loading } = useAuth()
  if (loading) return null
  if (me?.role !== 'admin' && me?.role !== 'manager') return <Navigate to="/" replace />
  return <StaffPage />
}

function OperationsGate({ page }: { page: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (loading) return null
  if (me?.role !== 'admin' && me?.role !== 'manager') return <Navigate to="/" replace />
  return <>{page}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <ChangePasswordGate>
            <ChangePasswordPage />
          </ChangePasswordGate>
        }
      />
      <Route
        path="/"
        element={
          <Private>
            <AppLayout />
          </Private>
        }
      >
        <Route index element={<RunListPage />} />
        <Route path="runs/:id" element={<RunDetailPage />} />
        <Route path="runs/:id/annotate/:version" element={<AnnotatePage />} />
        <Route path="stories/:id" element={<StoryRedirect />} />
        <Route path="stories/:id/:version" element={<StoryEditPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="creator-invites" element={<OperationsGate page={<CreatorInvitesPage />} />} />
        <Route path="moderation" element={<OperationsGate page={<ModerationPage />} />} />
        <Route path="html-imports" element={<OperationsGate page={<HtmlImportsPage />} />} />
        <Route path="staff" element={<StaffGate />} />
        <Route path="interaction-intents" element={<AdminGate page={<InteractionIntentCatalogPage />} />} />
        <Route path="app-versions" element={<AdminGate page={<AppVersionPolicyPage />} />} />
        <Route path="settings" element={<AdminGate page={<SettingsPage />} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
