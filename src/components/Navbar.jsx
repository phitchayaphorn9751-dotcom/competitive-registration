import { useState, useEffect, useRef } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { supabase, getSession, signOut, isProfileComplete, fetchSettings } from "../lib/supabase.js"
import { LangToggle } from "../lib/i18n.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) สำหรับ bottom bar ─────
const Ico = {
  grid:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>),
  ticket:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>),
  user:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>),
}

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [profileDone, setProfileDone] = useState(false)
  const [settings, setSettings] = useState({})
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef(null)

  // โหลด session + ฟังการเปลี่ยนสถานะ login/logout
  useEffect(() => {
    let active = true
    async function refresh() {
      const s = await getSession()
      if (!active) return
      setUser(s?.user || null)
      setProfileDone(s ? await isProfileComplete() : false)
    }
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh())
    return () => { active = false; sub?.subscription?.unsubscribe?.() }
  }, [])

  // โหลดข้อมูลติดต่อจาก site_settings (มี fallback)
  useEffect(() => { fetchSettings().then(setSettings).catch(() => {}) }, [])

  // ปิดเมนูเมื่อเปลี่ยนหน้า
  useEffect(() => { setIsOpen(false) }, [location.pathname])

  // เงาเมื่อ scroll
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  // ปิดเมื่อคลิกข้างนอก
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen])

  async function handleLogout() {
    try { await signOut(); navigate("/login") } catch (e) { console.error(e) }
  }

  const lineId = settings.line_id || "@camtcmu"
  const phone = settings.phone || "063-525-0248"
  const siteTitle = settings.site_title || "CAMT SUMMER COURSE"
  const lineUrl = `https://line.me/ti/p/~${lineId}`
  const telHref = `tel:${phone.replace(/[^0-9+]/g, "")}`

  // ตั้งชื่อแท็บเบราว์เซอร์ตามชื่องานที่เปิด
  useEffect(() => {
    if (settings.site_title) document.title = settings.site_title
  }, [settings.site_title])

  return (
    <>
    <nav ref={menuRef} className={`sticky top-0 z-50 bg-gradient-to-r from-[#f15a24] to-amber-500 text-white transition-shadow duration-200 ${scrolled ? "shadow-lg" : "shadow-sm"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
          <img src="/camt_logo.png" alt="CAMT" className="h-9 w-9 rounded-md object-contain bg-white/10"
            onError={(e) => { e.currentTarget.style.display = "none" }} />
          <div className="leading-tight">
            <p className="text-[11px] font-light text-orange-100 tracking-wide hidden sm:block">College of Arts, Media and Technology</p>
            <p className="text-sm font-bold tracking-wider">{siteTitle}</p>
          </div>
        </Link>

        {/* Desktop centre: contact pill */}
        <div className="hidden items-center gap-4 rounded-full border border-white/25 bg-white/15 px-5 py-1.5 backdrop-blur-sm lg:flex">
          <a href={lineUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-opacity hover:opacity-85">
            <span className="text-base">💬</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-light text-orange-100">ติดต่อ Line</span>
              <span className="text-xs font-bold text-yellow-200">{lineId}</span>
            </div>
          </a>
          <div className="h-6 w-px bg-white/25" />
          <a href={telHref} className="flex items-center gap-2 transition-opacity hover:opacity-85">
            <span className="text-base">📞</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-light text-orange-100">โทรศัพท์</span>
              <span className="text-xs font-bold text-white">{phone}</span>
            </div>
          </a>
        </div>

        {/* Desktop right: nav links */}
        <div className="hidden items-center gap-1 md:flex">
          <NavItem to="/">Home</NavItem>
          {!user ? (
            <>
              <LangToggle />
              <Link to="/login" className="ml-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#f15a24] shadow transition hover:bg-orange-50 active:scale-95">เข้าสู่ระบบ</Link>
            </>
          ) : (
            <>
              {profileDone && (
                <>
                  <NavItem to="/my-registration">การสมัครของฉัน</NavItem>
                  <NavItem to="/profile">โปรไฟล์</NavItem>
                </>
              )}
              <LangToggle />
              <button onClick={handleLogout} className="ml-2 rounded-lg bg-[#d14e4e] px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-[#b02a2a] active:scale-95">ออกจากระบบ</button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button aria-label="เมนู" onClick={() => setIsOpen(!isOpen)} className="rounded-lg p-2 transition hover:bg-white/20 active:scale-95 md:hidden">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      <div className={`overflow-hidden border-t border-white/20 bg-[#d95218] transition-all duration-300 ease-in-out md:hidden ${isOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-4 py-4 space-y-4">
          {/* Contact card */}
          <div className="rounded-xl border border-yellow-400/40 bg-white/10 p-3">
            <p className="mb-2.5 text-center text-[11px] font-semibold text-yellow-300">📣 ติดต่อสอบถามผ่านช่องทางนี้</p>
            <div className="flex gap-2">
              <a href={lineUrl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#06c755] py-2 text-sm font-bold text-white shadow transition hover:bg-[#05b64d] active:scale-95">💬 Line</a>
              <a href={telHref} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-bold text-[#f15a24] shadow transition hover:bg-orange-50 active:scale-95">📞 โทรหาเรา</a>
            </div>
          </div>
          {/* Nav links */}
          <div className="space-y-1">
            <MobileItem to="/" icon="🏠" label="Home" />
            {!user ? (
              <Link to="/login" className="block rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-[#f15a24] shadow transition hover:bg-orange-50 active:scale-95">เข้าสู่ระบบ</Link>
            ) : (
              <>
                {profileDone && (
                  <>
                    <MobileItem to="/my-registration" icon="📄" label="การสมัครของฉัน" />
                    <MobileItem to="/profile" icon="👤" label="โปรไฟล์" />
                  </>
                )}
                <div className="pt-1 border-t border-white/25">
                  <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold text-red-200 transition hover:bg-white/15 hover:text-white active:scale-95">
                    <span>🚪</span> ออกจากระบบ
                  </button>
                </div>
              </>
            )}
            <div className="pt-2 flex justify-center"><LangToggle /></div>
          </div>
        </div>
      </div>
    </nav>

    {/* ───── Bottom navigation bar (มือถือ ทุกหน้า เมื่อ login แล้ว) ───── */}
    {user && <BottomBar navigate={navigate} profileDone={profileDone} />}
    </>
  )
}

// Bottom navigation — ตรงกับเมนู header: Home / การสมัครของฉัน / โปรไฟล์ (แสดงเฉพาะมือถือ)
function BottomBar({ navigate, profileDone }) {
  const location = useLocation()
  const path = location.pathname
  const items = [
    { icon: "grid",   label: "Home",            to: "/" },
    ...(profileDone ? [
      { icon: "ticket", label: "การสมัครของฉัน", to: "/my-registration" },
      { icon: "user",   label: "โปรไฟล์",        to: "/profile" },
    ] : []),
  ]
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-md border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
      <div className="max-w-4xl mx-auto px-2 flex items-center justify-around h-16">
        {items.map((it) => {
          const Icon = Ico[it.icon]
          const active = path === it.to
          return (
            <button key={it.label} onClick={() => navigate(it.to)}
              className={`flex flex-col items-center gap-0.5 flex-1 transition ${active ? "text-[#F15A24]" : "text-gray-400 hover:text-gray-600"}`}>
              <Icon className="w-5 h-5" />
              <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function NavItem({ to, children }) {
  const location = useLocation()
  const isActive = location.pathname === to
  return (
    <Link to={to} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/20 text-white" : "text-orange-100 hover:bg-white/15 hover:text-white"}`}>{children}</Link>
  )
}

function MobileItem({ to, icon, label }) {
  const location = useLocation()
  const isActive = location.pathname === to
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${isActive ? "bg-white/20 text-white" : "text-orange-100 hover:bg-white/15 hover:text-white"}`}>
      <span className="text-base">{icon}</span>{label}
    </Link>
  )
}