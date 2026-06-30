import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchCoursesAdmin, importExternalParticipant, fetchCourseParticipants } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"

// header ที่รู้จัก → field มาตรฐาน (ใช้ส่งเข้า RPC)
const HEADER_MAP = {
  "ชื่อ-สกุล": "full_name", "ชื่อ-นามสกุล": "full_name", "ชื่อ": "full_name", "full_name": "full_name", "name": "full_name",
  "โรงเรียน": "school", "school": "school",
  "ระดับชั้น": "grade_level", "ระดับ": "grade_level", "grade_level": "grade_level", "grade": "grade_level",
  "เบอร์โทร": "phone", "เบอร์": "phone", "phone": "phone", "tel": "phone",
  "อีเมล": "email", "email": "email", "e-mail": "email",
  "เลขบัตรประชาชน": "national_id", "เลขบัตร": "national_id", "national_id": "national_id", "id_card": "national_id",
}

// แยกฟิลด์ 1 บรรทัด (รองรับค่าในเครื่องหมายคำพูด)
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

// แปลง CSV → { headers (ดิบ), fields (mapped), rows (เก็บข้อมูลดิบทุกคอลัมน์) }
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "")
  if (lines.length === 0) return { headers: [], fields: [], rows: [] }
  const headers = splitLine(lines[0])
  const fields = headers.map((h) => HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h] || null)
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line)
    // raw: เก็บทุกคอลัมน์ตาม header เดิม (เพื่อโชว์ + ดาวน์โหลดคืนครบ)
    const raw = {}
    headers.forEach((h, i) => { raw[h] = vals[i] || "" })
    // mapped: เฉพาะ field มาตรฐาน (เพื่อส่งเข้า RPC)
    const mapped = {}
    fields.forEach((f, i) => { if (f) mapped[f] = vals[i] || "" })
    return { raw, mapped }
  }).filter((r) => (r.mapped.full_name || "").trim() !== "")
  return { headers, fields, rows }
}

