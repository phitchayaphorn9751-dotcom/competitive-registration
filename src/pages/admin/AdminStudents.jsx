import { useState, useEffect, useMemo } from "react"
import { fetchAllProfiles, fetchRegistrationsByEmail, adminDeleteUser, adminUpdateStudent } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

const TX_STATUS = {
  confirmed: "bg-green-50 text-green-700 border-green-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  slip_uploaded: "bg-blue-50 text-blue-700 border-blue-200",
  pending_payment: "bg-yellow-50 text-yellow-700 border-yellow-200",
  waitlist: "bg-purple-50 text-purple-700 border-purple-200",
  expired: "bg-rose-50 text-rose-600 border-rose-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  held: "bg-orange-50 text-orange-700 border-orange-200",
}
function txCls(s) { return TX_STATUS[s] || "bg-gray-100 text-gray-600 border-gray-200" }
function txBar(s) {
  if (["confirmed", "approved"].includes(s)) return "bg-green-500"
  if (["submitted", "slip_uploaded"].includes(s)) return "bg-blue-500"
  if (s === "pending_payment") return "bg-yellow-400"
  if (s === "rejected") return "bg-red-500"
  return "bg-gray-300"
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
    <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
      <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /><span>กำลังโหลด…</span>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3 leading-tight">จัดการนักเรียน</h1>
        <p className="text-sm text-gray-400 pl-3 mt-0.5">ทั้งหมด {filtered.length} คน</p>
      </div>

      {/* Search + filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อ, ชื่อเล่น, เบอร์, เลขบัตร, อีเมล…"
            className="sm:col-span-2 w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] focus:border-transparent text-sm transition" />
          <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] text-sm text-gray-700 bg-white">
            <option value="All">🏫 ทุกโรงเรียน</option>
            {schools.map((s, i) => <option key={i} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Controls */}
      {filtered.length > 0 && (
        <div className="flex justify-between items-center mb-2 px-1">
          <p className="text-xs text-gray-400">หน้า <span className="font-bold text-gray-600">{page}</span> / {totalPages || 1} · {firstIdx + 1}–{Math.min(firstIdx + perPage, filtered.length)} จาก {filtered.length}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">แสดงทีละ</span>
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="border border-gray-200 px-2 py-1 rounded-lg text-xs outline-none bg-white">
              {[10, 20, 50, 100, 9999].map((n) => <option key={n} value={n}>{n === 9999 ? "ทั้งหมด" : n}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100">
              <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase w-10">#</th>
              <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">ชื่อ – อีเมล – เบอร์</th>
              <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">โรงเรียน</th>
              <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase">ระดับชั้น</th>
              <th className="px-4 py-3 text-xs font-bold text-[#F15A24] uppercase text-right">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.length > 0 ? items.map((u, idx) => (
                <tr key={u.id} onClick={() => openStudent(u)} className="cursor-pointer hover:bg-orange-50/60 transition group">
                  <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{firstIdx + idx + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-gray-800 text-sm">{u.first_name} {u.last_name}{u.nickname && <span className="font-normal text-gray-400 ml-1 text-xs">({u.nickname})</span>}</div>
                    <div className="text-xs text-blue-500 font-mono mt-0.5">{u.email || "-"}</div>
                    {u.phone && <div className="text-xs text-gray-400">📞 {u.phone}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-600 max-w-[180px]"><span className="line-clamp-2">{u.school || "-"}</span></td>
                  <td className="px-4 py-3.5 text-xs text-gray-600">{u.grade_level || "-"}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-[#F15A24] text-xs font-bold opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1">ดูข้อมูล →</span>
                  </td>
                </tr>
              )) : <tr><td colSpan="5" className="py-16 text-center text-sm text-gray-400">ไม่พบข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {items.length > 0 ? items.map((u) => (
            <div key={u.id} onClick={() => openStudent(u)} className="p-4 cursor-pointer hover:bg-orange-50/60 active:bg-orange-100 transition">
              <div className="font-bold text-gray-800 text-sm">{u.first_name} {u.last_name}{u.nickname && <span className="font-normal text-gray-400 ml-1 text-xs">({u.nickname})</span>}</div>
              <div className="text-xs text-blue-500 font-mono truncate">{u.email || "-"}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                {u.phone && <span>📞 {u.phone}</span>}
                {u.school && <span className="truncate max-w-[180px]">🏫 {u.school}</span>}
                {u.grade_level && <span>{u.grade_level}</span>}
              </div>
            </div>
          )) : <div className="py-12 text-center text-sm text-gray-400">ไม่พบข้อมูล</div>}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-center gap-1.5 flex-wrap">
            <button onClick={() => setPage(page - 1)} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">← ก่อนหน้า</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const near = Math.abs(p - page) <= 2 || p === 1 || p === totalPages
              if (!near) { if (p === page - 3 || p === page + 3) return <span key={p} className="text-gray-300 text-xs px-1">…</span>; return null }
              return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg border text-xs font-bold transition ${page === p ? "bg-[#F15A24] text-white border-[#F15A24] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{p}</button>
            })}
            <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">ถัดไป →</button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-[#F15A24] font-bold text-lg">{selected.first_name?.[0] || "?"}</div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base leading-tight">{selected.first_name} {selected.last_name}{selected.nickname && <span className="text-gray-400 font-normal text-sm ml-1">({selected.nickname})</span>}</h3>
                  <p className="text-xs text-blue-500 font-mono">{selected.email || "-"}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition text-lg leading-none">×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                {/* Left: info */}
                <div className="lg:col-span-3 p-5 sm:p-6 space-y-6">
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">1</span> ข้อมูลนักเรียน</h4>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">{selected.nationality === "foreign" ? "Passport Number" : "เลขบัตรประชาชน"}</label>
                      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono font-bold text-gray-800">
                        <span>{selected.national_id || selected.passport_no || "-"}</span>
                        {selected.nationality === "foreign" && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">ต่างชาติ</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[["คำนำหน้า", selected.title], ["ชื่อจริง", selected.first_name], ["นามสกุล", selected.last_name], ["ชื่อเล่น", selected.nickname], ["อีเมล", selected.email, true], ["อายุ", selected.age], ["เบอร์โทร", selected.phone], ["ระดับชั้น", selected.grade_level], ["Line ID", selected.line_id], ["โรงเรียน", selected.school, true]].map(([label, val, span], i) => (
                        <div key={i} className={span ? "sm:col-span-2" : ""}>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">{label}</label>
                          <div className="text-sm font-medium text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 min-h-[38px] flex items-center">{val || <span className="text-gray-300">-</span>}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <hr className="border-gray-100" />
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">2</span> ข้อมูลผู้ปกครอง</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[["คำนำหน้า", selected.parent_title], ["ชื่อ-สกุล ผู้ปกครอง", selected.parent_full_name], ["ความสัมพันธ์", selected.parent_relationship], ["เบอร์โทรผู้ปกครอง", selected.parent_phone]].map(([label, val], i) => (
                        <div key={i}>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">{label}</label>
                          <div className="text-sm font-medium text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 min-h-[38px] flex items-center">{val || <span className="text-gray-300">-</span>}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <hr className="border-gray-100" />
                  <section>
                    <h4 className="text-xs font-bold text-[#F15A24] uppercase tracking-widest mb-3 flex items-center gap-2"><span className="bg-orange-100 text-[#F15A24] px-2 py-0.5 rounded-md">3</span> ที่อยู่</h4>
                    <div className="text-sm font-medium text-gray-800 bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-100">{fullAddr(selected) || <span className="text-gray-300">-</span>}</div>
                  </section>
                </div>

                {/* Right: registrations */}
                <div className="lg:col-span-2 p-5 sm:p-6 flex flex-col bg-gray-50/50">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-600 p-1 rounded-lg text-sm">💳</span> ประวัติการสมัคร
                    <span className="ml-auto bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">{txs.length}</span>
                  </h4>
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {loadingTx ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
                      : txs.length === 0 ? <div className="py-12 text-center text-gray-300 text-sm">ยังไม่มีประวัติการสมัคร</div>
                      : txs.map((tx) => (
                        <div key={tx.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition relative overflow-hidden">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${txBar(tx.status)}`} />
                          <div className="pl-2">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                              <h5 className="font-bold text-gray-800 text-sm leading-tight line-clamp-2">{tx.course_title}</h5>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${txCls(tx.status)}`}>{tx.status}</span>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                              <span className="text-[10px] text-gray-400 font-mono">#{tx.id.substring(0, 8)}… · {fmtDate(tx.created_at)}</span>
                              {tx.slip_url ? <a href={tx.slip_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 transition">🧾 ดูสลิป</a>
                                : <span className="text-xs text-gray-300 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-200">ไม่มีสลิป</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Footer: แก้ไข / ลบ */}
            <div className="border-t border-gray-100 p-4 flex gap-3 justify-end bg-white">
              <button onClick={() => setEditStudent(selected)}
                className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition">✏️ แก้ไขข้อมูล</button>
              <button onClick={() => doDeleteUser(selected)}
                className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 font-bold text-sm hover:bg-red-100 transition">🗑 ลบผู้ใช้</button>
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
  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]"

  async function save() {
    setBusy(true)
    try { await adminUpdateStudent(student.id, f); toast("บันทึกข้อมูลแล้ว", "success"); onSaved() }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error"); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#F15A24]" />
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">✏️ แก้ไขข้อมูลนักเรียน</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {/* ล็อก: เลขบัตร + อีเมล */}
          <div className="bg-gray-100 rounded-xl p-3 space-y-2">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">เลขบัตร/Passport (แก้ไม่ได้) 🔒</label>
              <div className="text-sm font-mono font-bold text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{student.national_id || student.passport_no || "-"}</div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">อีเมล (แก้ไม่ได้) 🔒</label>
              <div className="text-sm font-mono text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{student.email || "-"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">คำนำหน้า</label><input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">ชื่อเล่น</label><input className={inputCls} value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">ชื่อจริง</label><input className={inputCls} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">นามสกุล</label><input className={inputCls} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">อายุ</label><input className={inputCls} value={f.age} onChange={(e) => set("age", e.target.value.replace(/[^0-9]/g, ""))} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">เบอร์โทร</label><input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">ระดับชั้น</label><input className={inputCls} value={f.grade_level} onChange={(e) => set("grade_level", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Line ID</label><input className={inputCls} value={f.line_id} onChange={(e) => set("line_id", e.target.value)} /></div>
            <div className="col-span-2"><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">โรงเรียน</label><input className={inputCls} value={f.school} onChange={(e) => set("school", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">ชื่อผู้ปกครอง</label><input className={inputCls} value={f.parent_full_name} onChange={(e) => set("parent_full_name", e.target.value)} /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">เบอร์ผู้ปกครอง</label><input className={inputCls} value={f.parent_phone} onChange={(e) => set("parent_phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} /></div>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition">ยกเลิก</button>
          <button onClick={save} disabled={busy} className="py-2.5 bg-[#F15A24] text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition disabled:opacity-50">บันทึก</button>
        </div>
      </div>
    </div>
  )
}