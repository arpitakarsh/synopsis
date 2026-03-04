import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import UploadPage from './pages/UploadPage'
import HistoryPage from './pages/HistoryPage'
import DashboardPage from './pages/DashboardPage'
import TeamPage from './pages/TeamPage'
import ComparePage from './pages/ComparePage'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import ProfilePage from './pages/ProfilePage'

function hasToken() {
  return Boolean(localStorage.getItem('token'))
}

function ProtectedRoute({ children }) {
  if (!hasToken()) return <Navigate to="/auth" replace />
  return children
}

function PublicRoute({ children }) {
  if (hasToken()) return <Navigate to="/app/dashboard" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute>
            <LandingPage />
          </PublicRoute>
        }
      />
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to={hasToken() ? '/app/dashboard' : '/'} replace />}
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
