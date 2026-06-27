import { useEffect, useState, useMemo } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { fetchRegistrations, subscribeRegistrations } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

// สถานะ (ตรงกับระบบเรา)
const STATUS = {
  pending_payment: { label: "⚠️ รอชำระเงิน", cls: "bg-yellow-100 text-yellow-700 border-yellow-200", color: "yellow" },
  pending_review:  { label: "⏳ รอพิจารณา", cls: "bg-blue-100 text-blue-700 border-blue-200", color: "blue" },
  slip_uploaded:   { label: "⏳ รอพิจารณา", cls: "bg-blue-100 text-blue-700 border-blue-200", color: "blue" },
  submitted:       { label: "⏳ รอพิจารณา", cls: "bg-blue-100 text-blue-700 border-blue-200", color: "blue" },
  confirmed:       { label: "✅ ยืนยันแล้ว", cls: "bg-green-100 text-green-700 border-green-200", color: "green" },
  approved:        { label: "✅ ยืนยันแล้ว", cls: "bg-green-100 text-green-700 border-green-200", color: "green" },
  waitlist:        { label: "📋 คิวสำรอง", cls: "bg-purple-100 text-purple-700 border-purple-200", color: "purple" },
  expired:         { label: "⏰ หมดเวลา", cls: "bg-rose-50 text-rose-500 border-rose-200", color: "rose" },
  rejected:        { label: "❌ ไม่ผ่าน", cls: "bg-red-100 text-red-700 border-red-200", color: "red" },
  cancelled:       { label: "🚫 ยกเลิกแล้ว", cls: "bg-gray-100 text-gray-400 border-gray-200", color: "gray" },
  held:            { label: "🕓 กันที่นั่ง", cls: "bg-orange-100 text-orange-700 border-orange-200", color: "orange" },
}
function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: "bg-gray-100 text-gray-500 border-gray-200" }
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

