import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect } from "react"
import { fetchOpenEvent, fetchEventSettings } from "./lib/supabase.js"
import Navbar from "./components/Navbar.jsx"
import HomePage from "./pages/HomePage.jsx"
import LoginPage from "./pages/LoginPage.jsx"
import SignUpPage from "./pages/SignUpPage.jsx"
import ProfilePage from "./pages/ProfilePage.jsx"
import RegisterPage from "./pages/RegisterPage.jsx"
import PayPage from "./pages/PayPage.jsx"
import MyRegistrationPage from "./pages/MyRegistrationPage.jsx"
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx"
import CheckInPage from "./pages/CheckInPage.jsx"

// Admin
import AdminLayout from "./pages/admin/AdminLayout.jsx"
import AdminDashboard from "./pages/admin/AdminDashboard.jsx"
import AdminApplicants from "./pages/admin/AdminApplicants.jsx"
import AdminVerifySlip from "./pages/admin/AdminVerifySlip.jsx"
import AdminCourses from "./pages/admin/AdminCourses.jsx"
import AdminUsers from "./pages/admin/AdminUsers.jsx"
import AdminStudents from "./pages/admin/AdminStudents.jsx"
import AdminAttendance from "./pages/admin/AdminAttendance.jsx"
import AdminCheckIn from "./pages/admin/AdminCheckIn.jsx"
import AdminSettings from "./pages/admin/AdminSettings.jsx"
import AdminEvents from "./pages/admin/AdminEvents.jsx"
import AdminImport from "./pages/admin/AdminImport.jsx"
import AdminCertificate from "./pages/admin/AdminCertificate.jsx"
import AdminSurveys from "./pages/admin/AdminSurveys.jsx"
<Route path="surveys" element={<AdminSurveys />} />
export default function App() {
  const location = useLocation()

  // ตั้งชื่อแท็บเบราว์เซอร์ตามชื่องานที่เปิด (จากหน้า settings)
  useEffect(() => {
    (async () => {
      try {
        const ev = await fetchOpenEvent()
        if (!ev) return
        let title = ev.name
        try {
          const es = await fetchEventSettings(ev.id)
          if (es?.site_title) title = es.site_title
        } catch (_) {}
        if (title) document.title = title
      } catch (_) {}
    })()
  }, [])

  // ซ่อน Navbar เฉพาะหน้า checkin และ admin (หน้าเหล่านี้มี layout เต็มจอของตัวเอง)
  const hideNavbar = location.pathname.startsWith("/checkin") || location.pathname.startsWith("/admin")

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/register/:courseId" element={<RegisterPage />} />
      <Route path="/pay/:regId" element={<PayPage />} />
      <Route path="/my-registration" element={<MyRegistrationPage />} />
      <Route path="/checkin" element={<CheckInPage />} />

      {/* /admin ชี้ไปหน้า login (guard ใน AdminLayout) */}
      <Route path="/admin/login" element={<LoginPage />} />

      {/* Admin Zone — nested route + AdminLayout (sidebar + Outlet) */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="events" element={<AdminEvents />} />
        <Route path="applicants" element={<AdminApplicants />} />
        <Route path="verify/:id" element={<AdminVerifySlip />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="checkin" element={<AdminCheckIn />} />
        <Route path="import" element={<AdminImport />} />
        <Route path="certificate" element={<AdminCertificate />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
    </>
  )
}