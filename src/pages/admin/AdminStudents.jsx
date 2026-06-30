import { useState, useEffect, useMemo } from "react"
import { fetchAllProfiles, fetchRegistrationsByEmail, adminDeleteUser, adminUpdateStudent, fetchAllSchools, searchSchools } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) — ชุดเดียวกับหน้ารายการสมัคร ─────
const Ico = {
  users:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  search:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  phone:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>),
  school:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17M6 5v17M12 7v5"/><path d="M12 2 2 7l10 5 10-5-10-5Z"/></svg>),
  mail:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  cap:      (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  card:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>),
  receipt:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>),
  pencil:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>),
  trash:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>),
  arrowRight:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>),
  arrowLeft:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
  folder:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 11v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2Z"/></svg>),
}

const TX_STATUS = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  submitted: "bg-sky-50 text-sky-700 border-sky-200",
  slip_uploaded: "bg-sky-50 text-sky-700 border-sky-200",
  pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
  waitlist: "bg-slate-100 text-slate-600 border-slate-200",
  expired: "bg-rose-50 text-rose-600 border-rose-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  held: "bg-orange-50 text-orange-700 border-orange-200",
}
function txCls(s) { return TX_STATUS[s] || "bg-slate-100 text-slate-600 border-slate-200" }
function txBar(s) {
  if (["confirmed", "approved"].includes(s)) return "bg-emerald-500"
  if (["submitted", "slip_uploaded"].includes(s)) return "bg-sky-500"
  if (s === "pending_payment") return "bg-amber-400"
  if (s === "rejected") return "bg-rose-500"
  return "bg-slate-300"
}

