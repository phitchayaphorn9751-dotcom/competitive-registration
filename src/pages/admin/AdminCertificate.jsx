import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, fetchCertificateRecipients,
  fetchEventSettings, uploadCertificateTemplate, updateEventSettings,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"
import {
  generateCertificatePDF, previewCertificate,
  DEFAULT_CERT_FIELDS, DEFAULT_AWARDS,
} from "../../lib/certificate.js"

const FONT = "'Sarabun', sans-serif"

export default function AdminCertificate() {
  const { event } = useOutletContext()
  const { toast } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [recipients, setRecipients] = useState([])   // [{participant_id, full_name, course_title, award}]
  const [loading, setLoading] = useState(false)
  const [defaultAward, setDefaultAward] = useState("")
  const [genning, setGenning] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  // เทมเพลต + รายการรางวัล จาก event_settings
  const [templateUrl, setTemplateUrl] = useState("")
  const [awards, setAwards] = useState(DEFAULT_AWARDS)
  const [fields, setFields] = useState(DEFAULT_CERT_FIELDS)

  useEffect(() => {
    if (!event?.id) return
    fetchCoursesAdmin(event.id).then((d) => setCourses(d || [])).catch(() => {})
    fetchEventSettings(event.id).then((es) => {
      setTemplateUrl(es.cert_template_url || "")
      setAwards((Array.isArray(es.cert_awards) && es.cert_awards.length) ? es.cert_awards : DEFAULT_AWARDS)
      setFields(es.cert_fields || DEFAULT_CERT_FIELDS)
      setDefaultAward(((Array.isArray(es.cert_awards) && es.cert_awards.length) ? es.cert_awards : DEFAULT_AWARDS)[0] || "")
    }).catch(() => {})
  }, [event?.id])

  // อัปโหลดรูปพื้นหลังเกียรติบัตร (บันทึกลง event_settings ทันที)
  async function handleTemplateFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!event?.id) return toast("ยังไม่ได้เลือกงาน", "error")
    setUploading(true)
    try {
      const url = await uploadCertificateTemplate(file)
      await updateEventSettings(event.id, { cert_template_url: url })
      setTemplateUrl(url)
      toast("ตั้งรูปพื้นหลังเรียบร้อย", "success")
    } catch (err) {
      toast("อัปโหลดไม่สำเร็จ: " + err.message, "error")
    } finally { setUploading(false); e.target.value = "" }
  }
  async function removeTemplate() {
    if (!event?.id) return
    try {
      await updateEventSettings(event.id, { cert_template_url: "" })
      setTemplateUrl("")
      toast("ลบรูปพื้นหลังแล้ว", "success")
    } catch (err) { toast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  // โหลดคน check-in เมื่อเลือกคอร์ส
  async function loadRecipients(cid) {
    setCourseId(cid)
    setRecipients([])
    setPreviewUrl("")
    if (!cid) return
    setLoading(true)
    try {
      const list = await fetchCertificateRecipients(cid)
      // ตั้งรางวัล default ให้ทุกคน
      setRecipients(list.map((r) => ({ ...r, award: defaultAward || awards[0] || "" })))
    } catch (e) { toast("โหลดรายชื่อไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }

  // เปลี่ยนรางวัล default → อัปเดตทุกคน
  function applyDefaultAward(award) {
    setDefaultAward(award)
    setRecipients((rs) => rs.map((r) => ({ ...r, award })))
  }
  // เปลี่ยนรางวัลรายคน
  function setOneAward(pid, award) {
    setRecipients((rs) => rs.map((r) => r.participant_id === pid ? { ...r, award } : r))
  }

  async function doPreview(r) {
    if (!templateUrl) return toast("กรุณาอัปโหลดรูปพื้นหลังด้านบนก่อน", "error")
    try {
      const url = await previewCertificate({ templateUrl, recipient: r, fields, fontFamily: FONT })
      setPreviewUrl(url)
    } catch (e) { toast("สร้างตัวอย่างไม่สำเร็จ: " + e.message, "error") }
  }

  async function doGenerate() {
    if (!templateUrl) return toast("กรุณาอัปโหลดรูปพื้นหลังด้านบนก่อน", "error")
    if (recipients.length === 0) return toast("ไม่มีรายชื่อผู้รับ (ต้องมีคน check-in ก่อน)", "error")
    setGenning(true)
    try {
      const courseName = courses.find((c) => c.id === courseId)?.title || "certificate"
      const doc = await generateCertificatePDF({ templateUrl, recipients, fields, fontFamily: FONT })
      const safe = courseName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
      doc.save(`เกียรติบัตร_${safe}.pdf`)
      toast(`สร้างเกียรติบัตรแล้ว ${recipients.length} ใบ`, "success")
    } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false) }
  }

  if (!event) return <div className="bg-white rounded-2xl p-12 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีงาน — สร้างงานในเมนูตั้งค่าเว็บ</div>

  return (
    <div className="max-w-5xl space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.cap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">ออกเกียรติบัตร</h1>
          <p className="text-slate-400 text-xs mt-0.5">เลือกคอร์ส → ตั้งรางวัล → ออก PDF (เฉพาะคนที่เช็คอินแล้ว)</p>
        </div>
      </div>

      {/* การ์ดตั้งรูปพื้นหลังเกียรติบัตร */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1">
          <Ico.cap className="w-4 h-4 text-[#F15A24]" /> รูปพื้นหลังเกียรติบัตร
        </label>
        <p className="text-xs text-slate-400 mb-3">อัปโหลดรูปเทมเพลต (แนวนอน) — ระบบจะวางชื่อ/รางวัล/คอร์ส ทับบนรูปนี้</p>

        {templateUrl ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={templateUrl} alt="template" className="w-full sm:w-64 rounded-xl border border-slate-200" />
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition">
                <Ico.cap className="w-4 h-4" /> เปลี่ยนรูป
                <input type="file" accept="image/*" onChange={handleTemplateFile} disabled={uploading} className="hidden" />
              </label>
              <button onClick={removeTemplate} className="inline-flex items-center gap-2 text-rose-500 hover:bg-rose-50 px-4 py-2 rounded-xl text-sm font-bold transition">
                <Ico.alert className="w-4 h-4" /> ลบรูป
              </button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer block border-2 border-dashed border-slate-200 rounded-xl px-4 py-8 text-center hover:border-[#F15A24] hover:bg-orange-50/40 transition">
            <Ico.cap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <span className="text-sm font-bold text-slate-600">{uploading ? "กำลังอัปโหลด…" : "คลิกเพื่ออัปโหลดรูปพื้นหลัง"}</span>
            <input type="file" accept="image/*" onChange={handleTemplateFile} disabled={uploading} className="hidden" />
          </label>
        )}
      </div>

      {/* เลือกคอร์ส + รางวัล default */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">เลือกคอร์ส</label>
            <select value={courseId} onChange={(e) => loadRecipients(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm bg-white">
              <option value="">— เลือกคอร์ส —</option>
              {(Array.isArray(courses)?courses:[]).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">รางวัลเริ่มต้น (ทั้งคอร์ส)</label>
            <select value={defaultAward} onChange={(e) => applyDefaultAward(e.target.value)} disabled={recipients.length === 0}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm bg-white disabled:opacity-50">
              {(Array.isArray(awards)?awards:[]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-400 text-center py-4">กำลังโหลดรายชื่อ…</p>}

        {!loading && courseId && recipients.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีคนที่เช็คอินในคอร์สนี้ — เกียรติบัตรออกได้เฉพาะคนที่มางาน (เช็คอินแล้ว)</p>
        )}

        {recipients.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{recipients.length} คนเช็คอินแล้ว · ปรับรางวัลรายคนได้ด้านล่าง</span>
            <button onClick={doGenerate} disabled={genning}
              className="flex items-center gap-1.5 bg-[#F15A24] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#c44215] transition active:scale-95 disabled:opacity-50">
              <Ico.download className="w-4 h-4" /> {genning ? "กำลังสร้าง…" : "ออกเกียรติบัตรทั้งคอร์ส (PDF)"}
            </button>
          </div>
        )}
      </div>

      {/* ตารางรายชื่อ + รางวัลรายคน */}
      {recipients.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-center w-10">#</th>
                  <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 text-left">โรงเรียน</th>
                  <th className="px-4 py-3 text-left w-56">รางวัล</th>
                  <th className="px-4 py-3 text-center w-20">ดูตัวอย่าง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(Array.isArray(recipients)?recipients:[]).map((r, i) => (
                  <tr key={r.participant_id} className="hover:bg-orange-50/40 transition">
                    <td className="px-4 py-2.5 text-center text-slate-300 font-bold">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.school || "-"}</td>
                    <td className="px-4 py-2.5">
                      <select value={r.award} onChange={(e) => setOneAward(r.participant_id, e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]">
                        {(Array.isArray(awards)?awards:[]).map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => doPreview(r)} className="text-[#F15A24] hover:bg-orange-50 p-1.5 rounded-lg transition" title="ดูตัวอย่าง">
                        <Ico.eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl("")}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-3 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm flex items-center gap-2"><Ico.eye className="w-4 h-4" /> ตัวอย่างเกียรติบัตร</h3>
              <button onClick={() => setPreviewUrl("")} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-4 bg-slate-100">
              <img src={previewUrl} alt="ตัวอย่าง" className="w-full rounded-lg shadow" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}