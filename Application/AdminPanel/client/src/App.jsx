import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import BusDriverAllocation from './pages/BusDriverAllocation.jsx'
import ReviewAllocation from './pages/ReviewAllocation.jsx'
import StudentManagement from './pages/StudentManagement.jsx'
import MappingOverview from './pages/MappingOverview.jsx'
import ReviewStudentAllocation from './pages/ReviewStudentAllocation.jsx'
import UserManagement from './pages/UserManagement.jsx'
import PassManagement from './pages/PassManagement.jsx'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="allocation" element={<BusDriverAllocation />} />
          <Route path="review" element={<ReviewAllocation />} />
          <Route path="students" element={<StudentManagement />} />
          <Route path="students/review" element={<ReviewStudentAllocation />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="passes" element={<PassManagement />} />
          <Route path="mapping" element={<MappingOverview />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