export default function AdminStudents() {
  const { toast, confirm } = useDialog()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSchool, setFilterSchool] = useState("All")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [selected, setSelected] = useState(null)
  const [txs, setTxs] = useState([])
  const [loadingTx, setLoadingTx] = useState(false)
  const [editStudent, setEditStudent] = useState(null)

  function load() {
    setLoading(true)
    fetchAllProfiles().then(setStudents).catch((e) => toast("โหลดไม่สำเร็จ: " + e.message, "error")).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // ข้อ 11: ลบผู้ใช้ + ประวัติการสมัครทั้งหมด
  async function doDeleteUser(u) {
    const ok = await confirm({
      title: "🗑 ลบผู้ใช้นี้?",
      message: `ลบ "${u.first_name || ""} ${u.last_name || ""}" (${u.email})\nประวัติการสมัครทั้งหมดของผู้ใช้นี้จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmText: "ลบถาวร", tone: "danger",
    })
    if (!ok) return
    try {
      await adminDeleteUser(u.email)
      toast("ลบผู้ใช้เรียบร้อย", "success")
      setSelected(null); load()
    } catch (e) { toast("ลบไม่สำเร็จ: " + e.message, "error") }
  }

  const schools = useMemo(() => [...new Set(students.map((s) => s.school).filter(Boolean))].sort(), [students])

  const filtered = useMemo(() => students.filter((u) => {
    if (filterSchool !== "All" && u.school !== filterSchool) return false
    if (search) {
      const q = search.toLowerCase()
      return [u.first_name, u.last_name, u.nickname, u.phone, u.national_id, u.email]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    }
    return true
  }), [students, filterSchool, search])

  useEffect(() => { setPage(1) }, [search, filterSchool, perPage])

  const totalPages = Math.ceil(filtered.length / perPage)
  const firstIdx = (page - 1) * perPage
  const items = filtered.slice(firstIdx, firstIdx + perPage)

  async function openStudent(u) {
    setSelected(u); setLoadingTx(true)
    try { setTxs(await fetchRegistrationsByEmail(u.email || "")) }
    catch { setTxs([]) }
    finally { setLoadingTx(false) }
  }

  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString("th-TH") : "-" }
  function fullAddr(u) {
    return [u.address, u.subdistrict && `ต.${u.subdistrict}`, u.district && `อ.${u.district}`, u.province && `จ.${u.province}`, u.zipcode].filter(Boolean).join(" ")
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
      <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /><span>กำลังโหลด…</span>
    </div>
  )

  return (
    <div className="pb-24 lg:pb-6">
      {/* Header — gradient + ไอคอนวงกลม (โทนเดียวกับหน้ารายการสมัคร) */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">จัดการนักเรียน</h1>
          <p className="text-slate-400 text-xs mt-0.5">ทั้งหมด {filtered.length} คน</p>
        </div>
      </div>

      {/* Search + filter — สไตล์ search box หน้ารายการสมัคร */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Ico.search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, ชื่อเล่น, เบอร์, เลขบัตร, อีเมล…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F15A24]/40 focus:border-[#F15A24] focus:bg-white transition" />
          </div>
          <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24]/40 focus:border-[#F15A24] text-sm text-slate-700 bg-slate-50 focus:bg-white transition">
            <option value="All">ทุกโรงเรียน</option>
            {schools.map((s, i) => <option key={i} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Controls */}
      {filtered.length > 0 && (
        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-xs text-slate-400">หน้า <span className="font-bold text-slate-600">{page}</span> / {totalPages || 1} · {firstIdx + 1}–{Math.min(firstIdx + perPage, filtered.length)} จาก {filtered.length}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">แสดงทีละ</span>
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="border border-slate-200 px-2 py-1 rounded-lg text-xs outline-none bg-white">
              {[10, 20, 50, 100, 9999].map((n) => <option key={n} value={n}>{n === 9999 ? "ทั้งหมด" : n}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* รายการ — การ์ดแบบหน้ารายการสมัคร (เหมือนกันทั้ง desktop & mobile) */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {items.map((u, idx) => (
            <div key={u.id} onClick={() => openStudent(u)}
              className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-orange-200 transition-all duration-300 cursor-pointer">
              <div className="p-4 sm:p-5">
                {/* แถวบน: ลำดับ + ชื่อ / ปุ่มดูข้อมูล */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-orange-50 text-[#F15A24] text-xs font-bold flex items-center justify-center shrink-0 border border-orange-100">{firstIdx + idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 text-sm sm:text-[15px] leading-snug">{u.first_name} {u.last_name}{u.nickname && <span className="font-normal text-slate-400 ml-1 text-xs">({u.nickname})</span>}</h3>
                      {u.grade_level && <span className="inline-block mt-1 text-[10px] font-bold text-[#F15A24] bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md">{u.grade_level}</span>}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#F15A24] opacity-60 group-hover:opacity-100 transition shrink-0">ดูข้อมูล <Ico.arrowRight className="w-3.5 h-3.5" /></span>
                </div>

                {/* รายละเอียดรอง: อีเมล · เบอร์ · โรงเรียน */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-3 pt-2.5 border-t border-slate-50">
                  {u.email && <span className="inline-flex items-center gap-1 truncate max-w-[220px]"><Ico.mail className="w-3 h-3 shrink-0" /> {u.email}</span>}
                  {u.phone && <span className="inline-flex items-center gap-1"><Ico.phone className="w-3 h-3" /> {u.phone}</span>}
                  {u.school && <span className="inline-flex items-center gap-1 truncate max-w-[200px]"><Ico.school className="w-3 h-3 shrink-0" /> {u.school}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Ico.folder className="w-6 h-6" />
          </div>
          <p className="font-semibold text-slate-700">ไม่พบข้อมูล</p>
          <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนตัวกรองหรือคำค้นหา</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 px-4 py-3 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center gap-1.5 flex-wrap">
          <button onClick={() => setPage(page - 1)} disabled={page === 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><Ico.arrowLeft className="w-3.5 h-3.5" /> ก่อนหน้า</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const near = Math.abs(p - page) <= 2 || p === 1 || p === totalPages
            if (!near) { if (p === page - 3 || p === page + 3) return <span key={p} className="text-slate-300 text-xs px-1">…</span>; return null }
            return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg border text-xs font-bold transition ${page === p ? "bg-[#F15A24] text-white border-[#F15A24] shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{p}</button>
          })}
          <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition">ถัดไป <Ico.arrowRight className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-[#F15A24] font-bold text-lg">{selected.first_name?.[0] || "?"}</div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base leading-tight">{selected.first_name} {selected.last_name}{selected.nickname && <span className="text-slate-400 font-normal text-sm ml-1">({selected.nickname})</span>}</h3>
                  <p className="text-xs text-sky-500 font-mono">{selected.email || "-"}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition text-lg leading-none">×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                {/* Left: info */}
                <div className="lg:col-span-3 p-5 sm:p-6 space-y-6">
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">1</span> ข้อมูลนักเรียน</h4>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">{selected.nationality === "foreign" ? "Passport Number" : "เลขบัตรประชาชน"}</label>
                      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono font-bold text-slate-800">
                        <span>{selected.national_id || selected.passport_no || "-"}</span>
                        {selected.nationality === "foreign" && <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold">ต่างชาติ</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[["คำนำหน้า", selected.title], ["ชื่อจริง", selected.first_name], ["นามสกุล", selected.last_name], ["ชื่อเล่น", selected.nickname], ["อีเมล", selected.email, true], ["อายุ", selected.age], ["เบอร์โทร", selected.phone], ["ระดับชั้น", selected.grade_level], ["Line ID", selected.line_id], ["โรงเรียน", selected.school, true]].map(([label, val, span], i) => (
                        <div key={i} className={span ? "sm:col-span-2" : ""}>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">{label}</label>
                          <div className="text-sm font-medium text-slate-800 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 min-h-[38px] flex items-center">{val || <span className="text-slate-300">-</span>}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <hr className="border-slate-100" />
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">2</span> ข้อมูลผู้ปกครอง</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[["คำนำหน้า", selected.parent_title], ["ชื่อ-สกุล ผู้ปกครอง", selected.parent_full_name], ["ความสัมพันธ์", selected.parent_relationship], ["เบอร์โทรผู้ปกครอง", selected.parent_phone]].map(([label, val], i) => (
                        <div key={i}>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">{label}</label>
                          <div className="text-sm font-medium text-slate-800 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 min-h-[38px] flex items-center">{val || <span className="text-slate-300">-</span>}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <hr className="border-slate-100" />
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">3</span> ที่อยู่</h4>
                    <div className="text-sm font-medium text-slate-800 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100">{fullAddr(selected) || <span className="text-slate-300">-</span>}</div>
                  </section>
                </div>

                {/* Right: registrations */}
                <div className="lg:col-span-2 p-5 sm:p-6 flex flex-col bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="bg-sky-100 text-sky-600 p-1 rounded-lg flex items-center justify-center"><Ico.card className="w-4 h-4" /></span> ประวัติการสมัคร
                    <span className="ml-auto bg-sky-100 text-sky-700 text-[10px] font-black px-2 py-0.5 rounded-full">{txs.length}</span>
                  </h4>
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {loadingTx ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" /></div>
                      : txs.length === 0 ? <div className="py-12 text-center text-slate-300 text-sm">ยังไม่มีประวัติการสมัคร</div>
                      : txs.map((tx) => (
                        <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition relative overflow-hidden">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${txBar(tx.status)}`} />
                          <div className="pl-2">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                              <h5 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{tx.course_title}</h5>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${txCls(tx.status)}`}>{tx.status}</span>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                              <span className="text-[10px] text-slate-400 font-mono">#{tx.id.substring(0, 8)}… · {fmtDate(tx.created_at)}</span>
                              {tx.slip_url ? <a href={tx.slip_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-600 font-bold hover:text-sky-800 bg-sky-50 px-2.5 py-1.5 rounded-lg border border-sky-100 transition"><Ico.receipt className="w-3.5 h-3.5" /> ดูสลิป</a>
                                : <span className="text-xs text-slate-300 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200">ไม่มีสลิป</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Footer: แก้ไข / ลบ */}
            <div className="border-t border-slate-100 p-4 flex gap-3 justify-end bg-white">
              <button onClick={() => setEditStudent(selected)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition"><Ico.pencil className="w-4 h-4" /> แก้ไขข้อมูล</button>
              <button onClick={() => doDeleteUser(selected)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-sm hover:bg-rose-100 transition"><Ico.trash className="w-4 h-4" /> ลบผู้ใช้</button>
            </div>
          </div>
        </div>
      )}
      {editStudent && <EditStudentModal student={editStudent} onClose={() => setEditStudent(null)}
        onSaved={() => { setEditStudent(null); setSelected(null); load() }} toast={toast} />}
    </div>
  )
}

// ข้อ 9: แก้ข้อมูลนักเรียน (ล็อกเลขบัตร + อีเมล)
function EditStudentModal({ student, onClose, onSaved, toast }) {
  const [f, setF] = useState({
    title: student.title || "", first_name: student.first_name || "", last_name: student.last_name || "",
    nickname: student.nickname || "", age: student.age || "", phone: student.phone || "",
    grade_level: student.grade_level || "", line_id: student.line_id || "", school: student.school || "",
    parent_full_name: student.parent_full_name || "", parent_phone: student.parent_phone || "",
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] transition"

  // ── โรงเรียน autocomplete (เหมือนหน้าลงทะเบียน) ──
  const [allSchools, setAllSchools] = useState([])
  const [schoolOptions, setSchoolOptions] = useState([])
  const [showSchoolDD, setShowSchoolDD] = useState(false)
  useEffect(() => { fetchAllSchools().then(setAllSchools).catch(() => {}) }, [])
  const normalizeSchool = (s) => (s || "").toLowerCase().replace(/โรงเรียน|ร\.ร\.|รร\./g, "").trim()
  async function onSchoolInput(val) {
    set("school", val)
    if (val.trim().length === 0) { setShowSchoolDD(false); return }
    const norm = normalizeSchool(val)
    let list = allSchools.filter((s) => normalizeSchool(s).includes(norm)).slice(0, 10)
    if (list.length === 0 && allSchools.length === 0) {
      try { list = await searchSchools(val) } catch { list = [] }
    }
    setSchoolOptions(list); setShowSchoolDD(true)
  }
  function pickSchool(name) { set("school", name); setShowSchoolDD(false) }

  async function save() {
    setBusy(true)
    try { await adminUpdateStudent(student.id, f); toast("บันทึกข้อมูลแล้ว", "success"); onSaved() }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error"); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-white text-base flex items-center gap-2"><Ico.pencil className="w-5 h-5" /> แก้ไขข้อมูลนักเรียน</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {/* ล็อก: เลขบัตร + อีเมล */}
          <div className="bg-slate-100 rounded-xl p-3 space-y-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เลขบัตร/Passport (แก้ไม่ได้) 🔒</label>
              <div className="text-sm font-mono font-bold text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">{student.national_id || student.passport_no || "-"}</div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">อีเมล (แก้ไม่ได้) 🔒</label>
              <div className="text-sm font-mono text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">{student.email || "-"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">คำนำหน้า</label><input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อเล่น</label><input className={inputCls} value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อจริง</label><input className={inputCls} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">นามสกุล</label><input className={inputCls} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">อายุ</label><input className={inputCls} value={f.age} onChange={(e) => set("age", e.target.value.replace(/[^0-9]/g, ""))} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เบอร์โทร</label><input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ระดับชั้น</label><input className={inputCls} value={f.grade_level} onChange={(e) => set("grade_level", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Line ID</label><input className={inputCls} value={f.line_id} onChange={(e) => set("line_id", e.target.value)} /></div>
            <div className="col-span-2 relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">โรงเรียน</label>
              <input className={inputCls} value={f.school} placeholder="พิมพ์ชื่อโรงเรียน เช่น ยุพราช..."
                onChange={(e) => onSchoolInput(e.target.value)} onBlur={() => setTimeout(() => setShowSchoolDD(false), 200)} />
              {showSchoolDD && schoolOptions.length > 0 && (
                <ul className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
                  {schoolOptions.map((s, i) => (
                    <li key={i} onClick={() => pickSchool(s)} className="px-4 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 text-slate-700">{s}</li>
                  ))}
                </ul>
              )}
            </div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อผู้ปกครอง</label><input className={inputCls} value={f.parent_full_name} onChange={(e) => set("parent_full_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เบอร์ผู้ปกครอง</label><input className={inputCls} value={f.parent_phone} onChange={(e) => set("parent_phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} /></div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition">ยกเลิก</button>
          <button onClick={save} disabled={busy} className="py-2.5 bg-[#F15A24] text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition disabled:opacity-50">บันทึก</button>
        </div>
      </div>
    </div>
  )
}