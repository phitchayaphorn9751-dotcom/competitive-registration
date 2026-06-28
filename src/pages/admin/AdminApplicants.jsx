import { useEffect, useState, useMemo } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { fetchRegistrations, subscribeRegistrations } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้าอื่น ─────
const Ico = {
  download: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>),
  search:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  book:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  phone:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>),
  school:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17M6 5v17M12 7v5"/><path d="M12 2 2 7l10 5 10-5-10-5Z"/></svg>),
  arrowRight:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>),
  arrowLeft:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
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
    <div>
      {/* Header */}
      <div className="flex flex-row justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 border-l-4 border-[#F15A24] pl-3 leading-tight">รายการสมัคร</h1>
          <p className="text-sm text-slate-400 pl-3 mt-0.5">{filtered.length} รายการ</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-emerald-700 shadow-sm transition text-xs shrink-0">
          <Ico.download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export</span>
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Ico.search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="ค้นหาชื่อ, โรงเรียน, เบอร์, อีเมล, วิชา…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] focus:border-transparent text-sm transition" />
          </div>
          <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] text-sm text-slate-700 bg-white transition">
            <option value="all">ทุกวิชา</option>
            {courseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </div>
      </div>

      {/* Table controls */}
      {!loading && filtered.length > 0 && (
        <div className="flex justify-between items-center mb-2 px-1">
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100">
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">วิชา</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">ชื่อ–สกุล</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">เบอร์ / อีเมล</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">สถานะ</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="5" className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-8 h-8 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">กำลังโหลด…</span>
                  </div>
                </td></tr>
              ) : pageItems.length > 0 ? pageItems.map((r) => (
                <tr key={r.id} onClick={() => goVerify(r.id)} className="hover:bg-orange-50/60 transition cursor-pointer group">
                  <td className="px-4 py-3.5 max-w-[220px]">
                    <span className="font-bold text-[#F15A24] text-sm leading-snug line-clamp-2 block">{r.courses?.title || "-"}</span>
                    {courseCategory(r) && <span className="inline-block mt-1 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md">{courseCategory(r)}</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-700 text-sm">{mainName(r)}</div>
                    {mainSchool(r) && <div className="text-xs text-slate-400 truncate max-w-[160px]">{mainSchool(r)}</div>}
                    {(r.participants?.length || 0) > 1 && <div className="text-[10px] text-[#F15A24] font-bold">+ ทีม {r.participants.length} คน</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs text-slate-600 flex items-center gap-1"><Ico.phone className="w-3 h-3 text-slate-400" /> {mainPhone(r)}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[160px] mt-0.5">{r.submitter_email || "-"}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={unifyStatus(r)} />
                    <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">{fmtDate(r.created_at)}</div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-[#F15A24] text-xs font-bold opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1">ตรวจสอบ <Ico.arrowRight className="w-3.5 h-3.5" /></span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="py-16 text-center text-sm text-slate-400">ไม่พบข้อมูลที่ค้นหา</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
              <div className="w-7 h-7 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">กำลังโหลด…</span>
            </div>
          ) : pageItems.length > 0 ? pageItems.map((r) => (
            <div key={r.id} onClick={() => goVerify(r.id)} className="p-4 hover:bg-orange-50/60 active:bg-orange-100 transition cursor-pointer">
              {/* แถวบน: ชื่อวิชา (สีส้ม เด่น) + หมวด / สถานะ + วันที่ */}
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#F15A24] text-sm leading-snug line-clamp-2">{r.courses?.title || "-"}</div>
                  {courseCategory(r) && <span className="inline-block mt-1 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md">{courseCategory(r)}</span>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={unifyStatus(r)} />
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtDate(r.created_at)}</span>
                </div>
              </div>
              {/* ชื่อผู้สมัคร + badge ทีม */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-slate-700">{mainName(r)}</span>
                {(r.participants?.length || 0) > 1 && <span className="text-[10px] text-[#F15A24] font-bold bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full shrink-0">ทีม {r.participants.length} คน</span>}
              </div>
              {/* รายละเอียดรอง: เบอร์ · โรงเรียน */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1"><Ico.phone className="w-3 h-3" /> {mainPhone(r)}</span>
                {mainSchool(r) && <span className="truncate max-w-[140px] inline-flex items-center gap-1"><Ico.school className="w-3 h-3 shrink-0" /> {mainSchool(r)}</span>}
              </div>
            </div>
          )) : (
            <div className="py-12 text-center text-sm text-slate-400">ไม่พบข้อมูลที่ค้นหา</div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-center gap-1.5 flex-wrap">
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
      </div>
    </div>
  )
}