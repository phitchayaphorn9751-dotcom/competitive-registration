import { useEffect, useState, useMemo } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { fetchRegistrations, subscribeRegistrations } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) — ชุดเดียวกับหน้ารายการสมัครของฉัน ─────
const Ico = {
  users:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  download: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>),
  search:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  book:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  phone:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>),
  school:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17M6 5v17M12 7v5"/><path d="M12 2 2 7l10 5 10-5-10-5Z"/></svg>),
  mail:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  arrowRight:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>),
  arrowLeft:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
  folder:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 11v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2Z"/></svg>),
  qr:       (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/></svg>),
}

// สีหมวดหมู่ — กระจายสีตามชื่อหมวด (หมวดเดียวกันได้สีเดิมเสมอ) สไตล์เดียวกับหน้ารายการสมัคร
const CATEGORY_PALETTE = [
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-blue-100",   text: "text-blue-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-purple-100", text: "text-purple-700" },
  { bg: "bg-pink-100",   text: "text-pink-700" },
  { bg: "bg-cyan-100",   text: "text-cyan-700" },
  { bg: "bg-amber-100",  text: "text-amber-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-teal-100",   text: "text-teal-700" },
  { bg: "bg-rose-100",   text: "text-rose-700" },
]
function categoryCfg(name) {
  if (!name) return CATEGORY_PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]
}