export default function AdminImport() {
  const { event } = useOutletContext() || {}
  const { toast } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [headers, setHeaders] = useState([])   // header ดิบจากไฟล์
  const [rows, setRows] = useState([])         // [{ raw, mapped }]
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([])   // [{ raw, participant_code }]

  // section: รายการที่นำเข้าแล้ว
  const [imported, setImported] = useState([])
  const [loadingImported, setLoadingImported] = useState(false)

  useEffect(() => {
    if (event?.id) fetchCoursesAdmin(event.id).then(setCourses).catch(() => {})
  }, [event?.id])

  // โหลดรายการที่ import แล้วของคอร์สที่เลือก
  async function loadImported(cid) {
    if (!cid) { setImported([]); return }
    setLoadingImported(true)
    try {
      const regs = await fetchCourseParticipants(cid)
      const list = []
      ;(regs || []).forEach((r) => {
        (r.participants || []).forEach((p) => {
          list.push({
            full_name: p.full_name, school: p.school || "", grade: p.grade_level || "",
            phone: p.phone || "", email: p.email || r.submitter_email || "",
            code: p.participant_code || "",
            checkedIn: (p.checkins?.length || 0) > 0,
            created_at: r.created_at,
          })
        })
      })
      list.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }))
      setImported(list)
    } catch (e) { toast("โหลดรายการไม่สำเร็จ: " + e.message, "error"); setImported([]) }
    finally { setLoadingImported(false) }
  }

  function onSelectCourse(cid) {
    setCourseId(cid)
    setResults([])
    loadImported(cid)
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResults([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseCsv(ev.target.result)
        if (!parsed.fields.includes("full_name")) {
          toast("ไม่พบคอลัมน์ชื่อ — ต้องมีหัวคอลัมน์ 'ชื่อ-สกุล' หรือ 'full_name'", "error")
          setRows([]); setHeaders([]); return
        }
        setHeaders(parsed.headers)
        setRows(parsed.rows)
        if (parsed.rows.length === 0) toast("ไม่พบข้อมูลในไฟล์", "error")
      } catch (err) { toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "error") }
    }
    reader.readAsText(file, "UTF-8")
    e.target.value = ""
  }

  async function doImport() {
    if (!courseId) return toast("เลือกคอร์สก่อน", "error")
    if (rows.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    setImporting(true)
    setProgress({ done: 0, total: rows.length })
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const { raw, mapped } = rows[i]
      try {
        const res = await importExternalParticipant(courseId, mapped)
        out.push({ raw, participant_code: res.participant_code })
      } catch (e) {
        out.push({ raw, participant_code: "", error: e.message })
      }
      setProgress({ done: i + 1, total: rows.length })
      setResults([...out])
    }
    setImporting(false)
    const ok = out.filter((r) => r.participant_code).length
    const fail = out.filter((r) => r.error).length
    toast(`เสร็จแล้ว: สำเร็จ ${ok}${fail ? ` · ผิดพลาด ${fail}` : ""}`, fail > 0 ? "error" : "success")
    loadImported(courseId)  // รีเฟรช section รายการที่นำเข้าแล้ว
  }

  // ดาวน์โหลด: คงข้อมูลเดิมจากไฟล์ครบ + เพิ่ม "รหัสผู้สมัคร" คอลัมน์แรกสุด
  function exportResults() {
    const head = ["รหัสผู้สมัคร", ...headers]
    const lines = [head.join(",")]
    results.forEach((r) => {
      const vals = [r.participant_code, ...headers.map((h) => r.raw[h] || "")]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "ผู้สมัคร_พร้อมรหัส.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // ดาวน์โหลด section รายการที่นำเข้าแล้ว
  function exportImported() {
    const head = ["รหัสผู้สมัคร", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมล", "เช็คอิน"]
    const lines = [head.join(",")]
    imported.forEach((p) => {
      const vals = [p.code, p.full_name, p.school, p.grade, p.phone, p.email, p.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `รายชื่อนำเข้า_${selectedCourse?.title || "course"}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const selectedCourse = courses.find((c) => c.id === courseId)
  const prefix = selectedCourse?.base_id || "P"

  return (
    <div className="pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.upload className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">นำเข้าผู้สมัคร</h1>
          <p className="text-slate-400 text-xs mt-0.5">อัปโหลดรายชื่อจาก CSV → ระบบสร้างรหัสให้อัตโนมัติ พร้อมใช้เช็คอิน</p>
        </div>
      </div>

      {/* วิธีใช้ — Flow 4 ขั้น */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 mb-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">ขั้นตอนการใช้งาน</p>
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
              {/* ลูกศรเชื่อม (เฉพาะ lg, ไม่ใช่ตัวสุดท้าย) */}
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
      </div>

      {/* เลือกคอร์ส + อัปโหลด */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">1. คอร์สปลายทาง</label>
          <select value={courseId} onChange={(e) => onSelectCourse(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none transition">
            <option value="">— เลือกคอร์ส —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (${c.base_id})` : ""}{c.is_open ? "" : " · ปิดรับ"}</option>
            ))}
          </select>
          {selectedCourse && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              รหัสจะขึ้นต้นด้วย <span className="font-mono font-bold text-[#F15A24]">{prefix}-001</span>, {prefix}-002, …
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">2. ไฟล์ CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile}
            className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
          {fileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {fileName} — พบ {rows.length} รายชื่อ</p>}
        </div>
      </div>

      {/* Preview — โชว์ทุกคอลัมน์ในไฟล์ */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">ตัวอย่างข้อมูล ({rows.length} คน)</span>
            <span className="text-[11px] text-slate-400">{headers.length} คอลัมน์</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 mb-4">
          {importing ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>กำลังนำเข้า…</span>
                <span className="font-bold">{progress.done} / {progress.total}</span>
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

      {/* ผลการนำเข้า — ไม่มีสถานะ + ดาวน์โหลดคงข้อมูลเดิม + รหัสคอลัมน์แรก */}
      {results.length > 0 && !importing && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">ผลการนำเข้า ({results.length})</span>
            <button onClick={exportResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">
              <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด (ไฟล์เดิม + รหัส)
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
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

      {/* ───── Section: รายการที่นำเข้าแล้ว (ของคอร์สที่เลือก) ───── */}
      {courseId && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Ico.users className="w-4 h-4 text-[#F15A24] shrink-0" />
              <span className="text-sm font-bold text-slate-700 truncate">รายการที่นำเข้าแล้ว — {selectedCourse?.title}</span>
              <span className="text-xs font-bold text-slate-400 shrink-0">({imported.length})</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => loadImported(courseId)} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#F15A24] px-2 py-1.5 rounded-lg hover:bg-slate-100 transition text-xs font-bold" aria-label="รีเฟรช">
                <Ico.rotate className="w-3.5 h-3.5" /> รีเฟรช
              </button>
              {imported.length > 0 && (
                <button onClick={exportImported} className="inline-flex items-center gap-1.5 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition">
                  <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลด
                </button>
              )}
            </div>
          </div>
          {loadingImported ? (
            <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด…</div>
          ) : imported.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีผู้สมัครที่นำเข้าในคอร์สนี้</div>
          ) : (
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2.5">รหัสผู้สมัคร</th>
                    <th className="px-3 py-2.5">ชื่อ-สกุล</th>
                    <th className="px-3 py-2.5">โรงเรียน</th>
                    <th className="px-3 py-2.5">ระดับชั้น</th>
                    <th className="px-3 py-2.5">เบอร์โทร</th>
                    <th className="px-3 py-2.5 text-center">เช็คอิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {imported.map((p, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}