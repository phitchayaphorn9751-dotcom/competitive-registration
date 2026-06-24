import { useState, useEffect } from "react"
import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom"
import { getSession, isAdminUser, isSuperAdmin, signOut, fetchAllEvents } from "../../lib/supabase.js"
import { LangToggle } from "../../lib/i18n.jsx"

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/admin/applicants", label: "รายการสมัคร", icon: "👥" },
  { to: "/admin/courses", label: "จัดการรายวิชา", icon: "📚" },
  { to: "/admin/checkin", label: "จุดสแกน (Check-In)", icon: "▣" },
  { to: "/admin/attendance", label: "สรุปการมาเรียน", icon: "▤" },
  { to: "/admin/students", label: "จัดการนักเรียน", icon: "🎓" },
  { to: "/admin/settings", label: "ตั้งค่าเว็บ", icon: "⚙" },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [isSuper, setIsSuper] = useState(false)
  const [event, setEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [ready, setReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function reloadEvents(selectId) {
    const evs = await fetchAllEvents()
    setEvents(evs || [])
    // คงงานที่เลือกไว้เสมอ (ไม่เด้งเปลี่ยนเอง) — เปลี่ยนเฉพาะเมื่อระบุ selectId
    // หรือเมื่องานที่เลือกอยู่ถูกลบไปแล้ว
    setEvent((cur) => {
      if (selectId) return (evs || []).find((e) => e.id === selectId) || cur
      if (cur && (evs || []).some((e) => e.id === cur.id)) {
        // อัปเดตข้อมูล (เช่นชื่อ/สถานะ) ของงานเดิม แต่คง id เดิม
        return (evs || []).find((e) => e.id === cur.id)
      }
      return cur || evs?.[0] || null
    })
    return evs
  }

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) { navigate("/login"); return }
      if (!(await isAdminUser())) { await signOut(); navigate("/login"); return }
      setSession(s)
      setIsSuper(await isSuperAdmin())
      const evs = await fetchAllEvents()
      setEvents(evs || [])
      // เลือกงานที่เปิดรับสมัครก่อน (ปีปัจจุบัน) ถ้าไม่มีใช้งานล่าสุด
      const openEv = (evs || []).find((e) => e.status === "open")
      setEvent(openEv || evs?.[0] || null)
      setReady(true)
    })
  }, [navigate])

  async function handleLogout() { await signOut(); navigate("/login") }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const visibleNav = NAV.filter((n) => !n.superOnly || isSuper)
  const current = NAV.find((n) => location.pathname.startsWith(n.to))

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Overlay (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-[#F15A24] flex items-center justify-center text-white text-xl shrink-0">🎓</div>
          <div className="min-w-0">
            <div className="font-black text-gray-800 text-sm tracking-wide">ADMIN PANEL</div>
            <div className="text-[11px] text-gray-400 truncate">{event ? `${event.name} ${event.year}` : "—"}</div>
          </div>
        </div>
        <div className="px-5 pt-4 pb-2 text-[10px] font-bold text-gray-300 uppercase tracking-widest">เมนูหลัก</div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? "bg-[#F15A24] text-white shadow-sm" : "text-gray-600 hover:bg-orange-50"}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button onClick={handleLogout} className="m-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition">
          ⎋ ออกจากระบบ
        </button>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-2xl text-gray-600 leading-none">☰</button>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-gray-700">Admin</span>
            <span className="text-gray-300">/</span>
            <span className="text-[#F15A24] font-medium">{current?.label || ""}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {events.length > 0 && (
              <div className="relative">
                <select value={event?.id || ""} onChange={(e) => setEvent(events.find((x) => x.id === e.target.value))}
                  className="appearance-none text-sm font-bold text-[#F15A24] bg-white border border-[#F15A24] rounded-xl pl-8 pr-8 py-2 outline-none cursor-pointer max-w-[180px] sm:max-w-[220px] truncate hover:bg-orange-50 transition">
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id} className="text-gray-700">
                      {ev.name} {ev.year}{ev.status === "open" ? " 🟢" : ev.status === "closed" ? " 🔒" : " 📝"}
                    </option>
                  ))}
                </select>
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-sm">📅</span>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#F15A24] pointer-events-none text-xs">▾</span>
              </div>
            )}
            <LangToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 w-full">
          <Outlet context={{ session, event, events, setEvent, isSuper, reloadEvents }} />
        </main>
      </div>
    </div>
  )
}