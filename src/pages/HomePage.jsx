import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { fetchOpenEvent, fetchCourses, fetchSettings, fetchEventSettings } from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"

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
      <div className="min-h-screen bg-gray-50 pb-10">
        <div className="bg-gradient-to-br from-[#F15A24] to-[#e04010] h-64 w-full animate-pulse" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="h-16 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* ─── Hero Banner ─── */}
      <div className="relative bg-gradient-to-br from-[#F15A24] to-[#cc4618] text-white overflow-hidden shadow-inner">
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
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">🔍</span>
                <input type="text" placeholder={t("common.search") + "…"}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-gray-800 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white placeholder-gray-400"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {types.length > 0 && (
                <select className="px-4 py-2.5 rounded-xl text-gray-800 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white sm:w-52"
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
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 mb-6 text-sm">
            {t("home.error")}: {error}
          </div>
        )}
        {!error && filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-500 text-xl font-semibold">{t("home.noCourses")}</p>
            {(searchTerm || filterType !== "All") && (
              <button onClick={() => { setSearchTerm(""); setFilterType("All") }}
                className="mt-4 px-5 py-2 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#C44215] transition text-sm">
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
                {gi > 0 && <div className="border-t border-gray-200 mb-8" />}
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-800">{label}</h2>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
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
  const remaining = Math.max(0, cap - taken)
  const pct = cap > 0 ? Math.min((taken / cap) * 100, 100) : 0
  const isFull = remaining <= 0
  const isClosed = course.is_open === false
  const isPaid = (course.price || 0) > 0
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)

  return (
    <div className="relative bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col overflow-hidden group">
      {/* Image */}
      <div className="h-48 sm:h-52 bg-gray-100 relative cursor-pointer overflow-hidden" onClick={onDetail}>
        {course.image_url ? (
          <img src={course.image_url} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300 bg-gradient-to-br from-orange-50 to-gray-100">
            <span className="text-5xl">📚</span>
          </div>
        )}
        {type?.label && (
          <div className="absolute top-3 left-3 z-20">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-sm bg-white/90 text-orange-700 border-orange-200">
              {type.label}
            </span>
          </div>
        )}
        {isClosed ? (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <span className="bg-gray-700 text-white text-xs font-bold px-3 py-1 rounded-full">🔒 ปิดรับสมัคร</span>
          </div>
        ) : isFull && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
            <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">{t("home.full")}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-base font-bold text-gray-800 mb-1 cursor-pointer hover:text-[#F15A24] transition-colors line-clamp-2 leading-snug" onClick={onDetail}>
          {course.title}
        </h3>
        {instructors.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <span>👨‍🏫</span><span className="truncate">{instructors.join(", ")}</span>
          </div>
        )}
        <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2 flex-1">
          {course.description || "รายละเอียดวิชา…"}
        </p>

        {/* Seat progress */}
        <div className="mb-4">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-gray-500">{t("home.seats")}</span>
            <span className={`font-bold ${isFull ? "text-red-500" : "text-green-600"}`}>
              {isFull ? t("home.full") : t("home.seatsLeft", { r: remaining, c: cap })}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-orange-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Price & Buttons */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-gray-500">ค่าลงทะเบียน</span>
            <span className="text-lg font-extrabold text-[#F15A24]">
              {isPaid ? `฿${course.price?.toLocaleString() || "-"}` : t("common.free")}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={onDetail} className={`py-2.5 rounded-xl text-sm font-bold text-[#F15A24] border-2 border-[#F15A24] hover:bg-orange-50 transition-all ${isClosed ? "flex-1" : "flex-1"}`}>
              รายละเอียด
            </button>
            {isClosed ? (
              <button disabled className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed">
                ปิดรับสมัคร
              </button>
            ) : (
              <button onClick={onRegister} disabled={isFull}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-md ${isFull ? "bg-gray-400 cursor-not-allowed" : "bg-[#F15A24] hover:bg-[#C44215]"}`}>
                {isFull ? "Waitlist" : t("home.register")}
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

function DetailModal({ course, t, onClose, onRegister }) {
  const type = course.course_types
  const isPaid = (course.price || 0) > 0
  const isFull = (course.seat_mode !== "unlimited") && (course.capacity || 0) - (course.seats_taken || 0) <= 0 && (course.capacity || 0) > 0
  const isClosed = course.is_open === false
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
    { icon: "📅", label: "วันเริ่ม", value: fmtThaiDate(course.start_date) },
    { icon: "🏁", label: "วันสิ้นสุด", value: fmtThaiDate(course.end_date) },
    { icon: "⏱️", label: "ระยะเวลา", value: course.duration || "-" },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full rounded-3xl shadow-2xl sm:max-w-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[92vh]">
        {/* Hero ส้ม */}
        <div className="bg-gradient-to-br from-[#F15A24] to-[#d04810] p-6 text-white flex justify-between items-start shrink-0">
          <div className="pr-4">
            {type?.label && <p className="text-xs text-orange-200 mb-1 font-bold tracking-widest uppercase">{type.label}</p>}
            <h3 className="font-extrabold text-2xl sm:text-3xl leading-tight mb-3">{course.title}</h3>
            <div className="flex flex-wrap gap-2">
              {course.level && <span className="text-xs font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-full">{course.level}</span>}
              {course.duration && <span className="text-xs font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-full">📅 {course.duration}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none transition shrink-0 w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="overflow-y-auto flex-1 bg-[#fffbf8]">
          {/* รูปภาพ + carousel */}
          {images.length > 0 && (
            <div className="relative h-56 sm:h-72 bg-gray-200">
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
          )}

          <div className="p-5 space-y-4">
            {/* 4 การ์ดข้อมูล */}
            <div className="grid grid-cols-3 gap-3">
              {infoCards.map((c, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-[11px] text-gray-400">{c.label}</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">{c.value}</div>
                </div>
              ))}
            </div>

            {/* ผู้สอน */}
            {instructors.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-3 flex items-center gap-2">👨‍🏫 ผู้สอน</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {instructors.map((inst, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <div className="bg-white p-1.5 rounded-full text-xl shadow-sm border border-orange-100 shrink-0">🎓</div>
                      <span className="text-gray-800 font-medium text-sm">{inst}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* คำอธิบาย */}
            {course.description && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-base mb-2 flex items-center gap-2">📝 คำอธิบายรายวิชา</h4>
                <p className="text-gray-700 text-sm leading-7 whitespace-pre-line">{course.description}</p>
              </div>
            )}

            {/* เนื้อหาแบบหัวข้อ */}
            {sections.length > 0 && (
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    {sec.heading && <h4 className="font-bold text-gray-800 text-sm mb-1.5 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F15A24]" />{sec.heading}</h4>}
                    {sec.body && <p className="text-gray-600 text-sm leading-7 whitespace-pre-line">{sec.body}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* ค่าเรียน เด่น */}
            <div className="flex flex-col items-center py-4 border-t border-dashed border-orange-200">
              {isPaid ? (
                <>
                  <p className="text-gray-400 text-xs mb-1">ค่าลงทะเบียน</p>
                  <p className="text-4xl font-extrabold text-green-600">{course.price?.toLocaleString() || "-"} บาท</p>
                </>
              ) : (
                <p className="text-2xl font-extrabold text-green-600">✨ ไม่มีค่าลงทะเบียน</p>
              )}
            </div>
          </div>
        </div>

        {/* ปุ่ม */}
        <div className="p-4 border-t border-gray-200 bg-white flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 sm:flex-none sm:px-8 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-sm">ปิด</button>
          {isClosed ? (
            <button disabled className="flex-1 py-3 rounded-xl font-bold text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed text-sm">
              🔒 ปิดรับสมัครแล้ว
            </button>
          ) : (
            <button onClick={onRegister} disabled={isFull}
              className={`flex-1 py-3 rounded-xl font-bold text-white transition shadow-md text-sm ${isFull ? "bg-gray-400 cursor-not-allowed" : "bg-[#F15A24] hover:bg-[#C44215]"}`}>
              {isFull ? "ที่นั่งเต็ม" : t("home.register") + " →"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}