import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, importExternalParticipant, fetchCourseParticipants,
  deleteImportedParticipant, deleteImportedByCourse, importUserProfile,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"

const HEADER_MAP = {
  "ชื่อ-สกุล": "full_name", "ชื่อ-นามสกุล": "full_name", "ชื่อ": "full_name", "full_name": "full_name", "name": "full_name",
  "โรงเรียน": "school", "school": "school",
  "ระดับชั้น": "grade_level", "ระดับ": "grade_level", "grade_level": "grade_level", "grade": "grade_level",
  "เบอร์โทร": "phone", "เบอร์": "phone", "phone": "phone", "tel": "phone",
  "อีเมล": "email", "email": "email", "e-mail": "email",
  "เลขบัตรประชาชน": "national_id", "เลขบัตร": "national_id", "national_id": "national_id", "id_card": "national_id",
}

function splitLine(line) {
  const out = []; let cur = ""; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === "," && !q) { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "")
  if (lines.length === 0) return { headers: [], fields: [], rows: [] }
  const headers = splitLine(lines[0])
  const fields = headers.map((h) => HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h] || null)
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line)
    const raw = {}; headers.forEach((h, i) => { raw[h] = vals[i] || "" })
    const mapped = {}; fields.forEach((f, i) => { if (f) mapped[f] = vals[i] || "" })
    return { raw, mapped }
  }).filter((r) => (r.mapped.full_name || "").trim() !== "")
  return { headers, fields, rows }
}

// แยกคำนำหน้าออกจากชื่อเต็ม → { title, name }
// ตรวจคำนำหน้ายอดนิยม (รองรับทั้งมีจุด/ไม่มีจุด/มีเว้นวรรค)
const TITLE_PREFIXES = [
  "เด็กชาย", "เด็กหญิง", "นางสาว", "นาง", "นาย",
  "ด.ช.", "ด.ญ.", "ด.ช", "ด.ญ", "น.ส.", "น.ส",
  "Master", "Mr.", "Mrs.", "Miss", "Ms.", "Mr", "Mrs", "Ms",
]
function splitTitle(fullName) {
  const s = (fullName || "").trim()
  if (!s) return { title: "", name: "" }
  for (const pre of TITLE_PREFIXES) {
    // ขึ้นต้นด้วยคำนำหน้า (ตามด้วยเว้นวรรค หรือ ตามด้วยตัวอักษรเลย เช่น "นายสมชาย")
    if (s.startsWith(pre)) {
      const rest = s.slice(pre.length).trim()
      // ถ้าตัดแล้วยังเหลือชื่อ → แยกได้
      if (rest) return { title: pre, name: rest }
    }
  }
  return { title: "", name: s }  // ไม่พบคำนำหน้า → คำนำหน้าว่าง ชื่อเต็มเดิม
}

