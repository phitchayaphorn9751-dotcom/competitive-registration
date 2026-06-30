import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchCoursesAdmin, importExternalParticipant } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"

// แปลง CSV → array ของ object (รองรับ header ไทย/อังกฤษ + คั่นด้วย , )
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "")
  if (lines.length === 0) return { headers: [], rows: [] }
  // แยกฟิลด์ (รองรับค่าในเครื่องหมายคำพูด)
  const split = (line) => {
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
  const rawHeaders = split(lines[0])
  // map header → field มาตรฐาน
  const headerMap = {
    "ชื่อ-สกุล": "full_name", "ชื่อ-นามสกุล": "full_name", "ชื่อ": "full_name", "full_name": "full_name", "name": "full_name",
    "โรงเรียน": "school", "school": "school",
    "ระดับชั้น": "grade_level", "ระดับ": "grade_level", "grade_level": "grade_level", "grade": "grade_level",
    "เบอร์โทร": "phone", "เบอร์": "phone", "phone": "phone", "tel": "phone",
    "อีเมล": "email", "email": "email", "e-mail": "email",
    "เลขบัตรประชาชน": "national_id", "เลขบัตร": "national_id", "national_id": "national_id", "id_card": "national_id",
  }
  const fields = rawHeaders.map((h) => headerMap[h.toLowerCase()] || headerMap[h] || null)
  const rows = lines.slice(1).map((line) => {
    const vals = split(line)
    const obj = {}
    fields.forEach((f, i) => { if (f) obj[f] = vals[i] || "" })
    return obj
  }).filter((r) => (r.full_name || "").trim() !== "")
  return { headers: rawHeaders, fields, rows }
}

export default function AdminImport() {
  const { event } = useOutletContext() || {}
  const { toast } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([]) // { full_name, participant_code, duplicate, error }

  useEffect(() => {
    if (event?.id) fetchCoursesAdmin(event.id).then(setCourses).catch(() => {})
  }, [event?.id])

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResults([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const { rows, fields } = parseCsv(ev.target.result)
        if (!fields || !fields.includes("full_name")) {
          toast("ไม่พบคอลัมน์ชื่อ — ต้องมีหัวคอลัมน์ 'ชื่อ-สกุล' หรือ 'full_name'", "error")
          setRows([]); return
        }
        setRows(rows)
        if (rows.length === 0) toast("ไม่พบข้อมูลในไฟล์", "error")
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
      const row = rows[i]
      try {
        const res = await importExternalParticipant(courseId, row)
        out.push({ full_name: row.full_name, participant_code: res.participant_code, duplicate: res.duplicate })
      } catch (e) {
        out.push({ full_name: row.full_name, error: e.message })
      }
      setProgress({ done: i + 1, total: rows.length })
      setResults([...out])
    }
    setImporting(false)
    const ok = out.filter((r) => r.participant_code && !r.error).length
    const dup = out.filter((r) => r.duplicate).length
    const fail = out.filter((r) => r.error).length
    toast(`เสร็จแล้ว: สำเร็จ ${ok} · ซ้ำ ${dup} · ผิดพลาด ${fail}`, fail > 0 ? "error" : "success")
  }

  function exportResults() {
    const headers = ["ชื่อ-สกุล", "รหัสนักเรียน", "สถานะ"]
    const lines = [headers.join(",")]
    results.forEach((r) => {
      const status = r.error ? `ผิดพลาด: ${r.error}` : r.duplicate ? "มีอยู่แล้ว" : "เพิ่มใหม่"
      const vals = [r.full_name, r.participant_code || "", status].map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "รหัสนักเรียน_import.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const selectedCourse = courses.find((c) => c.id === courseId)

  return (
    <div className="pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.upload className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">นำเข้าผู้สมัคร (ระบบนอก)</h1>
          <p className="text-slate-400 text-xs mt-0.5">Import รายชื่อจาก CSV เพื่อใช้เช็คอิน — ไม่กระทบที่นั่ง</p>
        </div>
      </div>

      {/* คำอธิบาย */}
      <div className="bg-orange-50/60 border border-orange-100 rounded-2xl p-4 mb-4 text-sm text-slate-600 flex items-start gap-2.5">
        <Ico.alert className="w-4 h-4 text-[#F15A24] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-slate-700 mb-1">วิธีใช้</p>
          <p className="text-xs leading-relaxed">
            1. เลือกคอร์สปลายทาง · 2. อัปโหลด CSV (หัวคอลัมน์: ชื่อ-สกุล, โรงเรียน, ระดับชั้น, เบอร์โทร, อีเมล, เลขบัตรประชาชน) · 3. กดนำเข้า → ระบบสร้างรหัสนักเรียนให้อัตโนมัติ · 4. ดาวน์โหลดรหัสกลับไปแจกผู้สมัคร
            <br />ผู้สมัครที่นำเข้าจะ <b>ยืนยันแล้ว (เช็คอินได้ทันที)</b> และ <b>ไม่นับรวมที่นั่ง</b> ของระบบ
          </p>
        </div>
      </div>

      {/* เลือกคอร์ส + อัปโหลด */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 mb-4 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">คอร์สปลายทาง</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none transition">
            <option value="">— เลือกคอร์ส —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (รหัส: ${c.base_id})` : ""}{c.is_open ? "" : " · ปิดรับ"}</option>
            ))}
          </select>
          {selectedCourse && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              รหัสนักเรียนจะขึ้นต้นด้วย <span className="font-mono font-bold text-[#F15A24]">{selectedCourse.base_id || "P"}-001</span>, {selectedCourse.base_id || "P"}-002, …
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">ไฟล์ CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile}
            className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 transition" />
          {fileName && <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1"><Ico.folder className="w-3.5 h-3.5" /> {fileName} — พบ {rows.length} รายชื่อ</p>}
        </div>
      </div>

      {/* Preview ตาราง */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">ตัวอย่างข้อมูล ({rows.length} คน)</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[10px] text-slate-400 uppercase">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">ชื่อ-สกุล</th>
                  <th className="px-4 py-2.5">โรงเรียน</th>
                  <th className="px-4 py-2.5">ระดับชั้น</th>
                  <th className="px-4 py-2.5">เบอร์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-orange-50/40">
                    <td className="px-4 py-2 text-xs text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.full_name}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{r.school || "-"}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{r.grade_level || "-"}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs font-mono">{r.phone || "-"}</td>
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

      {/* ผลลัพธ์ */}
      {results.length > 0 && !importing && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">ผลการนำเข้า ({results.length})</span>
            <button onClick={exportResults} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">
              <Ico.download className="w-3.5 h-3.5" /> ดาวน์โหลดรหัส CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[10px] text-slate-400 uppercase">
                  <th className="px-4 py-2.5">ชื่อ-สกุล</th>
                  <th className="px-4 py-2.5">รหัสนักเรียน</th>
                  <th className="px-4 py-2.5">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-orange-50/40">
                    <td className="px-4 py-2 font-medium text-slate-700">{r.full_name}</td>
                    <td className="px-4 py-2 font-mono font-bold text-[#F15A24]">{r.participant_code || "-"}</td>
                    <td className="px-4 py-2">
                      {r.error ? <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">ผิดพลาด</span>
                        : r.duplicate ? <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">มีอยู่แล้ว</span>
                        : <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">เพิ่มใหม่</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}