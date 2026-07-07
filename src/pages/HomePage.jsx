import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { fetchOpenEvent, fetchCourses, fetchSettings, fetchEventSettings } from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"
import { catColor } from "../lib/categoryColors.js"

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้ารายการสมัครของฉัน ─────
const Ico = {
  search:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  cap:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  users:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  lock:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  clip:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>),
  book:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  arrow:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>),
  list:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>),
  calendar:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>),
  flag:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>),
  clock:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>),
  sparkle: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>),
  gift:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>),
}

export default function HomePage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState("")
  const [siteTitle, setSiteTitle] = useState("")
  const [heroSub, setHeroSub] = useState("")

  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("All")
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const ev = await fetchOpenEvent()
        setEvent(ev)
        const list = await fetchCourses(ev?.id)
        setCourses(list || [])
        // โหลดชื่อเว็บ + ข้อความแจ้งเตือน ตามงานที่เปิด
        if (ev?.id) {
          const es = await fetchEventSettings(ev.id)
          setNotice(es.home_notice || "")
          setSiteTitle(es.site_title || "")
          setHeroSub(es.hero_subtitle || "")
        }
      } catch (e) {
        setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ประเภทคอร์สสำหรับ filter (จาก course_types.label)
  const types = Array.from(new Set(courses.map((c) => c.course_types?.label).filter(Boolean)))

  const filtered = courses.filter((c) => {
    const matchName = c.title?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === "All" || c.course_types?.label === filterType
    return matchName && matchType
  })

  // จัดกลุ่มตามหมวดหมู่ (สำหรับแสดงแบบ section เมื่อดูทุกหมวด)
  const groupedByType = (() => {
    const groups = {}
    filtered.forEach((c) => {
      const label = c.course_types?.label || "อื่นๆ"
      if (!groups[label]) groups[label] = []
      groups[label].push(c)
    })
    return Object.entries(groups).map(([label, items]) => ({ label, items }))
  })()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 h-64 w-full animate-pulse" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-pulse">
                <div className="h-48 bg-slate-200" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                  <div className="h-16 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* ─── Hero Banner ─── */}
      <div className="relative bg-gradient-to-r from-[#F15A24] to-amber-500 text-white overflow-hidden shadow-md">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
        <div className="absolute top-0 right-0 w-full h-[400px] bg-gradient-to-b from-black/10 to-transparent pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center mb-8">
            <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3 tracking-widest uppercase">
              🎓 {t("home.openNow")}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3 tracking-tight">
              {siteTitle || event?.name || "CAMT SUMMER COURSE"}
              {event?.year && <span className="ml-2">{event.year}</span>}
            </h1>
            <p className="text-orange-100 text-base sm:text-lg max-w-xl mx-auto">
              {heroSub || t("home.heroSub")}
            </p>
          </div>

          {/* Search & Filter */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 sm:p-5 border border-white/20 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Ico.search className="w-4 h-4 absolute inset-y-0 left-3.5 my-auto text-slate-400 pointer-events-none" />
                <input type="text" placeholder={t("common.search") + "…"}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-slate-800 text-sm outline-none focus:ring-2 focus:ring-[#F15A24]/40 bg-white placeholder-slate-400"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {types.length > 0 && (
                <select className="px-4 py-2.5 rounded-xl text-slate-800 text-sm outline-none focus:ring-2 focus:ring-[#F15A24]/40 bg-white sm:w-52"
                  value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="All">ทุกหมวดหมู่</option>
                  {types.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              )}
            </div>
          </div>

          <p className="text-center text-white/70 text-sm mt-4">
            {t("home.foundCourses", { n: filtered.length })}
          </p>

          {/* แบนเนอร์แจ้งเตือน (แอดมินแก้ได้จากหน้าตั้งค่าเว็บ) */}
          {notice.trim() && (
            <div className="mt-6 max-w-4xl mx-auto bg-white/15 backdrop-blur-sm border border-white/25 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 flex gap-3 sm:gap-4">
              <span className="text-2xl sm:text-3xl shrink-0 leading-none">📷</span>
              <p className="text-white text-sm sm:text-[15px] leading-relaxed whitespace-pre-line">{notice}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Course Grid ─── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl p-4 mb-6 text-sm">
            {t("home.error")}: {error}
          </div>
        )}
        {!error && filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
              <Ico.search className="w-7 h-7" />
            </div>
            <p className="text-slate-700 text-xl font-semibold">{t("home.noCourses")}</p>
            {(searchTerm || filterType !== "All") && (
              <button onClick={() => { setSearchTerm(""); setFilterType("All") }}
                className="mt-4 px-5 py-2 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#C44215] transition text-sm shadow-md shadow-orange-500/20">
                ล้างตัวกรอง
              </button>
            )}
          </div>
        ) : filterType !== "All" ? (
          // เลือกหมวดเดียว → grid ปกติ
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((course) => (
              <CourseCard key={course.id} course={course} t={t} onDetail={() => setSelected(course)} onRegister={() => navigate(`/register/${course.id}`)} />
            ))}
          </div>
        ) : (
          // แสดงทุกหมวด → แบ่ง section ตามหมวดหมู่ มีขีดสีเทาบางๆ คั่น
          <div className="space-y-10">
            {groupedByType.map(({ label, items }, gi) => (
              <section key={label}>
                {gi > 0 && <div className="border-t border-slate-200 mb-8" />}
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-800">{label}</h2>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((course) => (
                    <CourseCard key={course.id} course={course} t={t} onDetail={() => setSelected(course)} onRegister={() => navigate(`/register/${course.id}`)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selected && <DetailModal course={selected} t={t} onClose={() => setSelected(null)} onRegister={() => { setSelected(null); navigate(`/register/${selected.id}`) }} />}
    </div>
  )
}

function CourseCard({ course, t, onDetail, onRegister }) {
  const type = course.course_types
  const taken = course.seats_taken || 0
  const cap = course.capacity || 0
  const isUnlimited = course.seat_mode === "unlimited"
  const hasSessions = Array.isArray(course.sessions) && course.sessions.length > 0
  const remaining = Math.max(0, cap - taken)
  const pct = cap > 0 ? Math.min((taken / cap) * 100, 100) : 0
  // คอร์สมีรอบ = เต็มเมื่อทุกรอบเต็ม / คอร์สปกติ = เช็ค capacity
  const isFull = hasSessions
    ? course.sessions.every((s) => (s.capacity || 0) > 0 && (s.taken || 0) >= (s.capacity || 0))
    : (!isUnlimited && cap > 0 && remaining <= 0)
  const isClosed = course.is_open === false
  const isExternal = !!(course.external_url && course.external_url.trim())
  const isPaid = (course.price || 0) > 0
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)

  return (
    <div className="relative bg-white rounded-2xl shadow-sm hover:shadow-md hover:border-orange-200 transition-all duration-300 border border-slate-100 flex flex-col overflow-hidden group">
      {/* Image */}
      <div className="h-48 sm:h-52 bg-slate-100 relative cursor-pointer overflow-hidden" onClick={onDetail}>
        {course.image_url ? (
          <img src={course.image_url} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-slate-300 bg-gradient-to-br from-orange-50 to-slate-100">
            <Ico.book className="w-12 h-12" />
          </div>
        )}
        {type?.label && (
          <div className="absolute top-3 left-3 z-20">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md backdrop-blur-sm bg-white/90 ${catColor(type).text}`}>
              {type.label}
            </span>
          </div>
        )}
        {isClosed ? (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <span className="inline-flex items-center gap-1.5 bg-slate-700 text-white text-xs font-bold px-3 py-1 rounded-full"><Ico.lock className="w-3.5 h-3.5" /> ปิดรับสมัคร</span>
          </div>
        ) : isFull && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
            <span className="bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full">{t("home.full")}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-base font-bold text-slate-800 mb-1 cursor-pointer hover:text-[#F15A24] transition-colors line-clamp-2 leading-snug" onClick={onDetail}>
          {course.title}
        </h3>
        {instructors.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            <Ico.cap className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{instructors.join(", ")}</span>
          </div>
        )}
        <p className="text-slate-500 text-xs leading-relaxed mb-3 line-clamp-2 flex-1">
          {course.description || "รายละเอียด"}
        </p>

        {/* Seat progress */}
        <div className="mb-4">
          {Array.isArray(course.sessions) && course.sessions.length > 0 ? (
            /* คอร์สมีรอบ — แสดงปรอทแยกแต่ละรอบ */
            <div className="space-y-2">
              {course.sessions.map((s) => {
                const sTaken = s.taken || 0
                const sCap = s.capacity || 0
                const sPct = sCap > 0 ? Math.min((sTaken / sCap) * 100, 100) : 0
                const sFull = sCap > 0 && sTaken >= sCap
                return (
                  <div key={s.id}>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-slate-500 font-medium truncate">{s.label || "รอบ"}</span>
                      <span className={`font-bold ${sFull ? "text-rose-500" : "text-emerald-600"}`}>
                        {sFull ? "เต็ม" : `${sTaken}/${sCap}`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${sPct >= 100 ? "bg-rose-500" : sPct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${sPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* คอร์สปกติ — ปรอทเดียว */
            <>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-500">{t("home.seats")}</span>
                <span className={`font-bold ${isFull ? "text-rose-500" : "text-emerald-600"}`}>
                  {isFull ? t("home.full") : isUnlimited ? (
                    <span className="inline-flex items-center gap-1">{taken} คน · <span className="text-base leading-none">∞</span></span>
                  ) : `${taken}/${cap}`}
                </span>
              </div>
              {isUnlimited ? (
                /* ไม่จำกัด — แถบค่อยๆ โตตามจำนวนคน (log scale, ไม่มีวันเต็ม) */
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(85, Math.round(Math.log10(taken + 1) * 39))}%` }} />
                </div>
              ) : (
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Price & Buttons */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-500">ค่าลงทะเบียน</span>
            <span className="text-lg font-extrabold text-[#F15A24]">
              {isPaid ? `฿${course.price?.toLocaleString() || "-"}` : t("common.free")}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={onDetail} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#F15A24] border-2 border-[#F15A24] hover:bg-orange-50 transition-all">
              รายละเอียด
            </button>
            {isClosed ? (
              <button disabled className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed">
                ยังไม่เปิดรับสมัคร
              </button>
            ) : isExternal ? (
              <button onClick={onRegister}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-md bg-violet-500 hover:bg-violet-600 shadow-violet-500/20 inline-flex items-center justify-center gap-1.5">
                <Ico.arrow className="w-4 h-4" /> สมัครผ่านลิงก์
              </button>
            ) : (
              <button onClick={onRegister}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-md ${isFull ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" : "bg-[#F15A24] hover:bg-[#C44215] shadow-orange-500/20"}`}>
                {isFull ? (<span className="inline-flex items-center gap-1.5"><Ico.list className="w-4 h-4" /> สมัคร (คิวสำรอง)</span>) : t("home.register")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// แปลงวันที่ ISO → "9 มี.ค. 2569" (พ.ศ.)
function fmtThaiDate(iso) {
  if (!iso) return "-"
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

// วันที่แบบสั้น "27 ก.ค." (สำหรับ timeline)
function fmtShortDate(iso) {
  if (!iso) return "-"
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return `${d.getDate()} ${months[d.getMonth()]}`
}

// Timeline แนวนอน — เรียงตามวันอัตโนมัติ, จุด highlight เด่น (วันงาน)
function CourseTimeline({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  // เรียงตามวันจริง (เก่า→ใหม่)
  const sorted = [...items].filter((it) => it?.date).sort((a, b) => new Date(a.date) - new Date(b.date))
  if (sorted.length === 0) return null

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-orange-100 shadow-sm">
      <h4 className="font-bold text-[#F15A24] text-base mb-5 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
        กำหนดการ
      </h4>

      {/* Timeline zigzag — ข้อความสลับบน/ล่าง, เต็มกรอบ, scroll บนมือถือ */}
      <div className="overflow-x-auto">
        <div className="flex items-stretch min-w-max sm:min-w-0 sm:w-full">
          {sorted.map((it, i) => {
            const hl = !!it.highlight
            const top = i % 2 === 0   // จุดคู่ = ข้อความบน, จุดคี่ = ข้อความล่าง
            const Label = (
              <div className={`flex flex-col ${top ? "justify-end pb-2" : "justify-start pt-2"} items-center text-center`} style={{ minHeight: "48px" }}>
                <div className={`text-xs font-extrabold ${hl ? "text-[#F15A24]" : "text-slate-700"}`}>{fmtShortDate(it.date)}</div>
                <div className={`text-[11px] leading-snug mt-0.5 ${hl ? "text-[#F15A24] font-bold" : "text-slate-500"}`}>{it.label || ""}</div>
              </div>
            )
            return (
              <div key={i} className="flex-1 flex flex-col items-center" style={{ minWidth: "90px" }}>
                {/* ข้อความบน (เฉพาะจุดคู่) */}
                {top ? Label : <div style={{ minHeight: "48px" }} />}

                {/* แถวจุด + เส้น */}
                <div className="relative flex items-center w-full h-6">
                  {/* เส้นซ้าย */}
                  <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : "bg-slate-200"}`} />
                  {/* จุด/ดาว */}
                  {hl ? (
                    <svg className="w-6 h-6 text-[#F15A24] shrink-0 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 18.5 5.8 21.2l1.6-7L2 9.5l7.1-.6z"/></svg>
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-300 ring-4 ring-slate-100 shrink-0" />
                  )}
                  {/* เส้นขวา */}
                  <div className={`h-0.5 flex-1 ${i === sorted.length - 1 ? "opacity-0" : "bg-slate-200"}`} />
                </div>

                {/* ข้อความล่าง (เฉพาะจุดคี่) */}
                {!top ? Label : <div style={{ minHeight: "48px" }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DetailModal({ course, t, onClose, onRegister }) {
  const type = course.course_types
  const isPaid = (course.price || 0) > 0
  const isFull = (course.seat_mode !== "unlimited") && (course.capacity || 0) - (course.seats_taken || 0) <= 0 && (course.capacity || 0) > 0
  const isClosed = course.is_open === false
  const isExternal = !!(course.external_url && course.external_url.trim())
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const images = (course.image_urls && course.image_urls.length ? course.image_urls : (course.image_url ? [course.image_url] : []))
  const [imgIdx, setImgIdx] = useState(0)
  // เลื่อนรูปเองทุก 3.5 วินาที (ถ้ามีหลายรูป)
  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => setImgIdx((i) => (i + 1) % images.length), 3500)
    return () => clearInterval(timer)
  }, [images.length])
  // parse เนื้อหาแบบหัวข้อ (รองรับข้อมูลเก่าที่เป็น text ธรรมดา)
  const sections = (() => {
    if (!course.content) return []
    try {
      const p = JSON.parse(course.content)
      if (Array.isArray(p)) return p.filter((s) => s.heading || s.body)
      return [{ heading: "", body: course.content }]
    } catch { return [{ heading: "", body: course.content }] }
  })()

  const infoCards = [
    { icon: Ico.calendar, label: "วันเริ่ม", value: fmtThaiDate(course.start_date) },
    { icon: Ico.flag, label: "วันสิ้นสุด", value: fmtThaiDate(course.end_date) },
    { icon: Ico.clock, label: "ระยะเวลา", value: course.duration || "-" },
  ]

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full rounded-3xl shadow-2xl sm:max-w-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[92vh]">
        {/* Hero ส้ม */}
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-6 text-white flex justify-between items-start shrink-0">
          <div className="pr-4">
            {type?.label && <p className="text-xs text-orange-100 mb-1 font-bold tracking-widest uppercase">{type.label}</p>}
            <h3 className="font-extrabold text-2xl sm:text-3xl leading-tight mb-3">{course.title}</h3>
            <div className="flex flex-wrap gap-2">
              {course.level && <span className="text-xs font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-full">{course.level}</span>}
              {course.duration && <span className="text-xs font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-full inline-flex items-center gap-1"><Ico.calendar className="w-3 h-3" /> {course.duration}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="text-white/80 hover:text-white text-2xl leading-none transition shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">×</button>
        </div>

        <div className="overflow-y-auto flex-1 bg-slate-50">
          {/* รูปภาพ + carousel */}
          {images.length > 0 ? (
            <div className="relative h-56 sm:h-72 bg-slate-200">
              <img src={images[imgIdx]} className="w-full h-full object-cover" alt={course.title} />
              {images.length > 1 && (
                <>
                  <button onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition">‹</button>
                  <button onClick={() => setImgIdx((imgIdx + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition">›</button>
                  <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                    {images.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`h-2 rounded-full transition-all ${i === imgIdx ? "w-5 bg-white" : "w-2 bg-white/50"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ไม่มีรูป → placeholder ลายจางเข้าธีม */
            <div className="relative h-40 sm:h-48 bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center border-b border-orange-100">
              <div className="text-orange-200"><Ico.cap className="w-16 h-16" /></div>
            </div>
          )}

          <div className="p-5 space-y-4">
            {/* ค่าลงทะเบียน — เด่น อยู่บนสุด */}
            <div className="flex items-center justify-center">
              {isPaid ? (
                <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-2xl border border-emerald-100 shadow-sm">
                  <span className="text-slate-400 text-xs font-medium">ค่าลงทะเบียน</span>
                  <span className="text-2xl font-extrabold text-emerald-600">{course.price?.toLocaleString() || "-"}</span>
                  <span className="text-sm text-emerald-600 font-bold">บาท</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-2xl border border-emerald-100 shadow-sm">
                  <Ico.gift className="w-5 h-5" />
                  <span className="text-base font-extrabold">ไม่มีค่าลงทะเบียน (ฟรี)</span>
                </div>
              )}
            </div>

            {/* 3 การ์ดข้อมูล — เด่นด้วยพื้นสี */}
            <div className="grid grid-cols-3 gap-2.5">
              {infoCards.map((c, i) => (
                <div key={i} className="bg-gradient-to-br from-orange-50 to-amber-50/60 rounded-2xl border border-orange-100 p-3.5 text-center">
                  <div className="w-9 h-9 mx-auto mb-2 rounded-xl bg-white text-[#F15A24] flex items-center justify-center shadow-sm">
                    <c.icon className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">{c.label}</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5 leading-tight">{c.value}</div>
                </div>
              ))}
            </div>

            {/* ผู้สอน */}
            {instructors.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-3 flex items-center gap-2"><Ico.cap className="w-5 h-5" /> ผู้สอน</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {instructors.map((inst, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <div className="bg-white p-2 rounded-full shadow-sm border border-orange-100 shrink-0 text-[#F15A24]"><Ico.cap className="w-4 h-4" /></div>
                      <span className="text-slate-800 font-medium text-sm">{inst}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* รอบ (session) — แสดงถ้าคอร์สมีรอบ */}
            {Array.isArray(course.sessions) && course.sessions.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-3 flex items-center gap-2">
                  <Ico.clock className="w-4 h-4" /> รอบที่เปิดรับ
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {course.sessions.map((s) => {
                    const taken = s.taken || 0
                    const cap = s.capacity || 0
                    const left = Math.max(0, cap - taken)
                    const full = left <= 0
                    return (
                      <div key={s.id} className={`p-3 rounded-xl border ${full ? "border-slate-100 bg-slate-50" : "border-orange-100 bg-orange-50/40"}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`font-bold text-sm ${full ? "text-slate-400" : "text-slate-800"}`}>{s.label || "รอบ"}</span>
                          {full && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">เต็ม</span>}
                        </div>
                        {s.time && <div className="text-xs text-slate-500 mb-1">🕐 {s.time}</div>}
                        <div className={`text-xs font-medium ${full ? "text-rose-500" : "text-emerald-600"}`}>
                          {full ? "เต็มแล้ว" : `เหลือ ${left}/${cap} ที่`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* กำหนดการ (timeline) — แสดงก่อนคำอธิบาย */}
            <CourseTimeline items={course.timeline} />

            {/* รูปรายละเอียด — แสดงตามขนาดจริง (ไม่ crop) ไม่มีหัวข้อ (อยู่หมวดเดียวกับกำหนดการ) */}
            {Array.isArray(course.detail_images) && course.detail_images.length > 0 && (
              <div className="space-y-3">
                {course.detail_images.map((src, i) => (
                  <img key={i} src={src} alt={`${course.title} ${i + 1}`}
                    className="w-full h-auto rounded-2xl border border-slate-100 shadow-sm" />
                ))}
              </div>
            )}

            {/* รายละเอียด */}
            {course.description && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                  รายละเอียด
                </h4>
                <p className="text-slate-700 text-sm leading-7 whitespace-pre-line">{course.description}</p>
              </div>
            )}

            {/* เนื้อหาแบบหัวข้อ */}
            {sections.length > 0 && (
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    {sec.heading && <h4 className="font-bold text-slate-800 text-sm mb-1.5 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F15A24]" />{sec.heading}</h4>}
                    {sec.body && <p className="text-slate-600 text-sm leading-7 whitespace-pre-line">{sec.body}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* ไฟล์แนบ PDF — ให้ผู้สมัครดาวน์โหลด */}
            {Array.isArray(course.attachments) && course.attachments.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                  ไฟล์แนบ
                </h4>
                <div className="space-y-2">
                  {course.attachments.map((att, i) => (
                    <a key={i} href={att.url} download target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-[#F15A24] hover:bg-orange-50/40 transition group">
                      <span className="w-9 h-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                      </span>
                      <span className="text-sm font-medium text-slate-700 truncate flex-1 group-hover:text-[#F15A24]">{att.name}</span>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-[#F15A24] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ปุ่ม */}
        <div className="p-4 border-t border-slate-100 bg-white flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 sm:flex-none sm:px-8 py-3 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition text-sm">ปิด</button>
          {isClosed ? (
            <button disabled className="flex-1 py-3 rounded-xl font-semibold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed text-sm flex items-center justify-center gap-2">
              <Ico.lock className="w-4 h-4" /> ยังไม่เปิดรับสมัคร
            </button>
          ) : isExternal ? (
            <button onClick={onRegister}
              className="flex-1 py-3 rounded-xl font-semibold text-white transition shadow-md text-sm flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-600 shadow-violet-500/20">
              <Ico.arrow className="w-4 h-4" /> สมัครผ่านลิงก์
            </button>
          ) : (
            <button onClick={onRegister} disabled={isFull}
              className={`flex-1 py-3 rounded-xl font-semibold text-white transition shadow-md text-sm flex items-center justify-center gap-2 ${isFull ? "bg-slate-400 cursor-not-allowed" : "bg-[#F15A24] hover:bg-[#C44215] shadow-orange-500/20"}`}>
              {isFull ? "ที่นั่งเต็ม" : (<>{t("home.register")} <Ico.arrow className="w-4 h-4" /></>)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}