export default function AdminImport() {
  const { event } = useOutletContext() || {}
  const { toast, confirm } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([])

  const [imported, setImported] = useState([])
  const [loadingImported, setLoadingImported] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (event?.id) fetchCoursesAdmin(event.id).then(setCourses).catch(() => {})
  }, [event?.id])

  async function loadImported(cid) {
    if (!cid) { setImported([]); return }
    setLoadingImported(true)
    try {
      const regs = await fetchCourseParticipants(cid)
      const list = []
      ;(regs || []).forEach((r) => {
        (r.participants || []).forEach((p) => {
          list.push({
            id: p.id, full_name: p.full_name, school: p.school || "", grade: p.grade_level || "",
            phone: p.phone || "", email: p.email || r.submitter_email || "",
            code: p.participant_code || "",
            checkedIn: (p.checkins?.length || 0) > 0,
          })
        })
      })
      list.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }))
      setImported(list)
    } catch (e) { toast("โหลดรายการไม่สำเร็จ: " + e.message, "error"); setImported([]) }
    finally { setLoadingImported(false) }
  }

  function onSelectCourse(cid) {
    setCourseId(cid); setResults([]); loadImported(cid)
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResults([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseCsv(ev.target.result)
        if (!parsed.fields.includes("full_name")) {
          toast("ไม่พบคอลัมน์ชื่อ — ต้องมีหัวคอลัมน์ 'ชื่อ-สกุล' หรือ 'full_name'", "error")
          setRows([]); setHeaders([]); return
        }
        setHeaders(parsed.headers); setRows(parsed.rows)
        if (parsed.rows.length === 0) toast("ไม่พบข้อมูลในไฟล์", "error")
      } catch (err) { toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error") }
    }
    reader.readAsText(file, "UTF-8")
    e.target.value = ""
  }

  async function doImport() {
    if (!courseId) return toast("เลือกคอร์สก่อน", "error")
    if (rows.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    setImporting(true); setProgress({ done: 0, total: rows.length })
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const { raw, mapped } = rows[i]
      try {
        const res = await importExternalParticipant(courseId, mapped)
        out.push({ raw, participant_code: res.participant_code })
      } catch (e) { out.push({ raw, participant_code: "", error: e.message }) }
      setProgress({ done: i + 1, total: rows.length }); setResults([...out])
    }
    setImporting(false)
    const ok = out.filter((r) => r.participant_code).length
    const fail = out.filter((r) => r.error).length
    toast(`เสร็จแล้ว: สำเร็จ ${ok}${fail ? ` · ผิดพลาด ${fail}` : ""}`, fail > 0 ? "error" : "success")
    loadImported(courseId)
  }

  // ดาวน์โหลด Section 2 (ผลการนำเข้า): คงข้อมูลเดิม + รหัส (คอลัมน์แรก) + แยกคำนำหน้า
  // หา header ที่เป็นช่องชื่อ → แทนที่ด้วย "คำนำหน้า" + "ชื่อ-สกุล"
  function exportResults() {
    // ตำแหน่ง header ที่ถูก map เป็น full_name (ช่องชื่อ)
    const nameIdx = headers.findIndex((h) => (HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h]) === "full_name")
    // header ใหม่: รหัส + (แทนช่องชื่อด้วย คำนำหน้า,ชื่อ-สกุล) + ที่เหลือเดิม
    const head = ["รหัสผู้สมัคร"]
    headers.forEach((h, i) => {
      if (i === nameIdx) head.push("คำนำหน้า", "ชื่อ-สกุล")
      else head.push(h)
    })
    const lines = [head.join(",")]
    results.forEach((r) => {
      const vals = [r.participant_code]
      headers.forEach((h, i) => {
        if (i === nameIdx) {
          const { title, name } = splitTitle(r.raw[h] || "")
          vals.push(title, name)
        } else vals.push(r.raw[h] || "")
      })
      lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "ผู้สมัคร_พร้อมรหัส.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // ดาวน์โหลด Section 3 (รายการที่นำเข้าแล้ว): แยกคำนำหน้าออกจากชื่อ
  function exportImported() {
    const head = ["รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "เช็คอิน"]
    const lines = [head.join(",")]
    imported.forEach((p) => {
      const { title, name } = splitTitle(p.full_name)
      const vals = [p.code, title, name, p.school, p.grade, p.phone, p.email, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"].map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `รายชื่อนำเข้า_${selectedCourse?.title || "course"}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function doDeleteOne(p) {
    const ok = await confirm({
      title: "ลบผู้สมัครคนนี้?",
      message: `ลบ "${p.full_name}" (${p.code}) ออกจากคอร์ส\nข้อมูลและการเช็คอินจะหายไป`,
      confirmText: "ลบ", tone: "danger",
    })
    if (!ok) return
    try {
      await deleteImportedParticipant(p.id)
      toast("ลบแล้ว", "success")
      loadImported(courseId)
    } catch (e) {
      toast(e.message?.includes("NOT_IMPORTED") ? "ลบได้เฉพาะผู้สมัครที่นำเข้า (ไม่ใช่คนสมัครปกติ)" : "ลบไม่สำเร็จ: " + e.message, "error")
    }
  }

  async function doDeleteAll() {
    const ok = await confirm({
      title: "ลบผู้สมัครที่นำเข้าทั้งหมด?",
      message: `ลบผู้สมัครที่นำเข้าทั้งหมด ${imported.length} คน ออกจากคอร์ส "${selectedCourse?.title}"\nข้อมูลและการเช็คอินจะหายไปทั้งหมด`,
      confirmText: "ลบทั้งหมด", tone: "danger",
    })
    if (!ok) return
    setDeleting(true)
    try {
      const n = await deleteImportedByCourse(courseId)
      toast(`ลบแล้ว ${n} คน`, "success")
      loadImported(courseId)
    } catch (e) { toast("ลบไม่สำเร็จ: " + e.message, "error") }
    finally { setDeleting(false) }
  }

  const selectedCourse = courses.find((c) => c.id === courseId)
  const prefix = selectedCourse?.base_id || "P"

  return (
    <div className="pb-24 md:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.upload className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">นำเข้าผู้สมัคร</h1>
          <p className="text-slate-400 text-xs mt-0.5">อัปโหลดรายชื่อจาก CSV → ระบบสร้างรหัสให้อัตโนมัติ พร้อมใช้เช็คอิน</p>
        </div>
      </div>

      {/* ═══════ SECTION: นำเข้า USER (โปรไฟล์ล่วงหน้า) ═══════ */}
      <UserImportSection />

      {/* ═══════ SECTION 1: ขั้นตอนการใช้งาน ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">1</span>
          <h2 className="text-sm font-bold text-slate-700">ขั้นตอนการใช้งาน</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: 1, ic: "book", title: "เลือกคอร์ส", desc: "เลือกคอร์สปลายทางที่จะนำผู้สมัครเข้า" },
            { n: 2, ic: "upload", title: "อัปโหลด CSV", desc: "ไฟล์รายชื่อ (ต้องมีคอลัมน์ชื่อ-สกุล)" },
            { n: 3, ic: "users", title: "นำเข้า", desc: "ระบบสร้างรหัสผู้สมัครให้อัตโนมัติ" },
            { n: 4, ic: "download", title: "ดาวน์โหลด", desc: "ได้ไฟล์เดิม + รหัส ไปแจกผู้สมัคร" },
          ].map((s, i) => (
            <div key={s.n} className="relative">
              <div className="flex flex-col items-center text-center gap-2 bg-slate-50/70 rounded-xl p-3.5 h-full border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F15A24] to-amber-500 text-white flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0">{s.n}</div>
                <div className="flex items-center gap-1.5 text-[#F15A24]">
                  {Ico[s.ic] && (() => { const I = Ico[s.ic]; return <I className="w-4 h-4" /> })()}
                  <span className="font-bold text-sm text-slate-700">{s.title}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
              {i < 3 && (
                <div className="hidden lg:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10 w-4 h-4 items-center justify-center text-slate-300">
                  <Ico.arrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 bg-orange-50/60 border border-orange-100 rounded-xl px-3.5 py-2.5">
          <Ico.alert className="w-4 h-4 text-[#F15A24] shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            ผู้สมัครที่นำเข้าจะ <b className="text-slate-700">ยืนยันแล้ว (เช็คอินได้ทันที)</b> และ <b className="text-slate-700">ไม่นับรวมที่นั่ง</b> ของระบบ · นำเข้าซ้ำได้ (กันข้อมูลซ้ำด้วยเลขบัตร/อีเมล)
          </p>
        </div>
      </section>

      {/* ═══════ SECTION 2: อัปข้อมูลเข้า ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">2</span>
          <h2 className="text-sm font-bold text-slate-700">อัปข้อมูลเข้า</h2>
        </div>

        {/* เลือกคอร์ส + ไฟล์ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">คอร์สปลายทาง</label>
            <select value={courseId} onChange={(e) => onSelectCourse(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none transition">
              <option value="">— เลือกคอร์ส —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (${c.base_id})` : ""}{c.is_open ? "" : " · ปิดรับ"}</option>
              ))}
            </select>
            {selectedCourse && (
              <p className="text-[11px] text-slate-400 mt-1.5">รหัสจะขึ้นต้นด้วย <span className="font-mono font-bold text-[#F15A24]">{prefix}-001</span>, {prefix}-002, …</p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">ไฟล์ CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
            {fileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {fileName} — พบ {rows.length} รายชื่อ</p>}
          </div>
        </div>

        {/* Preview — ทุกคอลัมน์ */}
        {rows.length > 0 && (
          <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">ตัวอย่างข้อมูล ({rows.length} คน)</span>
              <span className="text-[11px] text-slate-400">{headers.length} คอลัมน์</span>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">#</th>
                    {headers.map((h, i) => <th key={i} className="px-3 py-2.5">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{i + 1}</td>
                      {headers.map((h, j) => (
                        <td key={j} className={`px-3 py-2 text-xs ${j === 0 ? "font-medium text-slate-700" : "text-slate-500"}`}>{r.raw[h] || <span className="text-slate-300">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <p className="px-4 py-2 text-[11px] text-slate-400 text-center">…และอีก {rows.length - 50} คน</p>}
            </div>
          </div>
        )}

        {/* ปุ่มนำเข้า + progress */}
        {rows.length > 0 && (
          <div className="mt-4">
            {importing ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>กำลังนำเข้า…</span><span className="font-bold">{progress.done} / {progress.total}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#fb923c] to-[#F15A24] transition-all duration-200" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            ) : (
              <button onClick={doImport} disabled={!courseId}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#F15A24] text-white px-4 py-3 rounded-xl font-bold hover:bg-[#c44215] shadow-sm shadow-orange-500/20 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Ico.upload className="w-4 h-4" /> นำเข้า {rows.length} รายชื่อ
              </button>
            )}
          </div>
        )}

        {/* ผลการนำเข้า — ไม่มีสถานะ */}
        {results.length > 0 && !importing && (
          <div className="mt-4 border border-emerald-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">ผลการนำเข้า ({results.length})</span>
              <button onClick={exportResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">
                <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด (ไฟล์เดิม + รหัส)
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">รหัสผู้สมัคร</th>
                    {headers.map((h, i) => <th key={i} className="px-3 py-2.5">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{r.participant_code || <span className="text-rose-500 text-xs">ผิดพลาด</span>}</td>
                      {headers.map((h, j) => (
                        <td key={j} className={`px-3 py-2 text-xs ${j === 0 ? "font-medium text-slate-700" : "text-slate-500"}`}>{r.raw[h] || <span className="text-slate-300">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ═══════ SECTION 3: ข้อมูลที่อยากดู (+ ลบได้) ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">3</span>
            <h2 className="text-sm font-bold text-slate-700">ข้อมูลที่อยากดู</h2>
            {courseId && <span className="text-xs font-bold text-slate-400">({imported.length} คน)</span>}
          </div>
          {courseId && imported.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => loadImported(courseId)} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#F15A24] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition text-xs font-bold">
                <Ico.rotate className="w-3.5 h-3.5" /> รีเฟรช
              </button>
              <button onClick={exportImported} className="inline-flex items-center gap-1.5 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition">
                <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด
              </button>
              <button onClick={doDeleteAll} disabled={deleting} className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 transition disabled:opacity-50">
                <Ico.trash className="w-3.5 h-3.5" /> {deleting ? "กำลังลบ…" : "ลบทั้งหมด"}
              </button>
            </div>
          )}
        </div>

        {!courseId ? (
          <div className="py-12 text-center text-sm text-slate-400">เลือกคอร์สด้านบนเพื่อดูรายการที่นำเข้าแล้ว</div>
        ) : loadingImported ? (
          <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : imported.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีผู้สมัครที่นำเข้าในคอร์สนี้</div>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">รหัสผู้สมัคร</th>
                    <th className="px-3 py-2.5">ชื่อ-สกุล</th>
                    <th className="px-3 py-2.5">โรงเรียน</th>
                    <th className="px-3 py-2.5">ระดับชั้น</th>
                    <th className="px-3 py-2.5">เบอร์โทร</th>
                    <th className="px-3 py-2.5 text-center">เช็คอิน</th>
                    <th className="px-3 py-2.5 text-center">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {imported.map((p) => (
                    <tr key={p.id} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{p.code || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{p.full_name}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.school || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.grade || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{p.phone || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-center">
                        {p.checkedIn
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><Ico.check className="w-3 h-3" /> แล้ว</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => doDeleteOne(p)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition" aria-label={`ลบ ${p.full_name}`}>
                          <Ico.trash className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: นำเข้า user (โปรไฟล์ล่วงหน้า) — จาก CSV/Excel (Google Form)
// admin import → pending_profiles → user กด Google login ดึงมาผูก
// ═══════════════════════════════════════════════════════════════════

// map หัวคอลัมน์ (ไทย/อังกฤษ) → field ในระบบ
const USER_HEADER_MAP = {
  // จำเป็น
  "email": "email", "อีเมล": "email", "gmail": "email", "e-mail": "email",
  // section 1 ส่วนตัว
  "คำนำหน้า": "title", "title": "title",
  "ชื่อ": "first_name", "first_name": "first_name", "firstname": "first_name", "ชื่อจริง": "first_name",
  "นามสกุล": "last_name", "last_name": "last_name", "lastname": "last_name", "สกุล": "last_name",
  "ชื่อเล่น": "nickname", "nickname": "nickname",
  "อายุ": "age", "age": "age",
  "ระดับชั้น": "grade_level", "grade": "grade_level", "grade_level": "grade_level", "ชั้น": "grade_level",
  "โรงเรียน": "school", "school": "school",
  "เบอร์โทร": "phone", "phone": "phone", "เบอร์": "phone", "โทรศัพท์": "phone",
  "line": "line_id", "line_id": "line_id", "ไลน์": "line_id", "line id": "line_id",
  "เลขบัตร": "national_id", "national_id": "national_id", "บัตรประชาชน": "national_id", "เลขบัตรประชาชน": "national_id",
  "passport": "passport_no", "passport_no": "passport_no", "พาสปอร์ต": "passport_no",
  "สัญชาติ": "nationality", "nationality": "nationality",
  // section 2 ผู้ปกครอง
  "คำนำหน้าผู้ปกครอง": "parent_title", "parent_title": "parent_title",
  "ชื่อผู้ปกครอง": "parent_full_name", "parent_name": "parent_full_name", "parent_full_name": "parent_full_name",
  "ความสัมพันธ์": "parent_relationship", "parent_relationship": "parent_relationship",
  "เบอร์ผู้ปกครอง": "parent_phone", "parent_phone": "parent_phone",
  // section 3 ที่อยู่
  "ที่อยู่": "address", "address": "address",
  "ตำบล": "subdistrict", "subdistrict": "subdistrict", "แขวง": "subdistrict",
  "อำเภอ": "district", "district": "district", "เขต": "district",
  "จังหวัด": "province", "province": "province",
  "รหัสไปรษณีย์": "zipcode", "zipcode": "zipcode", "ไปรษณีย์": "zipcode",
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase()
}

function UserImportSection() {
  const { toast } = useDialog()
  const [rows, setRows] = useState([])       // แถวดิบจากไฟล์
  const [mapped, setMapped] = useState([])   // แปลงเป็น profile object แล้ว
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null) // {ok, fail, errors}

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null)
    try {
      const ext = file.name.split(".").pop().toLowerCase()
      if (ext !== "csv") {
        toast("รองรับเฉพาะไฟล์ .csv — ถ้าเป็น Excel ให้ Save As เป็น CSV ก่อน", "error"); return
      }
      // อ่าน CSV ด้วย parser ในไฟล์ (splitLine) — ไม่พึ่ง library
      const text = await file.text()
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "")
      if (lines.length < 2) { toast("ไฟล์ว่างหรือไม่มีข้อมูล", "error"); return }
      const headers = splitLine(lines[0])
      const parsedRows = lines.slice(1).map((line) => {
        const vals = splitLine(line)
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || "" })
        return obj
      })
      // แปลงหัวคอลัมน์ → field
      const out = parsedRows.map((r) => {
        const obj = {}
        for (const [k, v] of Object.entries(r)) {
          const field = USER_HEADER_MAP[normalizeHeader(k)]
          if (field) obj[field] = String(v ?? "").trim()
        }
        return obj
      }).filter((o) => o.email)  // ต้องมี email

      setRows(parsedRows)
      setMapped(out)
      if (out.length === 0) toast("ไม่พบข้อมูล หรือไม่มีคอลัมน์อีเมล", "error")
      else toast(`อ่านไฟล์สำเร็จ ${out.length} คน`, "success")
    } catch (err) {
      toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error")
    } finally { e.target.value = "" }
  }

  async function doImport() {
    if (mapped.length === 0) return toast("ยังไม่มีข้อมูล", "error")
    setImporting(true)
    let ok = 0, fail = 0
    const errors = []
    for (const p of mapped) {
      try { await importUserProfile(p); ok++ }
      catch (e) { fail++; errors.push(`${p.email}: ${e.message}`) }
    }
    setResult({ ok, fail, errors })
    setImporting(false)
    toast(`นำเข้าเสร็จ — สำเร็จ ${ok} คน${fail ? ` · ผิดพลาด ${fail}` : ""}`, fail ? "error" : "success")
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-violet-500 text-white flex items-center justify-center shrink-0"><Ico.users className="w-3.5 h-3.5" /></span>
        <div>
          <h2 className="text-sm font-bold text-slate-700">นำเข้าข้อมูล User (โปรไฟล์ล่วงหน้า)</h2>
          <p className="text-[11px] text-slate-400">อัปโหลดข้อมูลจาก Google Form (CSV) — user กด Google login ด้วยอีเมลนั้น จะได้โปรไฟล์อัตโนมัติ</p>
        </div>
      </div>

      {/* คำอธิบายคอลัมน์ */}
      <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3 mb-3 text-[11px] text-slate-600 leading-relaxed">
        <span className="font-bold text-violet-700">คอลัมน์ที่รองรับ:</span> ต้องมี <span className="font-bold">อีเมล/email</span> (จำเป็น) · ชื่อ · นามสกุล · ชื่อเล่น · อายุ · ระดับชั้น · โรงเรียน · เบอร์โทร · เลขบัตร · ที่อยู่ · ตำบล · อำเภอ · จังหวัด · รหัสไปรษณีย์ · ชื่อผู้ปกครอง · เบอร์ผู้ปกครอง ฯลฯ (หัวคอลัมน์ไทยหรืออังกฤษก็ได้)
      </div>

      {/* อัปโหลด */}
      <label className="cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-violet-400 hover:bg-violet-50/40 rounded-xl px-4 py-6 transition">
        <Ico.upload className="w-5 h-5 text-slate-400" />
        <span className="text-sm font-bold text-slate-600">{fileName || "คลิกเพื่ออัปโหลด CSV"}</span>
        <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
      </label>

      {/* preview + ปุ่ม import */}
      {mapped.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-2">พบ <span className="font-bold text-slate-700">{mapped.length}</span> คน (มีอีเมล) — ตัวอย่าง 3 คนแรก:</p>
          <div className="overflow-x-auto rounded-xl border border-slate-100 mb-3">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="px-2 py-1.5 text-left">อีเมล</th><th className="px-2 py-1.5 text-left">ชื่อ</th><th className="px-2 py-1.5 text-left">นามสกุล</th><th className="px-2 py-1.5 text-left">โรงเรียน</th></tr>
              </thead>
              <tbody>
                {mapped.slice(0, 3).map((p, i) => (
                  <tr key={i} className="border-t border-slate-50">
                    <td className="px-2 py-1.5 font-mono text-violet-600">{p.email}</td>
                    <td className="px-2 py-1.5">{p.first_name || "-"}</td>
                    <td className="px-2 py-1.5">{p.last_name || "-"}</td>
                    <td className="px-2 py-1.5">{p.school || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} disabled={importing}
            className="w-full bg-violet-500 hover:bg-violet-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
            <Ico.users className="w-4 h-4" /> {importing ? "กำลังนำเข้า…" : `นำเข้า ${mapped.length} คน`}
          </button>
        </div>
      )}

      {/* ผลลัพธ์ */}
      {result && (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${result.fail ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="font-bold text-slate-700">นำเข้าสำเร็จ {result.ok} คน{result.fail ? ` · ผิดพลาด ${result.fail} คน` : ""}</p>
          {result.errors?.length > 0 && (
            <ul className="mt-1.5 text-[11px] text-rose-600 space-y-0.5 max-h-32 overflow-y-auto">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}