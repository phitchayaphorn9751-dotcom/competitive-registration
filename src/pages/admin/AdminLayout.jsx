import { useState, useEffect } from "react"
import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom"
import { getSession, isAdminUser, isSuperAdmin, signOut, fetchAllEvents } from "../../lib/supabase.js"
import { LangToggle } from "../../lib/i18n.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) สำหรับ bottom bar มือถือ ─────
const BIco = {
  grid:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>),
  users:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  book:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  scan:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>),
  gear:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>),
  clipboard: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/></svg>),
  cap:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  logout:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>),
  calendar:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>),
  chevron: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>),
  shield:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/></svg>),
}

// เมนูใน bottom bar (มือถือ) — เช็คอินตรงกลางเป็นปุ่มเด่น
// เรียง: Dashboard · รายวิชา · เช็คอิน(กลาง) · ผู้สมัคร · ตั้งค่า
const BOTTOM_NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/admin/courses", label: "รายวิชา", icon: "book" },
  { to: "/admin/checkin", label: "เช็คอิน", icon: "scan", center: true },
  { to: "/admin/applicants", label: "ผู้สมัคร", icon: "users" },
  { to: "/admin/settings", label: "ตั้งค่า", icon: "gear" },
]

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/admin/applicants", label: "รายการสมัคร", icon: "users" },
  { to: "/admin/courses", label: "จัดการรายวิชา", icon: "book" },
  { to: "/admin/checkin", label: "จุดสแกน (Check-In)", icon: "scan" },
  { to: "/admin/attendance", label: "สรุปการมาเรียน", icon: "clipboard" },
  { to: "/admin/students", label: "จัดการนักเรียน", icon: "cap" },
  { to: "/admin/settings", label: "ตั้งค่าเว็บ", icon: "gear" },
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const visibleNav = NAV.filter((n) => !n.superOnly || isSuper)
  const current = NAV.find((n) => location.pathname.startsWith(n.to))

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Overlay (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 w-64 h-screen bg-white border-r border-slate-200 flex flex-col transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {/* Header — gradient ส้ม-เหลือง (เข้าชุดกับหน้าอื่น) */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <BIco.cap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-sm bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent tracking-wide">ADMIN PANEL</div>
            <div className="text-[11px] text-slate-400 truncate">{event ? `${event.name} ${event.year}` : "—"}</div>
          </div>
        </div>
        <div className="px-5 pt-4 pb-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">เมนูหลัก</div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = BIco[item.icon]
            return (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? "bg-[#F15A24] text-white shadow-sm shadow-orange-500/20" : "text-slate-600 hover:bg-orange-50"}`}>
                {Icon && <Icon className="w-5 h-5 shrink-0" />}
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <button onClick={handleLogout} className="m-3 shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 transition border-t border-slate-100 pt-3">
          <BIco.logout className="w-5 h-5 shrink-0" /> ออกจากระบบ
        </button>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-2xl text-slate-600 leading-none">☰</button>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-bold text-slate-600"><BIco.shield className="w-4 h-4 text-[#F15A24]" /> Admin</span>
            <span className="text-slate-300">/</span>
            <span className="text-[#F15A24] font-medium">{current?.label || ""}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {events.length > 0 && (
              <div className="relative">
                <select value={event?.id || ""} onChange={(e) => setEvent(events.find((x) => x.id === e.target.value))}
                  className="appearance-none text-xs sm:text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2 outline-none cursor-pointer max-w-[180px] sm:max-w-[220px] truncate hover:bg-slate-100 transition">
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id} className="text-slate-700">
                      {ev.name} {ev.year}{ev.status === "open" ? " 🟢" : ev.status === "closed" ? " 🔒" : " 📝"}
                    </option>
                  ))}
                </select>
                <BIco.calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#F15A24] pointer-events-none" />
                <BIco.chevron className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}
            <LangToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 w-full pb-28 lg:pb-6">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet context={{ session, event, events, setEvent, isSuper, reloadEvents }} />

            {/* Footer — แสดงทุกหน้า admin (ระยะห่างจาก bottom bar คงที่) */}
            <footer className="mt-10 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
              <p>© 2026 College of Arts, Media and Technology (CAMT) | College Administration Portal</p>
              <p className="mt-1">ระบบจัดการการแข่งขันและกิจกรรมโครงการดิจิทัล</p>
            </footer>
          </div>
        </main>
      </div>

      {/* Bottom navigation (มือถือ — แสดงเฉพาะจอเล็ก, ซ่อนบน lg ที่มี sidebar) */}
      <AdminBottomBar />
    </div>
  )
}

// Bottom navigation bar — เมนูหลัก admin (แสดงเฉพาะมือถือ)
function AdminBottomBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-slate-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
      <div className="max-w-4xl mx-auto px-1 flex items-end justify-around h-16">
        {BOTTOM_NAV.map((it) => {
          const Icon = BIco[it.icon]
          const active = path.startsWith(it.to)
          // ปุ่มกลาง (เช็คอิน) — วงกลมส้มนูนขึ้นมา
          if (it.center) {
            return (
              <button key={it.to} onClick={() => navigate(it.to)}
                className="flex flex-col items-center flex-1 -mt-5">
                <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30 border-4 border-white transition active:scale-95 ${active ? "bg-[#d14e1e]" : "bg-[#F15A24]"}`}>
                  <Icon className="w-6 h-6 text-white" />
                </span>
                <span className={`text-[10px] mt-0.5 ${active ? "text-[#F15A24] font-bold" : "text-slate-400 font-medium"}`}>{it.label}</span>
              </button>
            )
          }
          return (
            <button key={it.to} onClick={() => navigate(it.to)}
              className={`flex flex-col items-center gap-0.5 flex-1 pb-1 transition ${active ? "text-[#F15A24]" : "text-slate-400 hover:text-slate-600"}`}>
              <Icon className="w-5 h-5" />
              <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}