import { useState, useEffect, useMemo, useCallback } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, attendanceRoster, attendanceMark, attendanceUnmark,
  attendanceUpdate, attendanceSummary,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"

const EVALS = [
  { v: "ดีมาก", label: "ดีมาก", icon: "star", cls: "bg-violet-100 text-violet-700" },
  { v: "ดี", label: "ดี", icon: "check", cls: "bg-emerald-100 text-emerald-700" },
  { v: "พอใช้", label: "พอใช้", icon: "check", cls: "bg-amber-100 text-amber-700" },
  { v: "ปรับปรุง", label: "ปรับปรุง", icon: "alert", cls: "bg-rose-100 text-rose-700" },
]
function evalInfo(v) { return EVALS.find((e) => e.v === v) || { v, label: v, icon: null, cls: "bg-slate-100 text-slate-600" } }

export default function AdminAttendance() {
  const { event } = useOutletContext()
  const { toast } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [dates, setDates] = useState([])
  const [dateKey, setDateKey] = useState("")
  const [viewMode, setViewMode] = useState("daily") // daily | overall
  const [roster, setRoster] = useState([])           // โหมดรายวัน
  const [summary, setSummary] = useState([])         // โหมดสรุป (raw rows)
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState("All") // All | Present | Absent
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState(null)
  const [historyOf, setHistoryOf] = useState(null)

  // โหลดวิชา
  useEffect(() => {
    fetchCoursesAdmin(event?.id).then((list) => {
      setCourses((list || []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || "")))
    }).catch(() => {})
  }, [event?.id])

  // ช่วงวันของวิชา
  useEffect(() => {
    if (!courseId) { setDates([]); setDateKey(""); return }
    const c = courses.find((x) => x.id === courseId)
    const out = []
    if (c?.start_date && c?.end_date) {
      let cur = new Date(c.start_date); const end = new Date(c.end_date)
      while (cur <= end) { out.push(new Date(cur).toISOString().split("T")[0]); cur.setDate(cur.getDate() + 1) }
    }
    if (out.length === 0) out.push(new Date().toISOString().split("T")[0])
    setDates(out)
    setDateKey((prev) => out.includes(prev) ? prev : out[0])
  }, [courseId, courses])

  // โหลดข้อมูลตามโหมด
  const loadDaily = useCallback(async () => {
    if (!courseId || !dateKey) return
    setLoading(true)
    try { setRoster(await attendanceRoster(courseId, dateKey)) }
    catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }, [courseId, dateKey, toast])

  const loadOverall = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    try { setSummary(await attendanceSummary(courseId)) }
    catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }, [courseId, toast])

  useEffect(() => {
    if (!courseId) return
    if (viewMode === "daily") loadDaily()
    else loadOverall()
  }, [courseId, dateKey, viewMode, loadDaily, loadOverall])

  // ── actions (โหมดรายวัน) ──
  async function mark(p, present) {
    if (busyId === p.participant_id || p.present === present) return
    setBusyId(p.participant_id)
    try {
      if (present) await attendanceMark(p.participant_id, courseId, dateKey)
      else await attendanceUnmark(p.participant_id, courseId, dateKey)
      await loadDaily()
    } catch (e) { toast("ผิดพลาด: " + e.message, "error") }
    finally { setBusyId(null) }
  }
  async function updateField(p, field, value) {
    // อัปเดต local ทันที (optimistic)
    setRoster((prev) => prev.map((x) => x.participant_id === p.participant_id ? { ...x, [field]: value } : x))
    try {
      await attendanceUpdate(p.participant_id, courseId, dateKey,
        field === "evaluation" ? value : p.evaluation,
        field === "note" ? value : p.note)
    } catch (_) {}
  }

  // ── สรุปยอดรวม: group raw rows ──
  const totalSessions = dates.length || 1
  const overallList = useMemo(() => {
    const byP = {}
    summary.forEach((row) => {
      if (!byP[row.participant_id]) {
        byP[row.participant_id] = { participant_id: row.participant_id, full_name: row.full_name, school: row.school, phone: row.phone, logs: [] }
      }
      if (row.date_key) byP[row.participant_id].logs.push({ date_key: row.date_key, evaluation: row.evaluation, note: row.note })
    })
    return Object.values(byP).map((s) => {
      const presentCount = s.logs.length
      const percent = Math.round((presentCount / totalSessions) * 100)
      const evalCounts = { "ดีมาก": 0, "ดี": 0, "พอใช้": 0, "ปรับปรุง": 0 }
      s.logs.forEach((l) => { if (evalCounts[l.evaluation] !== undefined) evalCounts[l.evaluation]++ })
      return { ...s, presentCount, absentCount: Math.max(0, totalSessions - presentCount), totalSessions, percent, evalCounts }
    }).sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [summary, totalSessions])

  // ── filter ──
  const dailyStats = useMemo(() => {
    const present = roster.filter((r) => r.present).length
    return { total: roster.length, present, absent: roster.length - present }
  }, [roster])

  const dailyFiltered = roster.filter((r) => {
    const matchSearch = !search || (r.full_name || "").toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === "All" || (filterType === "Present" ? r.present : !r.present)
    return matchSearch && matchType
  })
  const overallFiltered = overallList.filter((s) => !search || (s.full_name || "").toLowerCase().includes(search.toLowerCase()))

  // ── export ──
  function exportCsv() {
    let headers, lines
    if (viewMode === "daily") {
      headers = ["ชื่อ-สกุล", "โรงเรียน", "เบอร์", "วันที่", "สถานะ", "ประเมิน", "หมายเหตุ"]
      lines = [headers.join(",")]
      dailyFiltered.forEach((r) => {
        lines.push([r.full_name, r.school || "", r.phone || "", dateKey, r.present ? "มาเรียน" : "ขาด", r.present ? r.evaluation : "-", r.present ? r.note : "-"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      })
    } else {
      headers = ["ชื่อ-สกุล", "โรงเรียน", "เบอร์", "มาเรียน", "ขาด", "ทั้งหมด", "เปอร์เซ็นต์", "ดีมาก", "ดี", "พอใช้", "ปรับปรุง", "ผล"]
      lines = [headers.join(",")]
      overallFiltered.forEach((s) => {
        lines.push([s.full_name, s.school || "", s.phone || "", s.presentCount, s.absentCount, s.totalSessions, s.percent + "%",
          s.evalCounts["ดีมาก"], s.evalCounts["ดี"], s.evalCounts["พอใช้"], s.evalCounts["ปรับปรุง"], s.percent >= 80 ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      })
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = viewMode === "daily" ? `เช็คชื่อ_${dateKey}.csv` : `สรุปเข้าเรียน.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const selCourse = courses.find((c) => c.id === courseId)
  const dayIdx = dates.indexOf(dateKey)

  return (
    <div>
      {/* Header — gradient + ไอคอนวงกลม (โทนเดียวกับหน้าอื่น) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <Ico.clip className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">เช็คชื่อ & ประเมินผล</h1>
            <p className="text-slate-400 text-xs mt-0.5">{selCourse ? `${selCourse.title}${viewMode === "daily" && dateKey ? ` · Day ${dayIdx + 1}` : ""}` : "Attendance & Evaluation"}</p>
          </div>
        </div>
        {((viewMode === "daily" && roster.length > 0) || (viewMode === "overall" && overallList.length > 0)) && (
          <button onClick={exportCsv} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 shadow-sm transition active:scale-95 text-sm"><Ico.download className="w-4 h-4 text-[#F15A24]" /> Export CSV</button>
        )}
      </div>

      {/* Control panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Ico.book className="w-3.5 h-3.5 text-[#F15A24]" /> วิชา</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition mb-3">
          <option value="">— เลือกวิชา —</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>

        {courseId && (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* View toggle */}
            <div className="flex p-1 bg-slate-100 rounded-xl">
              {[{ k: "daily", icon: "calendar", l: "เช็ครายวัน" }, { k: "overall", icon: "chart", l: "สรุปยอดรวม" }].map(({ k, icon, l }) => {
                const I = Ico[icon]
                return (
                  <button key={k} onClick={() => setViewMode(k)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition ${viewMode === k ? "bg-white text-[#F15A24] shadow" : "text-slate-500 hover:text-slate-700"}`}>
                    <I className="w-4 h-4" /><span>{l}</span>
                  </button>
                )
              })}
            </div>
            {/* Date picker (daily) */}
            {viewMode === "daily" && (
              <div className="flex-1 overflow-hidden">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dates.map((d, idx) => (
                    <button key={d} onClick={() => setDateKey(d)}
                      className={`flex flex-col items-center px-3 py-1.5 rounded-xl font-bold whitespace-nowrap border-2 transition text-xs shrink-0 ${dateKey === d ? "bg-[#F15A24] text-white border-[#F15A24] shadow-md" : "bg-white text-slate-500 border-slate-200 hover:border-orange-300"}`}>
                      <span className="text-[10px] font-normal opacity-70">Day</span>
                      <span className="text-sm font-bold">{idx + 1}</span>
                      <span className="text-[10px] font-normal">{new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /><span className="text-sm">กำลังโหลด…</span>
        </div>
      )}

      {!courseId && !loading && (
        <div className="py-20 text-center text-slate-400">
          <Ico.book className="w-12 h-12 mx-auto mb-3 text-slate-300" /><div className="font-semibold text-lg">เลือกวิชาเพื่อเริ่มต้น</div>
        </div>
      )}

      {/* ── DAILY ── */}
      {courseId && !loading && viewMode === "daily" && dateKey && (
        <>
          {/* stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[{ l: "ทั้งหมด", v: dailyStats.total, c: "sky", i: "users" }, { l: "มาเรียน", v: dailyStats.present, c: "emerald", i: "check" }, { l: "ขาด", v: dailyStats.absent, c: "rose", i: "x" }].map((s) => {
              const I = Ico[s.i]
              const cmap = {
                sky: { bg: "bg-sky-50 border-sky-100", num: "text-sky-700", lbl: "text-sky-500", ic: "text-sky-500" },
                emerald: { bg: "bg-emerald-50 border-emerald-100", num: "text-emerald-700", lbl: "text-emerald-500", ic: "text-emerald-500" },
                rose: { bg: "bg-rose-50 border-rose-100", num: "text-rose-700", lbl: "text-rose-500", ic: "text-rose-500" },
              }[s.c]
              return (
                <div key={s.l} className={`rounded-2xl p-3 sm:p-4 text-center border ${cmap.bg}`}>
                  <I className={`w-5 h-5 sm:w-6 sm:h-6 mx-auto ${cmap.ic}`} />
                  <div className={`text-2xl sm:text-3xl font-bold mt-1 ${cmap.num}`}>{s.v}</div>
                  <div className={`text-xs font-semibold mt-0.5 ${cmap.lbl}`}>{s.l}</div>
                </div>
              )
            })}
          </div>
          {dailyStats.total > 0 && (
            <div className="mb-4 bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-semibold"><span>อัตราการเข้าเรียน</span><span className="text-slate-800 font-bold">{Math.round((dailyStats.present / dailyStats.total) * 100)}%</span></div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-orange-400 to-[#F15A24] rounded-full transition-all duration-700" style={{ width: `${(dailyStats.present / dailyStats.total) * 100}%` }} /></div>
            </div>
          )}
          {/* search + filter */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="flex-1 relative">
              <Ico.search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:border-[#F15A24] outline-none" />
            </div>
            <div className="flex gap-1.5">
              {["All", "Present", "Absent"].map((f) => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${filterType === f ? (f === "Present" ? "bg-emerald-500 text-white border-emerald-500" : f === "Absent" ? "bg-rose-500 text-white border-rose-500" : "bg-[#F15A24] text-white border-[#F15A24]") : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
                  {f === "All" ? `ทั้งหมด (${roster.length})` : f === "Present" ? `มา (${dailyStats.present})` : `ขาด (${dailyStats.absent})`}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left min-w-[680px]">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="px-4 py-3 w-10 text-center">#</th><th className="px-4 py-3">ชื่อ–สกุล</th>
                <th className="px-4 py-3 text-center w-20">เวลา</th><th className="px-4 py-3 text-center w-36">เช็คชื่อ</th>
                <th className="px-4 py-3 w-36">ผลการเรียน</th><th className="px-4 py-3">หมายเหตุ</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {dailyFiltered.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-sm">ไม่พบข้อมูล</td></tr>
                  : dailyFiltered.map((r, idx) => (
                    <tr key={r.participant_id} className={`transition ${busyId === r.participant_id ? "opacity-50" : r.present ? "bg-emerald-50/40 hover:bg-emerald-50/60" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3 text-center text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3"><div className="font-bold text-slate-800 text-sm">{r.full_name}</div><div className="text-xs text-slate-400">{r.school || ""}{r.phone ? " · " + r.phone : ""}</div></td>
                      <td className="px-4 py-3 text-center">{r.present ? <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">{r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "✓"}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                      <td className="px-4 py-3"><div className="flex justify-center gap-1.5">
                        <button onClick={() => mark(r, true)} disabled={busyId === r.participant_id} className={`px-3 py-1.5 rounded-lg font-bold text-xs border-2 transition ${r.present ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-400 border-slate-200 hover:border-emerald-400 hover:text-emerald-600"}`}>มา</button>
                        <button onClick={() => mark(r, false)} disabled={busyId === r.participant_id} className={`px-3 py-1.5 rounded-lg font-bold text-xs border-2 transition ${!r.present ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-400 border-slate-200 hover:border-rose-400 hover:text-rose-600"}`}>ขาด</button>
                      </div></td>
                      <td className="px-4 py-3">{r.present ? (
                        <select value={r.evaluation} onChange={(e) => updateField(r, "evaluation", e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#F15A24] bg-white">
                          {EVALS.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                        </select>) : <span className="text-slate-300 text-xs">—</span>}</td>
                      <td className="px-4 py-3">{r.present ? (
                        <input value={r.note} onChange={(e) => updateField(r, "note", e.target.value)} placeholder="หมายเหตุ…" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#F15A24] bg-white" />
                      ) : <span className="text-slate-300 text-xs">—</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {dailyFiltered.length === 0 ? <div className="py-10 text-center text-slate-400 text-sm">ไม่พบข้อมูล</div>
              : dailyFiltered.map((r) => (
                <div key={r.participant_id} className={`bg-white rounded-xl border-2 p-3 shadow-sm ${r.present ? "border-emerald-200" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      {r.present && r.scanned_at && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{new Date(r.scanned_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>}
                      <div className="font-bold text-slate-800 text-sm mt-1 truncate">{r.full_name}</div>
                      <div className="text-xs text-slate-400">{r.school || ""}{r.phone ? " · " + r.phone : ""}</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => mark(r, true)} disabled={busyId === r.participant_id} className={`w-10 h-9 rounded-lg font-bold text-xs border-2 ${r.present ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-300 border-slate-200"}`}>มา</button>
                      <button onClick={() => mark(r, false)} disabled={busyId === r.participant_id} className={`w-10 h-9 rounded-lg font-bold text-xs border-2 ${!r.present ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-300 border-slate-200"}`}>ขาด</button>
                    </div>
                  </div>
                  {r.present && (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <select value={r.evaluation} onChange={(e) => updateField(r, "evaluation", e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#F15A24]">
                        {EVALS.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                      </select>
                      <input value={r.note} onChange={(e) => updateField(r, "note", e.target.value)} placeholder="หมายเหตุ…" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#F15A24]" />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      {/* ── OVERALL ── */}
      {courseId && !loading && viewMode === "overall" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[{ l: "ทั้งหมด", v: overallList.length, c: "sky", i: "users" }, { l: "ผ่านเกณฑ์ (≥80%)", v: overallList.filter((d) => d.percent >= 80).length, c: "emerald", i: "trophy" }, { l: "ต่ำกว่าเกณฑ์", v: overallList.filter((d) => d.percent < 80).length, c: "rose", i: "alert" }, { l: "จำนวนวันเรียน", v: totalSessions, c: "orange", i: "calendar" }].map((s) => {
              const I = Ico[s.i]
              const cmap = {
                sky: { bg: "bg-sky-50 border-sky-100", num: "text-sky-700", lbl: "text-sky-500", ic: "text-sky-500" },
                emerald: { bg: "bg-emerald-50 border-emerald-100", num: "text-emerald-700", lbl: "text-emerald-500", ic: "text-emerald-500" },
                rose: { bg: "bg-rose-50 border-rose-100", num: "text-rose-700", lbl: "text-rose-500", ic: "text-rose-500" },
                orange: { bg: "bg-orange-50 border-orange-100", num: "text-orange-700", lbl: "text-orange-500", ic: "text-[#F15A24]" },
              }[s.c]
              return (
                <div key={s.l} className={`rounded-2xl p-3 text-center border ${cmap.bg}`}>
                  <I className={`w-5 h-5 mx-auto ${cmap.ic}`} />
                  <div className={`text-2xl font-bold mt-1 ${cmap.num}`}>{s.v}</div>
                  <div className={`text-xs font-semibold mt-0.5 leading-tight ${cmap.lbl}`}>{s.l}</div>
                </div>
              )
            })}
          </div>
          <div className="relative mb-3">
            <Ico.search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:border-[#F15A24] outline-none" />
          </div>

          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between"><h3 className="font-bold text-slate-700 text-sm flex items-center gap-1.5"><Ico.chart className="w-4 h-4 text-[#F15A24]" /> สรุปการเข้าเรียนและการประเมิน</h3><span className="text-xs text-slate-500">{overallFiltered.length} คน</span></div>
            <table className="w-full text-left min-w-[720px]">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="px-4 py-3">ชื่อ–สกุล</th><th className="px-4 py-3 text-center w-16">มา</th><th className="px-4 py-3 text-center w-16">ขาด</th>
                <th className="px-4 py-3 text-center w-24">%</th><th className="px-4 py-3 w-44">ประเมินสะสม</th><th className="px-4 py-3 text-center w-28">สถานะ</th><th className="px-4 py-3 text-center w-20">ประวัติ</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {overallFiltered.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-slate-400 text-sm">ไม่พบข้อมูล</td></tr>
                  : overallFiltered.map((s) => (
                    <tr key={s.participant_id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3"><div className="font-bold text-slate-800 text-sm">{s.full_name}</div><div className="text-xs text-slate-400">{s.school || ""}{s.phone ? " · " + s.phone : ""}</div></td>
                      <td className="px-4 py-3 text-center"><span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md text-sm">{s.presentCount}</span></td>
                      <td className="px-4 py-3 text-center"><span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-sm">{s.absentCount}</span></td>
                      <td className="px-4 py-3 text-center"><div className="flex flex-col items-center gap-1"><span className={`font-bold text-sm ${s.percent >= 80 ? "text-emerald-700" : "text-rose-600"}`}>{s.percent}%</span><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${s.percent >= 80 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${s.percent}%` }} /></div></div></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{Object.entries(s.evalCounts).filter(([, c]) => c > 0).map(([k, c]) => { const e = evalInfo(k); return <span key={k} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.cls}`}>{e.label} ×{c}</span> })}{Object.values(s.evalCounts).every((v) => v === 0) && <span className="text-xs text-slate-300">—</span>}</div></td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${s.percent >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{s.percent >= 80 ? <><Ico.check className="w-3 h-3" /> ผ่าน</> : <><Ico.alert className="w-3 h-3" /> ต่ำ</>}</span></td>
                      <td className="px-4 py-3 text-center"><button onClick={() => setHistoryOf(s)} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-bold transition">ดูประวัติ</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {overallFiltered.length === 0 ? <div className="py-10 text-center text-slate-400 text-sm">ไม่พบข้อมูล</div>
              : overallFiltered.map((s) => (
                <div key={s.participant_id} className={`bg-white rounded-xl border-2 p-3 shadow-sm ${s.percent >= 80 ? "border-emerald-200" : "border-rose-200"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg ${s.percent >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{s.percent >= 80 ? <><Ico.check className="w-3 h-3" /> ผ่าน</> : <><Ico.alert className="w-3 h-3" /> ต่ำกว่าเกณฑ์</>}</span>
                      <div className="font-bold text-slate-800 text-sm mt-1 truncate">{s.full_name}</div>
                      <div className="text-xs text-slate-400">{s.school || ""}{s.phone ? " · " + s.phone : ""}</div>
                    </div>
                    <button onClick={() => setHistoryOf(s)} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-bold shrink-0">ประวัติ</button>
                  </div>
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                    <div className="flex gap-3 text-center">
                      <div><div className="font-bold text-emerald-700 text-base">{s.presentCount}</div><div className="text-[10px] text-emerald-600">มา</div></div>
                      <div><div className="font-bold text-rose-600 text-base">{s.absentCount}</div><div className="text-[10px] text-rose-500">ขาด</div></div>
                    </div>
                    <div className="flex-1"><div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>เข้าเรียน</span><span className="font-bold">{s.percent}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${s.percent >= 80 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${s.percent}%` }} /></div></div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {/* History modal */}
      {historyOf && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && setHistoryOf(null)}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-4 sm:p-5 text-white flex items-center gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold opacity-80 uppercase tracking-widest mb-0.5">ประวัติการเข้าเรียน</div>
                <h3 className="text-base sm:text-lg font-bold truncate">{historyOf.full_name}</h3>
                <div className="text-xs opacity-90 mt-1">{historyOf.school || ""}{historyOf.phone ? " · " + historyOf.phone : ""}</div>
              </div>
              <button onClick={() => setHistoryOf(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white font-bold shrink-0">×</button>
            </div>
            <div className="grid grid-cols-3 border-b border-slate-200 shrink-0">
              {[{ l: "มาเรียน", v: historyOf.presentCount, c: "emerald" }, { l: "ขาด", v: historyOf.absentCount, c: "rose" }, { l: "เปอร์เซ็นต์", v: `${historyOf.percent}%`, c: historyOf.percent >= 80 ? "emerald" : "rose" }].map((x) => (
                <div key={x.l} className="py-3 text-center border-r last:border-r-0 border-slate-200">
                  <div className={`text-xl font-bold ${x.c === "emerald" ? "text-emerald-700" : "text-rose-700"}`}>{x.v}</div>
                  <div className={`text-xs font-semibold ${x.c === "emerald" ? "text-emerald-500" : "text-rose-500"}`}>{x.l}</div>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0"><tr className="text-xs font-bold text-slate-500 uppercase">
                  <th className="px-4 py-2.5">วันที่</th><th className="px-4 py-2.5 text-center">สถานะ</th><th className="px-4 py-2.5 hidden sm:table-cell">ประเมิน</th><th className="px-4 py-2.5 hidden sm:table-cell">หมายเหตุ</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {dates.map((d) => {
                    const log = historyOf.logs.find((l) => l.date_key === d)
                    return (
                      <tr key={d} className={log ? "hover:bg-emerald-50/30" : "hover:bg-rose-50/20"}>
                        <td className="px-4 py-2.5 text-sm text-slate-700 font-medium">{new Date(d).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "long" })}</td>
                        <td className="px-4 py-2.5 text-center">{log ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-bold">มาเรียน</span> : <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-lg text-xs font-bold">ขาด</span>}</td>
                        <td className="px-4 py-2.5 hidden sm:table-cell">{log?.evaluation ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${evalInfo(log.evaluation).cls}`}>{evalInfo(log.evaluation).label}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-500 hidden sm:table-cell">{log?.note || <span className="text-slate-300">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-slate-50 shrink-0 text-right">
              <button onClick={() => setHistoryOf(null)} className="bg-[#F15A24] text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-[#c44215] transition">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
    </div>
  )
}