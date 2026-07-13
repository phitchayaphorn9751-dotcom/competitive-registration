import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, importExternalParticipant, fetchCourseParticipants,
  deleteImportedParticipant, deleteImportedByCourse, importUsersBatch,
  fetchImportedUsers, deletePendingProfile, checkImportDuplicates,
  fetchAllSchools, searchSchools, matchCourseAndSession,
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
  "คอร์ส": "course", "วิชา": "course", "เวิร์คช็อป": "course", "เวิร์คชอป": "course", "course": "course", "workshop": "course",
  "รอบ": "round", "session": "round", "round": "round", "เวลา": "round",
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

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase()
}

// ── โรงเรียน autocomplete (ใช้ร่วมทุกฟอร์มกรอกเอง) ──
const normalizeSchool = (s) => (s || "").toLowerCase().replace(/โรงเรียน|ร\.ร\.|รร\./g, "").trim()

// ── ช่องกรอกโรงเรียน + autocomplete (ใช้ทั้ง section 1 และ 2) ──
function SchoolInput({ value, onChange, allSchools, className, placeholder }) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)

  async function onInput(val) {
    onChange(val)
    if (val.trim().length === 0) { setOptions([]); setOpen(false); return }
    const norm = normalizeSchool(val)
    let list = allSchools.filter((s) => normalizeSchool(s).includes(norm)).slice(0, 8)
    if (list.length === 0 && allSchools.length === 0) {
      try { list = await searchSchools(val) } catch { list = [] }
    }
    setOptions(list); setOpen(true)
  }
  function pick(name) { onChange(name); setOptions([]); setOpen(false) }

  return (
    <div className="relative">
      <input className={className} placeholder={placeholder} value={value}
        onChange={(e) => onInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && options.length > 0 && (
        <ul className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
          {options.map((s, si) => (
            <li key={si} onClick={() => pick(s)} className="px-4 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 text-slate-700">{s}</li>
          ))}
        </ul>
      )}
    </div>
  )
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
  const [mode, setMode] = useState("file")          // file | manual | auto — โหมดกรอก section 2
  const [seatMode, setSeatMode] = useState("reserve")  // reserve=กันที่นั่ง · extra=เพิ่มที่นั่ง
  const [sessionId, setSessionId] = useState("")       // รอบที่เลือก (คอร์สที่มีหลายรอบ)
  const [allSchools, setAllSchools] = useState([])

  // auto-import (โหมดอัตโนมัติ — อ่านคอลัมน์คอร์ส+รอบ)
  const [autoRows, setAutoRows] = useState([])       // แถวดิบจากไฟล์ auto
  const [autoHeaders, setAutoHeaders] = useState([])
  const [autoFileName, setAutoFileName] = useState("")
  const [autoResults, setAutoResults] = useState(null)  // { success:[...], errors:[...], summary:{} }

  // กรอกเอง (manual) section 2
  const [manualList, setManualList] = useState([])
  const [mForm, setMForm] = useState({ full_name: "", school: "", grade_level: "", phone: "", email: "", national_id: "" })

  // Section 3
  const [tab3, setTab3] = useState("course")        // course | user
  const [view3CourseId, setView3CourseId] = useState("")
  const [imported, setImported] = useState([])
  const [loadingImported, setLoadingImported] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [importedUsers, setImportedUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (event?.id) fetchCoursesAdmin(event.id).then(setCourses).catch(() => {})
    fetchAllSchools().then(setAllSchools).catch(() => {})
  }, [event?.id])

  // ── Section 3: โหลดผู้สมัคร import ในคอร์ส (เฉพาะ is_imported) ──
  async function loadImported(cid) {
    if (!cid) { setImported([]); return }
    setLoadingImported(true)
    try {
      const regs = await fetchCourseParticipants(cid)
      const list = []
      ;(regs || []).forEach((r) => {
        // เฉพาะคน import — is_imported จาก RPC/select (ถ้า field ไม่มี ให้ fallback ดู seats_held ไม่ได้แล้ว ใช้ is_imported)
        if (!r.is_imported) return
        (r.participants || []).forEach((p) => {
          list.push({
            id: p.id, reg_id: r.id, theme_name: r.theme_name || "",
            full_name: p.full_name, school: p.school || "", grade: p.grade_level || "",
            phone: p.phone || "", email: p.email || r.submitter_email || "",
            code: p.participant_code || "", status: r.status,
            seatMode: r.import_seat_mode || "",
            checkedIn: (p.checkins?.length || 0) > 0,
          })
        })
      })
      list.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }))
      setImported(list)
    } catch (e) { toast("โหลดรายการไม่สำเร็จ: " + e.message, "error"); setImported([]) }
    finally { setLoadingImported(false) }
  }

  // ── Section 3: โหลด import user (pending_profiles ทั้งหมด) ──
  async function loadImportedUsers() {
    setLoadingUsers(true)
    try {
      const list = await fetchImportedUsers()
      setImportedUsers(list || [])
    } catch (e) { toast("โหลด user ไม่สำเร็จ: " + e.message, "error"); setImportedUsers([]) }
    finally { setLoadingUsers(false) }
  }

  // เปลี่ยนแท็บ section 3 → โหลดข้อมูล
  useEffect(() => {
    if (tab3 === "user") loadImportedUsers()
  }, [tab3])

  function onSelectCourse(cid) {
    setCourseId(cid); setResults([]); setSessionId("")
  }
  function onView3Course(cid) {
    setView3CourseId(cid); loadImported(cid)
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

  // เพิ่มคน manual — มี validation
  function addManual() {
    const name = (mForm.full_name || "").trim()
    if (!name) return toast("กรอกชื่อ-สกุลก่อน", "error")
    const phone = (mForm.phone || "").trim()
    if (phone && (phone.length !== 10 || !phone.startsWith("0"))) return toast("เบอร์โทรต้อง 10 หลักขึ้นต้น 0 (หรือเว้นว่าง)", "error")
    const nid = (mForm.national_id || "").trim()
    if (nid && nid.length !== 13) return toast("เลขบัตรต้อง 13 หลัก (หรือเว้นว่าง)", "error")
    const em = (mForm.email || "").trim()
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast("อีเมลไม่ถูกต้อง (หรือเว้นว่าง)", "error")
    setManualList((prev) => [...prev, { ...mForm, full_name: name }])
    setMForm({ full_name: "", school: "", grade_level: "", phone: "", email: "", national_id: "" })
  }
  function removeManual(idx) {
    setManualList((prev) => prev.filter((_, i) => i !== idx))
  }

  // นำเข้า (ไฟล์ หรือ manual) — ส่ง seatMode
  async function doImport() {
    if (!courseId) return toast("เลือกคอร์สก่อน", "error")
    // คอร์สมีหลายรอบ แต่ยังไม่เลือกรอบ → เตือน
    if (courseSessions.length > 0 && !sessionId) return toast("คอร์สนี้มีหลายรอบ — เลือกรอบก่อน", "error")
    const source = mode === "manual" ? manualList : rows.map((r) => r.mapped)
    const rawSource = mode === "manual" ? manualList : rows.map((r) => r.raw)
    if (source.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    setImporting(true); setProgress({ done: 0, total: source.length })
    const out = []
    for (let i = 0; i < source.length; i++) {
      const mapped = source[i]
      const raw = rawSource[i]
      try {
        const res = await importExternalParticipant(courseId, mapped, seatMode, sessionId || null)
        out.push({ raw, mapped, participant_code: res.participant_code, status: res.status })
      } catch (e) { out.push({ raw, mapped, participant_code: "", error: e.message }) }
      setProgress({ done: i + 1, total: source.length }); setResults([...out])
    }
    setImporting(false)
    const ok = out.filter((r) => r.participant_code).length
    const fail = out.filter((r) => r.error).length
    const wait = out.filter((r) => r.status === "waitlist").length
    toast(`เสร็จ: สำเร็จ ${ok}${wait ? ` (คิวสำรอง ${wait})` : ""}${fail ? ` · ผิดพลาด ${fail}` : ""}`, fail > 0 ? "error" : "success")
    if (mode === "manual") setManualList([])
    // ถ้า section 3 กำลังดูคอร์สนี้ → รีเฟรช
    if (view3CourseId === courseId) loadImported(courseId)
  }

  // ── โหมด AUTO: อ่านไฟล์ (ต้องมีคอลัมน์ คอร์ส + รอบ) ──
  function onAutoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAutoFileName(file.name); setAutoResults(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseCsv(ev.target.result)
        if (!parsed.fields.includes("full_name")) {
          toast("ไม่พบคอลัมน์ชื่อ (ชื่อ-สกุล)", "error"); setAutoRows([]); setAutoHeaders([]); return
        }
        if (!parsed.fields.includes("course")) {
          toast("ไม่พบคอลัมน์คอร์ส — โหมดอัตโนมัติต้องมีคอลัมน์ 'คอร์ส'", "error"); setAutoRows([]); setAutoHeaders([]); return
        }
        setAutoHeaders(parsed.headers); setAutoRows(parsed.rows)
        if (parsed.rows.length === 0) toast("ไม่พบข้อมูลในไฟล์", "error")
      } catch (err) { toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error") }
    }
    reader.readAsText(file, "UTF-8")
    e.target.value = ""
  }

  // ── โหมด AUTO: import (map คอร์ส+รอบ จากไฟล์ → เรียก RPC ต่อแถว) ──
  async function doAutoImport() {
    if (autoRows.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    setImporting(true); setProgress({ done: 0, total: autoRows.length })
    const success = []
    const errors = []
    for (let i = 0; i < autoRows.length; i++) {
      const { mapped } = autoRows[i]
      const name = mapped.full_name || `แถว ${i + 1}`
      // map ชื่อคอร์ส + รอบ → id
      const m = matchCourseAndSession(courses, mapped.course, mapped.round)
      if (m.error) {
        errors.push({ row: i + 1, name, reason: m.error })
        setProgress({ done: i + 1, total: autoRows.length }); continue
      }
      try {
        const res = await importExternalParticipant(m.courseId, mapped, seatMode, m.sessionId)
        success.push({
          row: i + 1, name, code: res.participant_code,
          course: m.courseTitle, session: m.sessionLabel || "", status: res.status,
        })
      } catch (e) {
        errors.push({ row: i + 1, name, reason: e.message })
      }
      setProgress({ done: i + 1, total: autoRows.length })
    }
    setImporting(false)

    // สรุปแยกตามคอร์ส+รอบ
    const summary = {}
    success.forEach((s) => {
      const key = s.session ? `${s.course} — ${s.session}` : s.course
      summary[key] = (summary[key] || 0) + 1
    })
    setAutoResults({ success, errors, summary })
    toast(`เสร็จ: สำเร็จ ${success.length}${errors.length ? ` · ผิดพลาด ${errors.length}` : ""}`, errors.length ? "error" : "success")
    // รีเฟรช section 3 ถ้าดูคอร์สที่เพิ่ง import
    if (view3CourseId) loadImported(view3CourseId)
  }

  // export ผล auto (พร้อมรหัส)
  function exportAutoResults() {
    if (!autoResults) return
    const head = ["รหัสผู้สมัคร", "ชื่อ-สกุล", "คอร์ส", "รอบ", "สถานะ"]
    const lines = [head.join(",")]
    autoResults.success.forEach((s) => {
      const vals = [s.code, s.name, s.course, s.session, s.status === "waitlist" ? "คิวสำรอง" : "สำเร็จ"]
      lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    })
    downloadCsv(lines, "ผลนำเข้าอัตโนมัติ_พร้อมรหัส.csv")
  }

  function downloadCsv(lines, filename) {
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // export ผลนำเข้า (section 2)
  function exportResults() {
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
    headers.forEach((h, i) => { if (i === nameIdx) head.push("คำนำหน้า", "ชื่อ-สกุล"); else head.push(h) })
    const lines = [head.join(",")]
    results.forEach((r) => {
      const vals = [r.participant_code]
      headers.forEach((h, i) => {
        if (i === nameIdx) { const { title, name } = splitTitle(r.raw[h] || ""); vals.push(title, name) }
        else vals.push(r.raw[h] || "")
      })
      lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    })
    downloadCsv(lines, "ผู้สมัคร_พร้อมรหัส.csv")
  }

  // export section 3 course — จัดกลุ่มธีม
  function exportImported() {
    const isTeam = view3Course?.count_mode === "team"
    if (isTeam) {
      const groups = []; const byReg = new Map()
      for (const p of imported) {
        const key = p.reg_id || `solo:${p.id}`
        if (!byReg.has(key)) { const g = { theme: p.theme_name || "", members: [] }; byReg.set(key, g); groups.push(g) }
        byReg.get(key).members.push(p)
      }
      const head = ["จำนวนธีม", "ชื่อธีม", "ชื่อวิชา", "จำนวนคน", "รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "โหมด", "สถานะ", "เช็คอิน"]
      const lines = [head.join(",")]
      groups.forEach((g, gi) => {
        g.members.forEach((p, mi) => {
          const { title, name } = splitTitle(p.full_name)
          const vals = [mi === 0 ? gi + 1 : "", mi === 0 ? g.theme : "", mi === 0 ? (view3Course?.title || "") : "",
            mi + 1, p.code, title, name, p.school, p.grade, p.phone, p.email,
            p.seatMode === "extra" ? "เพิ่มที่นั่ง" : "กันที่นั่ง", p.status, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"]
          lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        })
      })
      downloadCsv(lines, `นำเข้า_${view3Course?.title || "course"}.csv`)
    } else {
      const head = ["ลำดับ", "รหัสผู้สมัคร", "คำนำหน้า", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "โหมด", "สถานะ", "เช็คอิน"]
      const lines = [head.join(",")]
      imported.forEach((p, i) => {
        const { title, name } = splitTitle(p.full_name)
        const vals = [i + 1, p.code, title, name, p.school, p.grade, p.phone, p.email,
          p.seatMode === "extra" ? "เพิ่มที่นั่ง" : "กันที่นั่ง", p.status, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"]
        lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      })
      downloadCsv(lines, `นำเข้า_${view3Course?.title || "course"}.csv`)
    }
  }

  // export section 3 user
  function exportUsers() {
    const head = ["อีเมล", "สถานะ", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อเล่น", "ระดับชั้น", "โรงเรียน", "เบอร์โทร"]
    const lines = [head.join(",")]
    importedUsers.forEach((u) => {
      const vals = [u.email, u.claimed ? "เข้าระบบแล้ว" : "ยังไม่เข้า", u.title || "", u.first_name || "", u.last_name || "", u.nickname || "", u.grade_level || "", u.school || "", u.phone || ""]
      lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    })
    downloadCsv(lines, "นำเข้า_user.csv")
  }

  async function doDeleteOne(p) {
    const ok = await confirm({ title: "ลบผู้สมัครคนนี้?", message: `ลบ "${p.full_name}" (${p.code}) ออกจากคอร์ส\nข้อมูลและการเช็คอินจะหายไป`, confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await deleteImportedParticipant(p.id); toast("ลบแล้ว", "success"); loadImported(view3CourseId) }
    catch (e) { toast(e.message?.includes("NOT_IMPORTED") ? "ลบได้เฉพาะผู้สมัครที่นำเข้า" : "ลบไม่สำเร็จ: " + e.message, "error") }
  }
  async function doDeleteAll() {
    const ok = await confirm({ title: "ลบผู้สมัครที่นำเข้าทั้งหมด?", message: `ลบทั้งหมด ${imported.length} คน ออกจาก "${view3Course?.title}"\nข้อมูลและเช็คอินจะหายทั้งหมด`, confirmText: "ลบทั้งหมด", tone: "danger" })
    if (!ok) return
    setDeleting(true)
    try { const n = await deleteImportedByCourse(view3CourseId); toast(`ลบแล้ว ${n} คน`, "success"); loadImported(view3CourseId) }
    catch (e) { toast("ลบไม่สำเร็จ: " + e.message, "error") }
    finally { setDeleting(false) }
  }
  async function doDeleteUser(u) {
    const ok = await confirm({ title: "ลบ user นี้?", message: `ลบ "${u.email}" ออกจากรายการนำเข้า${u.claimed ? "\n(คนนี้เข้าระบบแล้ว — profile จริงยังอยู่ ไม่ถูกลบ)" : ""}`, confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await deletePendingProfile(u.email); toast("ลบแล้ว", "success"); loadImportedUsers() }
    catch (e) { toast("ลบไม่สำเร็จ: " + e.message, "error") }
  }

  const selectedCourse = courses.find((c) => c.id === courseId)
  const view3Course = courses.find((c) => c.id === view3CourseId)
  const prefix = selectedCourse?.base_id || "P"
  const sourceCount = mode === "manual" ? manualList.length : rows.length
  const courseSessions = Array.isArray(selectedCourse?.sessions) ? selectedCourse.sessions : []
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
      <UserImportSection allSchools={allSchools} />

      {/* ═══════ SECTION 2: นำเข้าผู้สมัคร (เข้าคอร์ส) ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">2</span>
          <div>
            <h2 className="text-sm font-bold text-slate-700">นำเข้าผู้สมัคร (เข้าคอร์ส)</h2>
            <p className="text-[11px] text-slate-400">เพิ่มผู้สมัครเข้าคอร์ส + สร้างรหัสเช็คอิน · ใส่อีเมลตรง account = ผู้สมัคร login เห็นเอง</p>
          </div>
        </div>

        {/* เลือกคอร์ส (ซ่อนในโหมด auto — อ่านจากไฟล์) */}
        {mode !== "auto" && (
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
        )}

        {/* เลือกโหมดที่นั่ง */}
        <div className="mt-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">โหมดที่นั่ง</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSeatMode("reserve")}
              className={`p-3 rounded-xl border-2 text-left transition ${seatMode === "reserve" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.users className="w-4 h-4 text-[#F15A24]" /> กันที่นั่ง</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">กินโควตาปกติ · เต็ม → เข้าคิวสำรอง</div>
            </button>
            <button type="button" onClick={() => setSeatMode("extra")}
              className={`p-3 rounded-xl border-2 text-left transition ${seatMode === "extra" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.plus className="w-4 h-4 text-emerald-500" /> เพิ่มที่นั่ง</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">ขยายที่รับ +1/คน · ไม่แย่งคนสมัครเอง</div>
            </button>
          </div>
        </div>

        {/* เลือกรอบ (เฉพาะคอร์สที่มีหลายรอบ · ไม่ใช่โหมด auto) */}
        {mode !== "auto" && courseSessions.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              เลือกรอบ <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {courseSessions.map((s) => {
                const full = s.capacity && s.taken >= s.capacity
                return (
                  <button key={s.id} type="button" onClick={() => setSessionId(s.id)}
                    className={`p-3 rounded-xl border-2 text-left transition ${sessionId === s.id ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <Ico.clock className="w-4 h-4 text-[#F15A24]" /> {s.label || s.time}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {s.time}
                      {s.capacity ? <span className={full ? "text-rose-500 font-bold ml-1" : "text-slate-400 ml-1"}> · {s.taken || 0}/{s.capacity}{full ? " (เต็ม)" : ""}</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">คอร์สนี้มีหลายรอบ — ต้องเลือกรอบก่อนนำเข้า</p>
          </div>
        )}

        {/* Tab สลับโหมดกรอก */}
        <div className="mt-4 flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
          <button onClick={() => setMode("file")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${mode === "file" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.upload className="w-3.5 h-3.5" /> อัปโหลดไฟล์</span>
          </button>
          <button onClick={() => setMode("manual")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${mode === "manual" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.pencil className="w-3.5 h-3.5" /> กรอกเอง</span>
          </button>
          <button onClick={() => setMode("auto")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${mode === "auto" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.folder className="w-3.5 h-3.5" /> อัตโนมัติ (หลายคอร์ส)</span>
          </button>
        </div>

        {/* โหมดไฟล์ */}
        {mode === "file" && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">ไฟล์ CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
            {fileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {fileName} — พบ {rows.length} รายชื่อ</p>}
            <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> คอลัมน์: ชื่อ-สกุล (จำเป็น) · โรงเรียน · ระดับชั้น · เบอร์โทร · อีเมล · เลขบัตร · <b>ใส่อีเมลถ้าอยากให้ผู้สมัคร login เห็นเอง</b></p>

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

        {/* โหมดกรอกเอง */}
        {mode === "manual" && (
          <div className="mt-4">
            <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="ชื่อ-สกุล * (เช่น นายสมชาย ใจดี)" value={mForm.full_name} onChange={(e) => setMForm({ ...mForm, full_name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual() } }} />
                <SchoolInput className={inputCls} placeholder="โรงเรียน (พิมพ์เพื่อค้นหา)" value={mForm.school} onChange={(v) => setMForm((f) => ({ ...f, school: v }))} allSchools={allSchools} />
                <input className={inputCls} placeholder="ระดับชั้น (เช่น มัธยมศึกษาตอนปลาย ม.6)" value={mForm.grade_level} onChange={(e) => setMForm({ ...mForm, grade_level: e.target.value })} />
                <input className={inputCls} placeholder="เบอร์โทร (10 หลัก)" value={mForm.phone} onChange={(e) => setMForm({ ...mForm, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} />
                <input className={inputCls} type="email" placeholder="อีเมล (ใส่ถ้าอยากให้ login เห็นเอง)" value={mForm.email} onChange={(e) => setMForm({ ...mForm, email: e.target.value })} />
                <input className={inputCls} placeholder="เลขบัตรประชาชน 13 หลัก" value={mForm.national_id} onChange={(e) => setMForm({ ...mForm, national_id: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) })} />
              </div>
              <button onClick={addManual} className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition text-sm">
                <Ico.plus className="w-4 h-4" /> เพิ่มคนนี้เข้ารายการ
              </button>
              <p className="text-[11px] text-slate-400 mt-2">💡 กด Enter ในช่องชื่อเพื่อเพิ่มเร็ว · เบอร์ 10 หลัก / เลขบัตร 13 หลัก (ถ้ากรอก) · ใส่อีเมลตรง Gmail = login เห็นเอง</p>
            </div>

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

        {/* โหมดอัตโนมัติ */}
        {mode === "auto" && (
          <div className="mt-4">
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 mb-3 text-[11px] text-slate-600 leading-relaxed">
              <span className="font-bold text-amber-700">โหมดอัตโนมัติ:</span> ไฟล์ต้องมีคอลัมน์ <b>คอร์ส</b> (ชื่อเต็มหรือรหัส เช่น RM) + <b>รอบ</b> (รอบเช้า/รอบบ่าย — เฉพาะคอร์สหลายรอบ) · ระบบแยกเข้าคอร์สให้อัตโนมัติ · <b>1 ไฟล์ = 1 โรงเรียน</b> ใช้โหมดที่นั่งเดียวกันทั้งไฟล์
            </div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">ไฟล์ CSV (มีคอลัมน์คอร์ส+รอบ)</label>
            <input type="file" accept=".csv,text/csv" onChange={onAutoFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
            {autoFileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {autoFileName} — พบ {autoRows.length} รายชื่อ</p>}

            {/* preview auto */}
            {autoRows.length > 0 && (
              <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-600">ตัวอย่าง ({autoRows.length} คน)</span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] text-slate-400 uppercase">
                        <th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">ชื่อ-สกุล</th>
                        <th className="px-3 py-2.5">คอร์ส</th><th className="px-3 py-2.5">รอบ</th><th className="px-3 py-2.5">โรงเรียน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {autoRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="hover:bg-orange-50/40">
                          <td className="px-3 py-2 text-xs text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-700">{r.mapped.full_name}</td>
                          <td className="px-3 py-2 text-xs text-[#F15A24] font-medium">{r.mapped.course || <span className="text-rose-400">ไม่ระบุ</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{r.mapped.round || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{r.mapped.school || <span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ปุ่ม + progress auto */}
            {autoRows.length > 0 && (
              <div className="mt-4">
                {importing ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500"><span>กำลังนำเข้า…</span><span className="font-bold">{progress.done} / {progress.total}</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#fb923c] to-[#F15A24] transition-all duration-200" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                  </div>
                ) : (
                  <button onClick={doAutoImport}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#F15A24] text-white px-4 py-3 rounded-xl font-bold hover:bg-[#c44215] shadow-sm shadow-orange-500/20 transition text-sm">
                    <Ico.folder className="w-4 h-4" /> นำเข้าอัตโนมัติ {autoRows.length} คน ({seatMode === "extra" ? "เพิ่มที่นั่ง" : "กันที่นั่ง"})
                  </button>
                )}
              </div>
            )}

            {/* สรุปผล auto */}
            {autoResults && !importing && (
              <div className="mt-4 space-y-3">
                {/* สรุปแยกคอร์ส */}
                <div className="border border-emerald-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">สำเร็จ {autoResults.success.length} คน</span>
                    {autoResults.success.length > 0 && (
                      <button onClick={exportAutoResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition"><Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด (พร้อมรหัส)</button>
                    )}
                  </div>
                  <div className="p-3">
                    {Object.entries(autoResults.summary).map(([k, n]) => (
                      <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                        <span className="text-slate-600">{k}</span>
                        <span className="font-bold text-[#F15A24]">{n} คน</span>
                      </div>
                    ))}
                    {Object.keys(autoResults.summary).length === 0 && <p className="text-xs text-slate-400 text-center py-2">ไม่มีรายการสำเร็จ</p>}
                  </div>
                </div>

                {/* รายการผิดพลาด */}
                {autoResults.errors.length > 0 && (
                  <div className="border border-rose-100 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-rose-100 bg-rose-50/40">
                      <span className="text-xs font-bold text-rose-600">⚠️ ผิดพลาด {autoResults.errors.length} คน — ต้องแก้ไฟล์แล้ว import ใหม่</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-2">
                      {autoResults.errors.map((e, i) => (
                        <div key={i} className="text-xs px-2 py-1.5 border-b border-rose-50 last:border-0">
                          <span className="font-bold text-slate-700">แถว {e.row} ({e.name}):</span> <span className="text-rose-600">{e.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ปุ่มนำเข้า + progress */}
        {mode !== "auto" && sourceCount > 0 && (
          <div className="mt-4">
            {importing ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500"><span>กำลังนำเข้า…</span><span className="font-bold">{progress.done} / {progress.total}</span></div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#fb923c] to-[#F15A24] transition-all duration-200" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
              </div>
            ) : (
              <button onClick={doImport} disabled={!courseId}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#F15A24] text-white px-4 py-3 rounded-xl font-bold hover:bg-[#c44215] shadow-sm shadow-orange-500/20 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Ico.upload className="w-4 h-4" /> นำเข้า {sourceCount} รายชื่อ ({seatMode === "extra" ? "เพิ่มที่นั่ง" : "กันที่นั่ง"})
              </button>
            )}
          </div>
        )}

        {/* ผลนำเข้า */}
        {mode !== "auto" && results.length > 0 && !importing && (
          <div className="mt-4 border border-emerald-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">ผลการนำเข้า ({results.length})</span>
              <button onClick={exportResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition"><Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด (พร้อมรหัส)</button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">รหัส</th><th className="px-3 py-2.5">ชื่อ-สกุล</th><th className="px-3 py-2.5">โรงเรียน</th><th className="px-3 py-2.5">อีเมล</th><th className="px-3 py-2.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{r.participant_code || <span className="text-rose-500 text-xs">ผิดพลาด</span>}</td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-700">{r.mapped?.full_name || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.mapped?.school || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{r.mapped?.email || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs">{r.status === "waitlist" ? <span className="text-violet-600 font-bold">คิวสำรอง</span> : r.error ? <span className="text-rose-500">ผิดพลาด</span> : <span className="text-emerald-600">สำเร็จ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ═══════ SECTION 3: ดูข้อมูลนำเข้า (2 แท็บ) ═══════ */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-lg bg-[#F15A24] text-white flex items-center justify-center text-xs font-extrabold shrink-0">3</span>
          <div>
            <h2 className="text-sm font-bold text-slate-700">ดูข้อมูลการนำเข้า</h2>
            <p className="text-[11px] text-slate-400">รายชื่อที่นำเข้าเท่านั้น (ไม่รวมคนสมัครเอง)</p>
          </div>
        </div>

        {/* แท็บ course / user */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit mb-4">
          <button onClick={() => setTab3("course")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${tab3 === "course" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.book className="w-3.5 h-3.5" /> ผู้สมัคร (คอร์ส)</span>
          </button>
          <button onClick={() => setTab3("user")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${tab3 === "user" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5"><Ico.users className="w-3.5 h-3.5" /> User</span>
          </button>
        </div>

        {/* ── แท็บ COURSE ── */}
        {tab3 === "course" && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <select value={view3CourseId} onChange={(e) => onView3Course(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition">
                  <option value="">— เลือกคอร์สที่จะดู —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (${c.base_id})` : ""}</option>)}
                </select>
              </div>
              {view3CourseId && imported.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => loadImported(view3CourseId)} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#F15A24] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition text-xs font-bold"><Ico.rotate className="w-3.5 h-3.5" /> รีเฟรช</button>
                  <button onClick={exportImported} className="inline-flex items-center gap-1.5 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition"><Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด</button>
                  <button onClick={doDeleteAll} disabled={deleting} className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 transition disabled:opacity-50"><Ico.trash className="w-3.5 h-3.5" /> {deleting ? "กำลังลบ…" : "ลบทั้งหมด"}</button>
                </div>
              )}
            </div>
            {view3CourseId && <p className="text-xs text-slate-400 mb-2">{imported.length} คน (เฉพาะที่นำเข้า)</p>}

            {!view3CourseId ? (
              <div className="py-12 text-center text-sm text-slate-400">เลือกคอร์สเพื่อดูรายชื่อที่นำเข้า</div>
            ) : loadingImported ? (
              <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด…</div>
            ) : imported.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">คอร์สนี้ยังไม่มีผู้สมัครที่นำเข้า</div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] text-slate-400 uppercase">
                        <th className="px-3 py-2.5">รหัส</th>
                        {view3Course?.count_mode === "team" && <th className="px-3 py-2.5">ธีม</th>}
                        <th className="px-3 py-2.5">ชื่อ-สกุล</th>
                        <th className="px-3 py-2.5">โรงเรียน</th>
                        <th className="px-3 py-2.5">ระดับชั้น</th>
                        <th className="px-3 py-2.5">เบอร์โทร</th>
                        <th className="px-3 py-2.5">อีเมล</th>
                        <th className="px-3 py-2.5">โหมด</th>
                        <th className="px-3 py-2.5 text-center">เช็คอิน</th>
                        <th className="px-3 py-2.5 text-center">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {imported.map((p) => (
                        <tr key={p.id} className="hover:bg-orange-50/40">
                          <td className="px-3 py-2 font-mono font-bold text-[#F15A24]">{p.code || "—"}{p.status === "waitlist" && <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded">สำรอง</span>}</td>
                          {view3Course?.count_mode === "team" && <td className="px-3 py-2 text-xs font-medium text-[#F15A24] max-w-[140px]"><span className="line-clamp-1">{p.theme_name || <span className="text-slate-300">—</span>}</span></td>}
                          <td className="px-3 py-2 font-medium text-slate-700">{p.full_name}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{p.school || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{p.grade || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 font-mono">{p.phone || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 font-mono">{p.email || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs">{p.seatMode === "extra" ? <span className="text-emerald-600 font-bold">เพิ่ม</span> : <span className="text-slate-500">กัน</span>}</td>
                          <td className="px-3 py-2 text-center">
                            {p.checkedIn ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><Ico.check className="w-3 h-3" /> แล้ว</span> : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => doDeleteOne(p)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
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

        {/* ── แท็บ USER ── */}
        {tab3 === "user" && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400 font-bold">{importedUsers.length} คน</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> เข้าระบบแล้ว {importedUsers.filter((u) => u.claimed).length}</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> ยังไม่เข้า {importedUsers.filter((u) => !u.claimed).length}</span>
              </div>
              {importedUsers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button onClick={loadImportedUsers} className="inline-flex items-center gap-1 text-slate-500 hover:text-violet-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition text-xs font-bold"><Ico.rotate className="w-3.5 h-3.5" /> รีเฟรช</button>
                  <button onClick={exportUsers} className="inline-flex items-center gap-1.5 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition"><Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด</button>
                </div>
              )}
            </div>

            {loadingUsers ? (
              <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด…</div>
            ) : importedUsers.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">ยังไม่มี user ที่นำเข้า</div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] text-slate-400 uppercase">
                        <th className="px-3 py-2.5">สถานะ</th>
                        <th className="px-3 py-2.5">อีเมล</th>
                        <th className="px-3 py-2.5">ชื่อ-นามสกุล</th>
                        <th className="px-3 py-2.5">ระดับชั้น</th>
                        <th className="px-3 py-2.5">โรงเรียน</th>
                        <th className="px-3 py-2.5">เบอร์</th>
                        <th className="px-3 py-2.5 text-center">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importedUsers.map((u, i) => (
                        <tr key={i} className="hover:bg-violet-50/40">
                          <td className="px-3 py-2">
                            {u.claimed
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><Ico.check className="w-3 h-3" /> เข้าแล้ว</span>
                              : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md"><Ico.clock className="w-3 h-3" /> ยังไม่เข้า</span>}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-violet-600">{u.email}</td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-700">{[u.title, u.first_name, u.last_name].filter(Boolean).join(" ") || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{u.grade_level || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{u.school || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 font-mono">{u.phone || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => doDeleteUser(u)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
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
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: นำเข้า user (pending_profiles) — CSV หรือกรอกเอง
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

function UserImportSection({ allSchools }) {
  const { toast } = useDialog()
  const [rows, setRows] = useState([])
  const [mapped, setMapped] = useState([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [uMode, setUMode] = useState("file")
  const [uManual, setUManual] = useState([])
  const [uForm, setUForm] = useState({ email: "", title: "", first_name: "", last_name: "", nickname: "", grade_level: "", school: "", phone: "", national_id: "" })
  const [checking, setChecking] = useState(false)
  const [dupModal, setDupModal] = useState(null)   // { dups:[...], source:[...] } | null

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null)
    try {
      const ext = file.name.split(".").pop().toLowerCase()
      if (ext !== "csv") { toast("รองรับเฉพาะ .csv — Excel ให้ Save As เป็น CSV ก่อน", "error"); return }
      const text = await file.text()
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "")
      if (lines.length < 2) { toast("ไฟล์ว่างหรือไม่มีข้อมูล", "error"); return }
      const headers = splitLine(lines[0])
      const parsedRows = lines.slice(1).map((line) => {
        const vals = splitLine(line); const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || "" }); return obj
      })
      const out = parsedRows.map((r) => {
        const obj = {}
        for (const [k, v] of Object.entries(r)) {
          const field = USER_HEADER_MAP[normalizeHeader(k)]
          if (field) obj[field] = String(v ?? "").trim()
        }
        return obj
      }).filter((o) => o.email)
      setRows(parsedRows); setMapped(out)
      if (out.length === 0) toast("ไม่พบข้อมูล หรือไม่มีคอลัมน์อีเมล", "error")
      else toast(`อ่านไฟล์สำเร็จ ${out.length} คน`, "success")
    } catch (err) { toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error") }
    finally { e.target.value = "" }
  }

  // เพิ่ม user manual — validation
  function addUManual() {
    const email = (uForm.email || "").trim()
    if (!email) return toast("กรอกอีเมลก่อน (จำเป็น)", "error")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("อีเมลไม่ถูกต้อง", "error")
    const phone = (uForm.phone || "").trim()
    if (phone && (phone.length !== 10 || !phone.startsWith("0"))) return toast("เบอร์โทรต้อง 10 หลักขึ้นต้น 0 (หรือเว้นว่าง)", "error")
    const nid = (uForm.national_id || "").trim()
    if (nid && nid.length !== 13) return toast("เลขบัตรต้อง 13 หลัก (หรือเว้นว่าง)", "error")
    setUManual((prev) => [...prev, { ...uForm, email }])
    setUForm({ email: "", title: "", first_name: "", last_name: "", nickname: "", grade_level: "", school: "", phone: "", national_id: "" })
  }
  function removeUManual(idx) { setUManual((prev) => prev.filter((_, i) => i !== idx)) }

  // กด "นำเข้า" → เช็คซ้ำก่อน · ถ้าซ้ำ → เปิด modal ให้เลือก · ไม่ซ้ำ → import เลย
  async function doImport() {
    const source = uMode === "manual" ? uManual : mapped
    if (source.length === 0) return toast("ยังไม่มีข้อมูล", "error")
    setChecking(true)
    try {
      const dups = await checkImportDuplicates(source)
      if (dups && dups.length > 0) {
        // ตั้งค่าเริ่มต้น: ทุกรายที่ซ้ำ = "update" (ทับ) · ถ้าเลือก skip ค่อยเปลี่ยน
        setDupModal({ dups, source, choices: Object.fromEntries(dups.map((d) => [d.email, "update"])) })
        setChecking(false)
        return
      }
      // ไม่ซ้ำ → import ทั้งหมด
      await runImport(source, [])
    } catch (e) {
      toast("เช็คข้อมูลซ้ำไม่สำเร็จ: " + e.message, "error")
    } finally { setChecking(false) }
  }

  // import จริง — skipEmails = อีเมลที่ admin เลือก "ข้าม"
  async function runImport(source, skipEmails) {
    setImporting(true)
    try {
      const res = await importUsersBatch(source, skipEmails)
      setResult(res)
      const skipMsg = res.skipped ? ` · ข้าม ${res.skipped}` : ""
      toast(`นำเข้าเสร็จ — สำเร็จ ${res.ok} คน${skipMsg}${res.fail ? ` · ผิดพลาด ${res.fail}` : ""}`, res.fail ? "error" : "success")
      if (uMode === "manual") setUManual([])
    } catch (e) { toast("นำเข้าไม่สำเร็จ: " + e.message, "error") }
    finally { setImporting(false) }
  }

  // ยืนยันจาก modal → import ตามที่เลือก (skip รายที่เลือก "ข้าม")
  async function confirmDupModal() {
    if (!dupModal) return
    const skipEmails = Object.entries(dupModal.choices)
      .filter(([, action]) => action === "skip")
      .map(([email]) => email)
    const src = dupModal.source
    setDupModal(null)
    await runImport(src, skipEmails)
  }

  const uInput = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none transition"
  const uCount = uMode === "manual" ? uManual.length : mapped.length

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-violet-500 text-white flex items-center justify-center text-xs font-extrabold shrink-0">1</span>
        <div>
          <h2 className="text-sm font-bold text-slate-700">นำเข้า User (โปรไฟล์ล่วงหน้า)</h2>
          <p className="text-[11px] text-slate-400">สร้าง account ล่วงหน้า — user กด Google login (อีเมลเดียวกัน) เข้าใช้ได้เลย</p>
        </div>
      </div>

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

      {uMode === "file" && (
        <>
          <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3 mb-3 text-[11px] text-slate-600 leading-relaxed">
            <span className="font-bold text-violet-700">คอลัมน์ที่รองรับ:</span> ต้องมี <span className="font-bold">อีเมล/email</span> (จำเป็น) · ชื่อ · นามสกุล · ชื่อเล่น · อายุ · ระดับชั้น · โรงเรียน · เบอร์โทร · เลขบัตร · ที่อยู่ · ตำบล · อำเภอ · จังหวัด · รหัสไปรษณีย์ · ผู้ปกครอง ฯลฯ (ไทย/อังกฤษ)
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
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5 text-left">อีเมล</th><th className="px-2 py-1.5 text-left">ชื่อ</th><th className="px-2 py-1.5 text-left">นามสกุล</th><th className="px-2 py-1.5 text-left">โรงเรียน</th></tr></thead>
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

      {uMode === "manual" && (
        <div>
          <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={uInput} type="email" placeholder="อีเมล / Gmail * (จำเป็น)" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUManual() } }} />
              <input className={uInput} placeholder="คำนำหน้า (นาย/นางสาว)" value={uForm.title} onChange={(e) => setUForm({ ...uForm, title: e.target.value })} />
              <input className={uInput} placeholder="ชื่อจริง" value={uForm.first_name} onChange={(e) => setUForm({ ...uForm, first_name: e.target.value })} />
              <input className={uInput} placeholder="นามสกุล" value={uForm.last_name} onChange={(e) => setUForm({ ...uForm, last_name: e.target.value })} />
              <input className={uInput} placeholder="ชื่อเล่น" value={uForm.nickname} onChange={(e) => setUForm({ ...uForm, nickname: e.target.value })} />
              <input className={uInput} placeholder="ระดับชั้น (มัธยมศึกษาตอนปลาย ม.6)" value={uForm.grade_level} onChange={(e) => setUForm({ ...uForm, grade_level: e.target.value })} />
              <SchoolInput className={uInput} placeholder="โรงเรียน (พิมพ์เพื่อค้นหา)" value={uForm.school} onChange={(v) => setUForm((f) => ({ ...f, school: v }))} allSchools={allSchools} />
              <input className={uInput} placeholder="เบอร์โทร (10 หลัก)" value={uForm.phone} onChange={(e) => setUForm({ ...uForm, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} />
              <input className={uInput + " sm:col-span-2"} placeholder="เลขบัตรประชาชน 13 หลัก" value={uForm.national_id} onChange={(e) => setUForm({ ...uForm, national_id: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) })} />
            </div>
            <button onClick={addUManual} className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-violet-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-violet-600 transition text-sm">
              <Ico.plus className="w-4 h-4" /> เพิ่มคนนี้เข้ารายการ
            </button>
            <p className="text-[11px] text-slate-400 mt-2">💡 กด Enter ในช่องอีเมลเพื่อเพิ่มเร็ว · อีเมลจำเป็น · เบอร์ 10 หลัก / เลขบัตร 13 หลัก (ถ้ากรอก)</p>
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

      {uCount > 0 && (
        <button onClick={doImport} disabled={importing || checking}
          className="w-full mt-4 bg-violet-500 hover:bg-violet-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
          <Ico.users className="w-4 h-4" /> {checking ? "กำลังตรวจข้อมูลซ้ำ…" : importing ? "กำลังนำเข้า…" : `นำเข้า ${uCount} คน`}
        </button>
      )}

      {result && (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${result.fail ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="font-bold text-slate-700">นำเข้าสำเร็จ {result.ok} คน{result.skipped ? ` · ข้าม ${result.skipped} คน` : ""}{result.fail ? ` · ผิดพลาด ${result.fail} คน` : ""}</p>
          {result.errors?.length > 0 && (
            <ul className="mt-1.5 text-[11px] text-rose-600 space-y-0.5 max-h-32 overflow-y-auto">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Modal เลือกจัดการข้อมูลซ้ำ */}
      {dupModal && (
        <DuplicateModal
          dupModal={dupModal}
          setChoice={(email, action) => setDupModal((m) => ({ ...m, choices: { ...m.choices, [email]: action } }))}
          setAll={(action) => setDupModal((m) => ({ ...m, choices: Object.fromEntries(m.dups.map((d) => [d.email, action])) }))}
          onCancel={() => setDupModal(null)}
          onConfirm={confirmDupModal}
        />
      )}
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Modal จัดการข้อมูลซ้ำ — โชว์รายชื่อที่ซ้ำ + เลือกต่อราย (อัปเดต/ข้าม)
// ═══════════════════════════════════════════════════════════════════
function DuplicateModal({ dupModal, setChoice, setAll, onCancel, onConfirm }) {
  const { dups, choices } = dupModal
  const skipCount = Object.values(choices).filter((a) => a === "skip").length
  const updateCount = dups.length - skipCount

  // สรุป field ที่ซ้ำของแต่ละราย
  function matchLabels(matches) {
    const has = { email: false, nid: false, phone: false, name: false }
    ;(matches || []).forEach((m) => {
      if (m.match_email) has.email = true
      if (m.match_nid) has.nid = true
      if (m.match_phone) has.phone = true
      if (m.match_name) has.name = true
    })
    const out = []
    if (has.email) out.push("อีเมล")
    if (has.nid) out.push("เลขบัตร")
    if (has.phone) out.push("เบอร์")
    if (has.name) out.push("ชื่อ")
    return out
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Ico.alert className="w-4 h-4" /></span>
            <div>
              <h3 className="font-bold text-slate-800">พบข้อมูลซ้ำ {dups.length} คน</h3>
              <p className="text-[11px] text-slate-400">เลือกว่าจะอัปเดต (ทับข้อมูลเดิม) หรือข้าม (ไม่นำเข้า) แต่ละคน</p>
            </div>
          </div>
          {/* เลือกทั้งหมด */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] text-slate-400 font-bold">ตั้งทั้งหมด:</span>
            <button onClick={() => setAll("update")} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition">อัปเดตทั้งหมด</button>
            <button onClick={() => setAll("skip")} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">ข้ามทั้งหมด</button>
          </div>
        </div>

        {/* รายการซ้ำ */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {dups.map((d) => {
            const labels = matchLabels(d.matches)
            const existing = (d.matches || [])[0]
            const action = choices[d.email] || "update"
            return (
              <div key={d.email} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-800 truncate">{d.name || d.email}</p>
                    <p className="text-[11px] text-violet-600 font-mono truncate">{d.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {labels.map((l) => (
                        <span key={l} className="text-[10px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">ซ้ำ{l}</span>
                      ))}
                    </div>
                    {existing && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        ซ้ำกับ: {existing.source === "profile" ? "คนสมัครเอง" : "ที่นำเข้าไว้"}
                        {existing.name ? ` · ${existing.name}` : ""}
                        {existing.claimed ? " · เข้าระบบแล้ว" : ""}
                      </p>
                    )}
                  </div>
                  {/* ปุ่มเลือก */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg shrink-0">
                    <button onClick={() => setChoice(d.email, "update")}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${action === "update" ? "bg-violet-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>อัปเดต</button>
                    <button onClick={() => setChoice(d.email, "skip")}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${action === "skip" ? "bg-slate-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>ข้าม</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 mb-3 text-center">จะอัปเดต <b className="text-violet-600">{updateCount}</b> คน · ข้าม <b className="text-slate-600">{skipCount}</b> คน{updateCount === 0 ? "" : " · คนที่ไม่ซ้ำจะถูกนำเข้าทั้งหมด"}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onCancel} className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">ยกเลิก</button>
            <button onClick={onConfirm} className="py-3 bg-violet-500 text-white rounded-xl font-bold hover:bg-violet-600 transition text-sm">ยืนยันนำเข้า</button>
          </div>
        </div>
      </div>
    </div>
  )
}