import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, importExternalParticipant, fetchCourseParticipants,
  deleteImportedParticipant, deleteImportedByCourse, importUsersBatch,
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
const TITLE_PREFIXES = [
  "เด็กชาย", "เด็กหญิง", "นางสาว", "นาง", "นาย",
  "ด.ช.", "ด.ญ.", "ด.ช", "ด.ญ", "น.ส.", "น.ส",
  "Master", "Mr.", "Mrs.", "Miss", "Ms.", "Mr", "Mrs", "Ms",
]
function splitTitle(fullName) {
  const s = (fullName || "").trim()
  if (!s) return { title: "", name: "" }
  for (const pre of TITLE_PREFIXES) {
    if (s.startsWith(pre)) {
      const rest = s.slice(pre.length).trim()
      if (rest) return { title: pre, name: rest }
    }
  }
  return { title: "", name: s }
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
  const [mode, setMode] = useState("file")   // file | manual — โหมด section 2

  // กรอกเอง (manual) — รายชื่อที่พิมพ์เพิ่มทีละคน
  const [manualList, setManualList] = useState([])
  const [mForm, setMForm] = useState({ full_name: "", school: "", grade_level: "", phone: "", email: "", national_id: "" })

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
            id: p.id, reg_id: r.id, theme_name: r.theme_name || "",
            full_name: p.full_name, school: p.school || "", grade: p.grade_level || "",
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

  // เพิ่มคนเข้ารายการ manual
  function addManual() {
    const name = (mForm.full_name || "").trim()
    if (!name) return toast("กรอกชื่อ-สกุลก่อน", "error")
    setManualList((prev) => [...prev, { ...mForm, full_name: name }])
    setMForm({ full_name: "", school: "", grade_level: "", phone: "", email: "", national_id: "" })
  }
  function removeManual(idx) {
    setManualList((prev) => prev.filter((_, i) => i !== idx))
  }

  // นำเข้าจากไฟล์ (rows) หรือ manual (manualList) — รวม logic เดียว
  async function doImport() {
    if (!courseId) return toast("เลือกคอร์สก่อน", "error")
    const source = mode === "manual" ? manualList : rows.map((r) => r.mapped)
    const rawSource = mode === "manual" ? manualList : rows.map((r) => r.raw)
    if (source.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    setImporting(true); setProgress({ done: 0, total: source.length })
    const out = []
    for (let i = 0; i < source.length; i++) {
      const mapped = source[i]
      const raw = rawSource[i]
      try {
        const res = await importExternalParticipant(courseId, mapped)
        out.push({ raw, mapped, participant_code: res.participant_code })
      } catch (e) { out.push({ raw, mapped, participant_code: "", error: e.message }) }
      setProgress({ done: i + 1, total: source.length }); setResults([...out])
    }
    setImporting(false)
    const ok = out.filter((r) => r.participant_code).length
    const fail = out.filter((r) => r.error).length
    toast(`เสร็จแล้ว: สำเร็จ ${ok}${fail ? ` · ผิดพลาด ${fail}` : ""}`, fail > 0 ? "error" : "success")
    if (mode === "manual") setManualList([])
    loadImported(courseId)
  }

  // ดาวน์โหลดผลการนำเข้า (Section 2) — คงข้อมูลเดิม + รหัส + แยกคำนำหน้า
  function exportResults() {
    // โหมด manual ใช้ header คงที่ · โหมด file ใช้ header จากไฟล์
    if (mode === "manual") {
      const head = ["รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "เลขบัตรประชาชน"]
      const lines = [head.join(",")]
      results.forEach((r) => {
        const { title, name } = splitTitle(r.mapped.full_name || "")
        const vals = [r.participant_code, title, name, r.mapped.school || "", r.mapped.grade_level || "", r.mapped.phone || "", r.mapped.email || "", r.mapped.national_id || ""]
        lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      })
      downloadCsv(lines, "ผู้สมัคร_พร้อมรหัส.csv")
      return
    }
    const nameIdx = headers.findIndex((h) => (HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h]) === "full_name")
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
    downloadCsv(lines, "ผู้สมัคร_พร้อมรหัส.csv")
  }

  function downloadCsv(lines, filename) {
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Section 3 export — จัดกลุ่มธีม (วิชาทีม) หรือเรียบ (วิชาเดี่ยว) ──
  function exportImported() {
    const isTeam = selectedCourse?.count_mode === "team"
    if (isTeam) {
      // จัดกลุ่มตาม reg_id (ทีมเดียว = ธีมเดียว)
      const groups = []
      const byReg = new Map()
      for (const p of imported) {
        const key = p.reg_id || `solo:${p.id}`
        if (!byReg.has(key)) { const g = { theme: p.theme_name || "", members: [] }; byReg.set(key, g); groups.push(g) }
        byReg.get(key).members.push(p)
      }
      const head = ["จำนวนธีม", "ชื่อธีม", "ชื่อวิชา", "จำนวนคน", "รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "เช็คอิน"]
      const lines = [head.join(",")]
      groups.forEach((g, gi) => {
        g.members.forEach((p, mi) => {
          const { title, name } = splitTitle(p.full_name)
          const vals = [
            mi === 0 ? gi + 1 : "", mi === 0 ? g.theme : "", mi === 0 ? (selectedCourse?.title || "") : "",
            mi + 1, p.code, title, name, p.school, p.grade, p.phone, p.email, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่",
          ]
          lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        })
      })
      downloadCsv(lines, `รายชื่อนำเข้า_${selectedCourse?.title || "course"}.csv`)
    } else {
      // วิชาเดี่ยว — เรียบ
      const head = ["ลำดับ", "รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "เช็คอิน"]
      const lines = [head.join(",")]
      imported.forEach((p, i) => {
        const { title, name } = splitTitle(p.full_name)
        const vals = [i + 1, p.code, title, name, p.school, p.grade, p.phone, p.email, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"]
        lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      })
      downloadCsv(lines, `รายชื่อนำเข้า_${selectedCourse?.title || "course"}.csv`)
    }
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
  const manualCount = manualList.length
  const sourceCount = mode === "manual" ? manualCount : rows.length

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none transition"

  return (
    <div className="pb-24 md:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.upload className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">นำเข้าข้อมูล</h1>
          <p className="text-slate-400 text-xs mt-0.5">นำเข้า User + ผู้สมัครเข้าคอร์ส · อัปโหลดไฟล์ หรือกรอกเอง</p>
        </div>
      </div>

      {/* ═══════ SECTION 1: นำเข้า USER ═══════ */}
      <UserImportSection />

      {/* ═══════ SECTION 2: นำเข้าผู้สมัคร (เข้าคอร์ส + รหัสเช็คอิน) ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">2</span>
          <div>
            <h2 className="text-sm font-bold text-slate-700">นำเข้าผู้สมัคร (เข้าคอร์ส)</h2>
            <p className="text-[11px] text-slate-400">เพิ่มผู้สมัครเข้าคอร์ส + สร้างรหัสเช็คอินอัตโนมัติ · ใส่อีเมลตรงกับ account = ผู้สมัคร login เห็นเอง</p>
          </div>
        </div>

        {/* เลือกคอร์ส */}
        <div className="mt-4">
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

        {/* Tab สลับโหมด */}
        <div className="mt-4 flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
          <button onClick={() => setMode("file")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${mode === "file" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.upload className="w-3.5 h-3.5" /> อัปโหลดไฟล์</span>
          </button>
          <button onClick={() => setMode("manual")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${mode === "manual" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.pencil className="w-3.5 h-3.5" /> กรอกเอง</span>
          </button>
        </div>

        {/* ── โหมด: อัปโหลดไฟล์ ── */}
        {mode === "file" && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">ไฟล์ CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
            {fileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {fileName} — พบ {rows.length} รายชื่อ</p>}
            <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> คอลัมน์: ชื่อ-สกุล (จำเป็น) · โรงเรียน · ระดับชั้น · เบอร์โทร · อีเมล · เลขบัตรประชาชน · <b>ใส่อีเมลถ้าอยากให้ผู้สมัคร login เห็นเอง</b></p>

            {/* Preview ไฟล์ */}
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
          </div>
        )}

        {/* ── โหมด: กรอกเอง ── */}
        {mode === "manual" && (
          <div className="mt-4">
            {/* ฟอร์มกรอก */}
            <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="ชื่อ-สกุล * (เช่น นายสมชาย ใจดี)" value={mForm.full_name} onChange={(e) => setMForm({ ...mForm, full_name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual() } }} />
                <input className={inputCls} placeholder="โรงเรียน" value={mForm.school} onChange={(e) => setMForm({ ...mForm, school: e.target.value })} />
                <input className={inputCls} placeholder="ระดับชั้น (เช่น มัธยมศึกษาตอนปลาย ม.6)" value={mForm.grade_level} onChange={(e) => setMForm({ ...mForm, grade_level: e.target.value })} />
                <input className={inputCls} placeholder="เบอร์โทร" value={mForm.phone} onChange={(e) => setMForm({ ...mForm, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} />
                <input className={inputCls} type="email" placeholder="อีเมล (ใส่ถ้าอยากให้ login เห็นเอง)" value={mForm.email} onChange={(e) => setMForm({ ...mForm, email: e.target.value })} />
                <input className={inputCls} placeholder="เลขบัตรประชาชน 13 หลัก" value={mForm.national_id} onChange={(e) => setMForm({ ...mForm, national_id: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) })} />
              </div>
              <button onClick={addManual}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition text-sm">
                <Ico.plus className="w-4 h-4" /> เพิ่มคนนี้เข้ารายการ
              </button>
              <p className="text-[11px] text-slate-400 mt-2">💡 กด Enter ในช่องชื่อเพื่อเพิ่มเร็วๆ · ใส่อีเมลตรงกับ Gmail ที่ผู้สมัคร login = เขาเห็นวิชา + QR เอง</p>
            </div>

            {/* รายการที่กรอกไว้ */}
            {manualList.length > 0 && (
              <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">รายชื่อที่จะนำเข้า ({manualList.length} คน)</span>
                  <button onClick={() => setManualList([])} className="text-[11px] text-rose-500 font-bold hover:underline">ล้างทั้งหมด</button>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] text-slate-400 uppercase">
                        <th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">ชื่อ-สกุล</th><th className="px-3 py-2.5">โรงเรียน</th>
                        <th className="px-3 py-2.5">ระดับชั้น</th><th className="px-3 py-2.5">เบอร์</th><th className="px-3 py-2.5">อีเมล</th><th className="px-3 py-2.5 text-center">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {manualList.map((m, i) => (
                        <tr key={i} className="hover:bg-orange-50/40">
                          <td className="px-3 py-2 text-xs text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-700">{m.full_name}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{m.school || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{m.grade_level || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 font-mono">{m.phone || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 font-mono">{m.email || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => removeManual(i)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ปุ่มนำเข้า + progress (ใช้ร่วมกันทั้ง 2 โหมด) */}
        {sourceCount > 0 && (
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
                <Ico.upload className="w-4 h-4" /> นำเข้า {sourceCount} รายชื่อ
              </button>
            )}
          </div>
        )}

        {/* ผลการนำเข้า */}
        {results.length > 0 && !importing && (
          <div className="mt-4 border border-emerald-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">ผลการนำเข้า ({results.length})</span>
              <button onClick={exportResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">
                <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด (พร้อมรหัส)
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">รหัสผู้สมัคร</th>
                    <th className="px-3 py-2.5">ชื่อ-สกุล</th>
                    <th className="px-3 py-2.5">โรงเรียน</th>
                    <th className="px-3 py-2.5">อีเมล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{r.participant_code || <span className="text-rose-500 text-xs">ผิดพลาด</span>}</td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-700">{r.mapped?.full_name || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.mapped?.school || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{r.mapped?.email || <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ═══════ SECTION 3: ดูข้อมูลที่นำเข้า (+ ลบ + export) ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">3</span>
            <div>
              <h2 className="text-sm font-bold text-slate-700">ดูข้อมูลการนำเข้า</h2>
              <p className="text-[11px] text-slate-400">เลือกคอร์ส → ดูรายชื่อที่นำเข้า · ดาวน์โหลด · ลบได้</p>
            </div>
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

        {/* เลือกคอร์ส (แยกจาก section 2 — ดูคอร์สไหนก็ได้) */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">เลือกคอร์สที่จะดู</label>
          <select value={courseId} onChange={(e) => onSelectCourse(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none transition">
            <option value="">— เลือกคอร์ส —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (${c.base_id})` : ""}</option>
            ))}
          </select>
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
                    {selectedCourse?.count_mode === "team" && <th className="px-3 py-2.5">ธีม</th>}
                    <th className="px-3 py-2.5">ชื่อ-สกุล</th>
                    <th className="px-3 py-2.5">โรงเรียน</th>
                    <th className="px-3 py-2.5">ระดับชั้น</th>
                    <th className="px-3 py-2.5">เบอร์โทร</th>
                    <th className="px-3 py-2.5">อีเมล</th>
                    <th className="px-3 py-2.5 text-center">เช็คอิน</th>
                    <th className="px-3 py-2.5 text-center">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {imported.map((p) => (
                    <tr key={p.id} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{p.code || "—"}</td>
                      {selectedCourse?.count_mode === "team" && <td className="px-3 py-2 text-xs font-medium text-[#F15A24] max-w-[160px]"><span className="line-clamp-1">{p.theme_name || <span className="text-slate-300">—</span>}</span></td>}
                      <td className="px-3 py-2 font-medium text-slate-700">{p.full_name}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.school || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.grade || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{p.phone || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{p.email || <span className="text-slate-300">—</span>}</td>
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
// SECTION 1: นำเข้า user (โปรไฟล์ล่วงหน้า) — CSV หรือกรอกเอง
// admin import → pending_profiles → user กด Google login ดึงมาผูก
// ═══════════════════════════════════════════════════════════════════

const USER_HEADER_MAP = {
  "email": "email", "อีเมล": "email", "gmail": "email", "e-mail": "email",
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
  "คำนำหน้าผู้ปกครอง": "parent_title", "parent_title": "parent_title",
  "ชื่อผู้ปกครอง": "parent_full_name", "parent_name": "parent_full_name", "parent_full_name": "parent_full_name",
  "ความสัมพันธ์": "parent_relationship", "parent_relationship": "parent_relationship",
  "เบอร์ผู้ปกครอง": "parent_phone", "parent_phone": "parent_phone",
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
  const [rows, setRows] = useState([])
  const [mapped, setMapped] = useState([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [uMode, setUMode] = useState("file")  // file | manual
  const [uManual, setUManual] = useState([])  // รายชื่อกรอกเอง
  const [uForm, setUForm] = useState({ email: "", title: "", first_name: "", last_name: "", nickname: "", grade_level: "", school: "", phone: "", national_id: "" })

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null)
    try {
      const ext = file.name.split(".").pop().toLowerCase()
      if (ext !== "csv") {
        toast("รองรับเฉพาะไฟล์ .csv — ถ้าเป็น Excel ให้ Save As เป็น CSV ก่อน", "error"); return
      }
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
      const out = parsedRows.map((r) => {
        const obj = {}
        for (const [k, v] of Object.entries(r)) {
          const field = USER_HEADER_MAP[normalizeHeader(k)]
          if (field) obj[field] = String(v ?? "").trim()
        }
        return obj
      }).filter((o) => o.email)

      setRows(parsedRows)
      setMapped(out)
      if (out.length === 0) toast("ไม่พบข้อมูล หรือไม่มีคอลัมน์อีเมล", "error")
      else toast(`อ่านไฟล์สำเร็จ ${out.length} คน`, "success")
    } catch (err) {
      toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error")
    } finally { e.target.value = "" }
  }

  // เพิ่ม user เข้ารายการ manual
  function addUManual() {
    const email = (uForm.email || "").trim()
    if (!email) return toast("กรอกอีเมลก่อน (จำเป็น)", "error")
    setUManual((prev) => [...prev, { ...uForm, email }])
    setUForm({ email: "", title: "", first_name: "", last_name: "", nickname: "", grade_level: "", school: "", phone: "", national_id: "" })
  }
  function removeUManual(idx) {
    setUManual((prev) => prev.filter((_, i) => i !== idx))
  }

  async function doImport() {
    const source = uMode === "manual" ? uManual : mapped
    if (source.length === 0) return toast("ยังไม่มีข้อมูล", "error")
    setImporting(true)
    try {
      const res = await importUsersBatch(source)
      setResult(res)
      toast(`นำเข้าเสร็จ — สำเร็จ ${res.ok} คน${res.fail ? ` · ผิดพลาด ${res.fail}` : ""}`, res.fail ? "error" : "success")
      if (uMode === "manual") setUManual([])
    } catch (e) {
      toast("นำเข้าไม่สำเร็จ: " + e.message, "error")
    } finally { setImporting(false) }
  }

  const uInput = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none transition"
  const uCount = uMode === "manual" ? uManual.length : mapped.length

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-violet-500 text-white flex items-center justify-center text-xs font-extrabold shrink-0">1</span>
        <div>
          <h2 className="text-sm font-bold text-slate-700">นำเข้า User (โปรไฟล์ล่วงหน้า)</h2>
          <p className="text-[11px] text-slate-400">สร้าง account ล่วงหน้า — user กด Google login (อีเมลเดียวกัน) เข้าใช้ได้เลย โชว์ในจัดการนักเรียนทันที</p>
        </div>
      </div>

      {/* Tab สลับโหมด */}
      <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit mb-4">
        <button onClick={() => setUMode("file")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${uMode === "file" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <span className="inline-flex items-center gap-1.5"><Ico.upload className="w-3.5 h-3.5" /> อัปโหลดไฟล์</span>
        </button>
        <button onClick={() => setUMode("manual")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${uMode === "manual" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <span className="inline-flex items-center gap-1.5"><Ico.pencil className="w-3.5 h-3.5" /> กรอกเอง</span>
        </button>
      </div>

      {/* ── โหมด: อัปโหลดไฟล์ ── */}
      {uMode === "file" && (
        <>
          <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3 mb-3 text-[11px] text-slate-600 leading-relaxed">
            <span className="font-bold text-violet-700">คอลัมน์ที่รองรับ:</span> ต้องมี <span className="font-bold">อีเมล/email</span> (จำเป็น) · ชื่อ · นามสกุล · ชื่อเล่น · อายุ · ระดับชั้น · โรงเรียน · เบอร์โทร · เลขบัตร · ที่อยู่ · ตำบล · อำเภอ · จังหวัด · รหัสไปรษณีย์ · ชื่อผู้ปกครอง · เบอร์ผู้ปกครอง ฯลฯ (หัวคอลัมน์ไทยหรืออังกฤษก็ได้)
          </div>
          <label className="cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-violet-400 hover:bg-violet-50/40 rounded-xl px-4 py-6 transition">
            <Ico.upload className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-bold text-slate-600">{fileName || "คลิกเพื่ออัปโหลด CSV"}</span>
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>

          {mapped.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-2">พบ <span className="font-bold text-slate-700">{mapped.length}</span> คน (มีอีเมล) — ตัวอย่าง 3 คนแรก:</p>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
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
            </div>
          )}
        </>
      )}

      {/* ── โหมด: กรอกเอง ── */}
      {uMode === "manual" && (
        <div>
          <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={uInput} type="email" placeholder="อีเมล / Gmail * (จำเป็น)" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUManual() } }} />
              <input className={uInput} placeholder="คำนำหน้า (เช่น นาย/นางสาว)" value={uForm.title} onChange={(e) => setUForm({ ...uForm, title: e.target.value })} />
              <input className={uInput} placeholder="ชื่อจริง" value={uForm.first_name} onChange={(e) => setUForm({ ...uForm, first_name: e.target.value })} />
              <input className={uInput} placeholder="นามสกุล" value={uForm.last_name} onChange={(e) => setUForm({ ...uForm, last_name: e.target.value })} />
              <input className={uInput} placeholder="ชื่อเล่น" value={uForm.nickname} onChange={(e) => setUForm({ ...uForm, nickname: e.target.value })} />
              <input className={uInput} placeholder="ระดับชั้น (เช่น มัธยมศึกษาตอนปลาย ม.6)" value={uForm.grade_level} onChange={(e) => setUForm({ ...uForm, grade_level: e.target.value })} />
              <input className={uInput} placeholder="โรงเรียน" value={uForm.school} onChange={(e) => setUForm({ ...uForm, school: e.target.value })} />
              <input className={uInput} placeholder="เบอร์โทร" value={uForm.phone} onChange={(e) => setUForm({ ...uForm, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} />
              <input className={uInput + " sm:col-span-2"} placeholder="เลขบัตรประชาชน 13 หลัก" value={uForm.national_id} onChange={(e) => setUForm({ ...uForm, national_id: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) })} />
            </div>
            <button onClick={addUManual}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-violet-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-violet-600 transition text-sm">
              <Ico.plus className="w-4 h-4" /> เพิ่มคนนี้เข้ารายการ
            </button>
            <p className="text-[11px] text-slate-400 mt-2">💡 กด Enter ในช่องอีเมลเพื่อเพิ่มเร็วๆ · อีเมลจำเป็น (ใช้เป็น account)</p>
          </div>

          {uManual.length > 0 && (
            <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">รายชื่อที่จะนำเข้า ({uManual.length} คน)</span>
                <button onClick={() => setUManual([])} className="text-[11px] text-rose-500 font-bold hover:underline">ล้างทั้งหมด</button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-[10px] text-slate-400 uppercase">
                      <th className="px-3 py-2.5">อีเมล</th><th className="px-3 py-2.5">ชื่อ</th><th className="px-3 py-2.5">นามสกุล</th>
                      <th className="px-3 py-2.5">ระดับชั้น</th><th className="px-3 py-2.5">โรงเรียน</th><th className="px-3 py-2.5 text-center">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {uManual.map((m, i) => (
                      <tr key={i} className="hover:bg-violet-50/40">
                        <td className="px-3 py-2 text-xs font-mono text-violet-600">{m.email}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">{m.first_name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{m.last_name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{m.grade_level || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{m.school || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeUManual(i)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ปุ่ม import (ร่วม 2 โหมด) */}
      {uCount > 0 && (
        <button onClick={doImport} disabled={importing}
          className="w-full mt-4 bg-violet-500 hover:bg-violet-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
          <Ico.users className="w-4 h-4" /> {importing ? "กำลังนำเข้า…" : `นำเข้า ${uCount} คน`}
        </button>
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