// สถานะ (ตรงกับระบบเรา) — dot + pill โทนเดียวกับหน้ารายการสมัครของฉัน
const STATUS = {
  pending_payment: { label: "รอชำระเงิน", cls: "bg-amber-50 text-amber-600", dot: "bg-amber-500", pulse: true, color: "amber" },
  pending_review:  { label: "รอพิจารณา", cls: "bg-sky-50 text-sky-600", dot: "bg-sky-500", pulse: true, color: "sky" },
  slip_uploaded:   { label: "รอพิจารณา", cls: "bg-sky-50 text-sky-600", dot: "bg-sky-500", pulse: true, color: "sky" },
  submitted:       { label: "รอพิจารณา", cls: "bg-sky-50 text-sky-600", dot: "bg-sky-500", pulse: true, color: "sky" },
  confirmed:       { label: "ยืนยันแล้ว", cls: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500", color: "emerald" },
  approved:        { label: "ยืนยันแล้ว", cls: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500", color: "emerald" },
  waitlist:        { label: "คิวสำรอง", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400", color: "slate" },
  expired:         { label: "หมดเวลา", cls: "bg-slate-50 text-slate-400", dot: "bg-slate-300", color: "slate" },
  rejected:        { label: "ไม่ผ่าน", cls: "bg-rose-50 text-rose-600", dot: "bg-rose-500", color: "rose" },
  cancelled:       { label: "ยกเลิกแล้ว", cls: "bg-slate-100 text-slate-400", dot: "bg-slate-300", color: "slate" },
  held:            { label: "กันที่นั่ง", cls: "bg-orange-50 text-orange-600", dot: "bg-orange-400", color: "orange" },
}
function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400" }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border-0 whitespace-nowrap ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot} ${s.pulse ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  )
}

// pills: key + label + สี
// สถานะรวม 4 แบบ (ไม่แยกมีค่าใช้จ่าย/ไม่มี)
const FILTERS = [
  { key: "all", label: "ทั้งหมด", color: "slate" },
  { key: "pending_payment", label: "รอชำระเงิน", color: "amber" },
  { key: "pending_review", label: "รอพิจารณา", color: "sky" },
  { key: "confirmed", label: "ยืนยันแล้ว", color: "emerald" },
  { key: "waitlist", label: "คิวสำรอง", color: "slate" },
  { key: "rejected", label: "ไม่ผ่าน", color: "rose" },
  { key: "cancelled", label: "ยกเลิก", color: "slate" },
]

// แปลง DB status → หมวดรวม 4 แบบ
function unifyStatus(r) {
  const s = r.status
  const paid = (r.courses?.price || 0) > 0
  if (s === "waitlist") return "waitlist"
  if (s === "cancelled") return "cancelled"
  if (s === "expired") return "expired"
  if (s === "confirmed" || s === "approved") return "confirmed"
  if (s === "rejected" || s === "slip_rejected") return "rejected"
  // รอพิจารณา = แนบสลิปแล้ว (slip_uploaded) หรือ แนบลิงก์ผลงานแล้ว (submitted)
  if (s === "slip_uploaded" || s === "submitted") return "pending_review"
  // held/pending_payment: เสียเงิน = รอชำระ / ฟรี = ยืนยันแล้ว (กันที่นั่งเลย ตรงกับฝั่ง user)
  if (s === "pending_payment" || s === "held") {
    if (!paid) return "confirmed"
    // เสียเงิน + เลย deadline → หมดเวลา
    if (r.payment_deadline && new Date(r.payment_deadline).getTime() < Date.now()) return "expired"
    return "pending_payment"
  }
  return s
}

export default function AdminApplicants() {
  const navigate = useNavigate()
  const { toast } = useDialog()
  const { event } = useOutletContext()
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [courseFilter, setCourseFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => { load() }, [event?.id])
  // เรียลไทม์ — มีผู้สมัครใหม่/อัปเดต/ลบ ข้อมูลขึ้นทันทีไม่ต้องรีเฟรช
  useEffect(() => {
    if (!event?.id) return
    const ch = subscribeRegistrations(() => loadSilent())
    // fallback: โหลดใหม่เมื่อกลับมาที่แท็บ/หน้านี้ (กันกรณี realtime UPDATE ไม่ส่ง)
    const onVisible = () => { if (document.visibilityState === "visible") loadSilent() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", loadSilent)
    return () => {
      ch.unsubscribe()
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", loadSilent)
    }
  }, [event?.id])

  async function load() {
    setLoading(true)
    try { setRegs(await fetchRegistrations(event?.id) || []) }
    catch (e) { toast("โหลดข้อมูลไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }
  async function loadSilent() {
    try { setRegs(await fetchRegistrations(event?.id) || []) } catch (_) {}
  }

  // นับสถานะ (รวมทุกใบ ใช้สถานะรวม)
  const counts = useMemo(() => {
    const c = {}; regs.forEach((r) => { const u = unifyStatus(r); c[u] = (c[u] || 0) + 1 }); return c
  }, [regs])

  // รายการวิชา (สำหรับ filter)
  const courseOptions = useMemo(() => {
    const m = {}
    regs.forEach((r) => { if (r.course_id) m[r.course_id] = r.courses?.title || "ไม่ทราบวิชา" })
    return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]))
  }, [regs])

  const filtered = useMemo(() => {
    return regs.filter((r) => {
      if (filter !== "all" && unifyStatus(r) !== filter) return false
      if (courseFilter !== "all" && r.course_id !== courseFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const names = (r.participants || []).map((p) => (p.full_name || "").toLowerCase()).join(" ")
        const schools = (r.participants || []).map((p) => (p.school || "").toLowerCase()).join(" ")
        const phones = (r.participants || []).map((p) => p.phone || "").join(" ") + " " + (r.submitter_phone || "")
        return names.includes(q) || schools.includes(q)
          || (r.submitter_email || "").toLowerCase().includes(q)
          || (r.courses?.title || "").toLowerCase().includes(q)
          || phones.includes(q)
      }
      return true
    })
  }, [regs, filter, courseFilter, search])

  const totalPages = Math.ceil(filtered.length / perPage)
  const firstIdx = (page - 1) * perPage
  const pageItems = filtered.slice(firstIdx, firstIdx + perPage)

  function fmtDate(iso) {
    if (!iso) return "-"
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
  }
  function mainName(r) {
    const p = (r.participants || [])[0]
    return p?.full_name || r.submitter_email || "-"
  }
  // หมวดหมู่วิชา (รองรับหลายรูปแบบ schema)
  function courseCategory(r) {
    return r.courses?.course_types?.label || r.courses?.course_category || r.courses?.category || r.course_category || ""
  }
  function mainSchool(r) {
    const p = (r.participants || [])[0]
    return p?.school || ""
  }
  function mainPhone(r) {
    const p = (r.participants || [])[0]
    return p?.phone || r.submitter_phone || "-"
  }

  function exportCsv() {
    const headers = ["วิชา", "ชื่อ-สกุล", "โรงเรียน", "เบอร์โทร", "อีเมลผู้สมัคร", "สถานะ", "วันที่สมัคร"]
    const lines = [headers.join(",")]
    filtered.forEach((r) => {
      ;(r.participants || [{}]).forEach((p) => {
        const vals = [r.courses?.title || "", p.full_name || "", p.school || "", p.phone || r.submitter_phone || "", r.submitter_email || "", r.status, fmtDate(r.created_at)]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        lines.push(vals.join(","))
      })
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "รายการสมัคร.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  function goVerify(id) { navigate(`/admin/verify/${id}`) }

  return (
    <div className="pb-24 lg:pb-6">
      {/* Header — gradient + ไอคอนวงกลม (โทนเดียวกับหน้ารายการสมัครของฉัน) */}
      <div className="flex flex-row justify-between items-center gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <Ico.users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">รายการสมัคร</h1>
            <p className="text-slate-400 text-xs mt-0.5">{filtered.length} รายการ · Applicants</p>
          </div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl font-bold hover:bg-slate-200 shadow-sm transition active:scale-95 text-xs shrink-0">
          <Ico.download className="w-3.5 h-3.5 text-[#F15A24]" /> <span className="hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Quick filter pills (สถานะรวม) — สไตล์เดียวกับหน้ารายการสมัครของฉัน */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: "none" }}>
        {FILTERS.map(({ key, label }) => {
          const count = key === "all" ? regs.length : counts[key] || 0
          const active = filter === key
          return (
            <button key={key} onClick={() => { setFilter(key); setPage(1) }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium whitespace-nowrap transition-all ${active ? "bg-[#F15A24] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 active:scale-95"}`}>
              {label}
              {count > 0 && <span className={`min-w-[18px] text-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>}
            </button>
          )
        })}
        </div>
      </div>

      {/* Search + course filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Ico.search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="ค้นหาชื่อ, โรงเรียน, เบอร์, อีเมล, วิชา…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F15A24]/40 focus:border-[#F15A24] focus:bg-white transition" />
          </div>
          <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24]/40 focus:border-[#F15A24] text-sm text-slate-700 bg-slate-50 focus:bg-white transition">
            <option value="all">ทุกวิชา</option>
            {courseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </div>
      </div>

      {/* Table controls */}
      {!loading && filtered.length > 0 && (
        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-xs text-slate-400">
            หน้า <span className="font-bold text-slate-600">{page}</span> / {totalPages || 1} · แสดง {firstIdx + 1}–{Math.min(firstIdx + perPage, filtered.length)} จาก {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">แสดงทีละ</span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="border border-slate-200 px-2 py-1 rounded-lg text-xs outline-none bg-white">
              {[10, 20, 50, 100, 9999].map((n) => <option key={n} value={n}>{n === 9999 ? "ทั้งหมด" : n}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* รายการ — การ์ดแบบหน้ารายการสมัครของฉัน (เหมือนกันทั้ง desktop & mobile) */}
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">กำลังโหลด…</span>
        </div>
      ) : pageItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {pageItems.map((r) => {
            const cat = courseCategory(r)
            const cc = categoryCfg(cat)
            const teamCount = r.participants?.length || 0
            return (
              <div key={r.id} onClick={() => goVerify(r.id)}
                className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-orange-200 transition-all duration-300 cursor-pointer">
                <div className="p-4 sm:p-5">
                  {/* แถวบน: ซ้าย=วันที่+ชื่อวิชา / ขวา=สถานะ */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-[10px] text-slate-400 font-medium block">สมัครเมื่อ {fmtDate(r.created_at)}</span>
                      <h3 className="font-bold text-[#F15A24] text-sm sm:text-[15px] leading-snug line-clamp-2">{r.courses?.title || "-"}</h3>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={unifyStatus(r)} />
                    </div>
                  </div>

                  {/* แถวกลาง: หมวด + ชื่อผู้สมัคร + ทีม */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-50">
                    {cat && <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${cc.bg} ${cc.text}`}>{cat}</span>}
                    <span className="text-sm font-medium text-slate-700">{mainName(r)}</span>
                    {teamCount > 1 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F15A24] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full"><Ico.users className="w-3 h-3" /> ทีม {teamCount} คน</span>}
                  </div>

                  {/* รายละเอียดรอง: เบอร์ · โรงเรียน · อีเมล */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-2">
                    <span className="inline-flex items-center gap-1"><Ico.phone className="w-3 h-3" /> {mainPhone(r)}</span>
                    {mainSchool(r) && <span className="inline-flex items-center gap-1 truncate max-w-[180px]"><Ico.school className="w-3 h-3 shrink-0" /> {mainSchool(r)}</span>}
                    {r.submitter_email && <span className="inline-flex items-center gap-1 truncate max-w-[200px]"><Ico.mail className="w-3 h-3 shrink-0" /> {r.submitter_email}</span>}
                  </div>

                  {/* ปุ่ม action — ตรวจสอบ */}
                  <div className="flex justify-end mt-3">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#F15A24] opacity-60 group-hover:opacity-100 transition">ตรวจสอบ <Ico.arrowRight className="w-3.5 h-3.5" /></span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Ico.folder className="w-6 h-6" />
          </div>
          <p className="font-semibold text-slate-700">ไม่พบข้อมูลที่ค้นหา</p>
          <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนตัวกรองหรือคำค้นหา</p>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 px-4 py-3 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center gap-1.5 flex-wrap">
          <button onClick={() => setPage(page - 1)} disabled={page === 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><Ico.arrowLeft className="w-3.5 h-3.5" /> ก่อนหน้า</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const near = Math.abs(p - page) <= 2 || p === 1 || p === totalPages
            if (!near) {
              if (p === page - 3 || p === page + 3) return <span key={p} className="text-slate-300 text-xs px-1">…</span>
              return null
            }
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg border text-xs font-bold transition ${page === p ? "bg-[#F15A24] text-white border-[#F15A24] shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{p}</button>
            )
          })}
          <button onClick={() => setPage(page + 1)} disabled={page === totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition">ถัดไป <Ico.arrowRight className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-10 pt-6 pb-24 lg:pb-6 border-t border-slate-200 text-center text-xs text-slate-400">
        <p>© 2026 College of Arts, Media and Technology (CAMT) | College Administration Portal</p>
        <p className="mt-1">ระบบจัดการการแข่งขันและกิจกรรมโครงการดิจิทัล</p>
      </footer>
    </div>
  )
}