// pills: key + label + สี
// สถานะรวม 4 แบบ (ไม่แยกมีค่าใช้จ่าย/ไม่มี)
const FILTERS = [
  { key: "all", label: "ทั้งหมด", color: "gray" },
  { key: "pending_payment", label: "รอชำระเงิน", color: "yellow" },
  { key: "pending_review", label: "รอพิจารณา", color: "blue" },
  { key: "confirmed", label: "ยืนยันแล้ว", color: "green" },
  { key: "waitlist", label: "คิวสำรอง", color: "purple" },
  { key: "rejected", label: "ไม่ผ่าน", color: "red" },
  { key: "cancelled", label: "ยกเลิก", color: "gray" },
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
const PILL = {
  gray: "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200",
  green: "bg-green-50 text-green-700 border-green-300 hover:bg-green-100",
  blue: "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100",
  purple: "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100",
  red: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
  rose: "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100",
}
const PILL_ACTIVE = {
  gray: "bg-gray-600 text-white border-gray-600",
  green: "bg-green-600 text-white border-green-600",
  blue: "bg-blue-600 text-white border-blue-600",
  yellow: "bg-yellow-500 text-white border-yellow-500",
  purple: "bg-purple-600 text-white border-purple-600",
  red: "bg-red-600 text-white border-red-600",
  rose: "bg-rose-600 text-white border-rose-600",
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3 leading-tight">รายการสมัคร</h1>
          <p className="text-sm text-gray-400 pl-3 mt-0.5">{filtered.length} รายการ</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-sm transition text-sm">
          ⬇ Export CSV
        </button>
      </div>

      {/* Quick filter pills (สถานะรวม) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(({ key, label, color }) => {
          const count = key === "all" ? regs.length : counts[key] || 0
          const active = filter === key
          return (
            <button key={key} onClick={() => { setFilter(key); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition ${active ? PILL_ACTIVE[color] : PILL[color]}`}>
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white/20" : "bg-black/10"}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search + course filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="🔍 ค้นหาชื่อ, โรงเรียน, เบอร์, อีเมล, วิชา…"
            className="sm:col-span-2 w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] focus:border-transparent text-sm transition" />
          <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] text-sm text-gray-700 bg-white transition">
            <option value="all">📚 ทุกวิชา</option>
            {courseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </div>
      </div>

      {/* Table controls */}
      {!loading && filtered.length > 0 && (
        <div className="flex justify-between items-center mb-2 px-1">
          <p className="text-xs text-gray-400">
            หน้า <span className="font-bold text-gray-600">{page}</span> / {totalPages || 1} · แสดง {firstIdx + 1}–{Math.min(firstIdx + perPage, filtered.length)} จาก {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">แสดงทีละ</span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="border border-gray-200 px-2 py-1 rounded-lg text-xs outline-none bg-white">
              {[10, 20, 50, 100, 9999].map((n) => <option key={n} value={n}>{n === 9999 ? "ทั้งหมด" : n}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100">
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">วันที่สมัคร</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">วิชา</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">ชื่อ–สกุล</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">เบอร์ / อีเมล</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">สถานะ</th>
                <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan="6" className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="w-8 h-8 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">กำลังโหลด…</span>
                  </div>
                </td></tr>
              ) : pageItems.length > 0 ? pageItems.map((r) => (
                <tr key={r.id} onClick={() => goVerify(r.id)} className="hover:bg-orange-50/60 transition cursor-pointer group">
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3.5"><span className="font-medium text-gray-800 text-xs leading-snug line-clamp-2 max-w-[160px] block">{r.courses?.title || "-"}</span></td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-gray-800 text-sm">{mainName(r)}</div>
                    {mainSchool(r) && <div className="text-xs text-gray-400 truncate max-w-[160px]">{mainSchool(r)}</div>}
                    {(r.participants?.length || 0) > 1 && <div className="text-[10px] text-purple-500 font-bold">+ ทีม {r.participants.length} คน</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs text-gray-600 flex items-center gap-1">📞 {mainPhone(r)}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[160px] mt-0.5">{r.submitter_email || "-"}</div>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={unifyStatus(r)} /></td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-[#F15A24] text-xs font-bold opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1">ตรวจสอบ →</span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="py-16 text-center text-sm text-gray-400">ไม่พบข้อมูลที่ค้นหา</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">กำลังโหลด…</span>
            </div>
          ) : pageItems.length > 0 ? pageItems.map((r) => (
            <div key={r.id} onClick={() => goVerify(r.id)} className="p-4 hover:bg-orange-50/60 active:bg-orange-100 transition cursor-pointer">
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-800 text-sm">{mainName(r)}</div>
                  {(r.participants?.length || 0) > 1 && <div className="text-[10px] text-purple-500 font-bold">+ ทีม {r.participants.length} คน</div>}
                </div>
                <StatusBadge status={unifyStatus(r)} />
              </div>
              <div className="text-xs text-gray-600 font-medium mb-1 line-clamp-1">📚 {r.courses?.title || "-"}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                <span>📞 {mainPhone(r)}</span>
                {mainSchool(r) && <span className="truncate max-w-[140px]">🏫 {mainSchool(r)}</span>}
                <span className="text-gray-300">{fmtDate(r.created_at)}</span>
              </div>
            </div>
          )) : (
            <div className="py-12 text-center text-sm text-gray-400">ไม่พบข้อมูลที่ค้นหา</div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-center gap-1.5 flex-wrap">
            <button onClick={() => setPage(page - 1)} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">← ก่อนหน้า</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const near = Math.abs(p - page) <= 2 || p === 1 || p === totalPages
              if (!near) {
                if (p === page - 3 || p === page + 3) return <span key={p} className="text-gray-300 text-xs px-1">…</span>
                return null
              }
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg border text-xs font-bold transition ${page === p ? "bg-[#F15A24] text-white border-[#F15A24] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{p}</button>
              )
            })}
            <button onClick={() => setPage(page + 1)} disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">ถัดไป →</button>
          </div>
        )}
      </div>
    </div>
  )
}