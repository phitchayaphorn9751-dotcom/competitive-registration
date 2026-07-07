import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, fetchCertificateRecipients,
  fetchEventSettings, uploadCertificateTemplate, updateEventSettings,
  saveCertAwards, publishCertificates,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"
import {
  generateCertificatePDF, previewCertificate,
  DEFAULT_CERT_FIELDS,
} from "../../lib/certificate.js"

const FONT = "'Sarabun', sans-serif"
const PARTICIPANT_LABEL = "ผู้เข้าร่วม"

export default function AdminCertificate() {
  const { event } = useOutletContext()
  const { toast, confirm } = useDialog()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [recipients, setRecipients] = useState([])   // คนเช็คอิน [{participant_id, full_name, school, ...}]
  const [loading, setLoading] = useState(false)
  const [genning, setGenning] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  const [templateUrl, setTemplateUrl] = useState("")
  const [fields, setFields] = useState(DEFAULT_CERT_FIELDS)

  // แถวรางวัล — แต่ละแถว { id, label(พิมพ์เอง), members:[participant_id...] }
  const [rows, setRows] = useState([
    { id: "r1", label: "", members: [] },
    { id: "r2", label: "", members: [] },
  ])

  useEffect(() => {
    if (!event?.id) return
    fetchCoursesAdmin(event.id).then((d) => setCourses(d || [])).catch(() => {})
    fetchEventSettings(event.id).then((es) => {
      setTemplateUrl(es.cert_template_url || "")
      setFields(es.cert_fields || DEFAULT_CERT_FIELDS)
      // โหลดชื่อรางวัลที่บันทึกไว้ (ทั้งงาน) → เติมเป็นแถว
      const saved = (Array.isArray(es.cert_awards) ? es.cert_awards : []).filter((a) => a && a !== PARTICIPANT_LABEL)
      if (saved.length > 0) {
        setRows(saved.map((label, i) => ({ id: "r" + i, label, members: [] })))
      }
    }).catch(() => {})
  }, [event?.id])

  // ── รูปพื้นหลัง ──
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
    } catch (err) { toast("อัปโหลดไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(false); e.target.value = "" }
  }
  async function removeTemplate() {
    if (!event?.id) return
    try {
      await updateEventSettings(event.id, { cert_template_url: "" })
      setTemplateUrl("")
      toast("ลบรูปพื้นหลังแล้ว", "success")
    } catch (err) { toast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  // ── โหลดคนเช็คอิน (คงชื่อรางวัลไว้ ล้างแค่คนที่ assign) ──
  async function loadRecipients(cid) {
    setCourseId(cid); setRecipients([]); setPreviewUrl("")
    setRows((rs) => rs.map((r) => ({ ...r, members: [] })))  // ล้างคน คงชื่อรางวัล
    if (!cid) return
    setLoading(true)
    try {
      const list = await fetchCertificateRecipients(cid)
      setRecipients(list)
    } catch (e) { toast("โหลดรายชื่อไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }

  // ── บันทึกชื่อรายการรางวัล (ทั้งงาน) ──
  async function saveAwardNames() {
    const names = rows.map((r) => r.label.trim()).filter(Boolean)
    try {
      await updateEventSettings(event.id, { cert_awards: names })
      toast("บันทึกรายการรางวัลแล้ว", "success")
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
  }

  // ── จัดการแถวรางวัล ──
  function setRowLabel(id, label) { setRows((rs) => rs.map((r) => r.id === id ? { ...r, label } : r)) }
  function addRow() { setRows((rs) => [...rs, { id: "r" + Date.now(), label: "", members: [] }]) }
  function removeRow(id) { setRows((rs) => rs.filter((r) => r.id !== id)) }
  function addMember(rowId, pid) {
    setRows((rs) => rs.map((r) => r.id === rowId ? { ...r, members: [...r.members, pid] } : r))
  }
  function removeMember(rowId, pid) {
    setRows((rs) => rs.map((r) => r.id === rowId ? { ...r, members: r.members.filter((m) => m !== pid) } : r))
  }

  // คนที่ถูกจัดรางวัลแล้ว (ทุกแถว)
  const assignedIds = new Set(rows.flatMap((r) => r.members))
  // คนที่ยังไม่จัด = ผู้เข้าร่วม
  const unassigned = recipients.filter((r) => !assignedIds.has(r.participant_id))
  const pFind = (pid) => recipients.find((r) => r.participant_id === pid)

  // รายชื่อออกใบจริง = ทุกคน (มี award ตามแถว / ไม่มี = ผู้เข้าร่วม)
  function buildFinal() {
    const out = []
    for (const row of rows) {
      const label = row.label.trim() || "รางวัล"
      for (const pid of row.members) {
        const p = pFind(pid)
        if (p) out.push({ ...p, award: label })
      }
    }
    for (const p of unassigned) out.push({ ...p, award: PARTICIPANT_LABEL })
    return out
  }

  async function doSave() {
    if (recipients.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    const final = buildFinal()
    setGenning(true)
    try {
      await saveCertAwards(final.map((r) => ({ participant_id: r.participant_id, award: r.award })))
      toast("บันทึกผลรางวัลแล้ว", "success")
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false) }
  }

  async function doPublish() {
    if (recipients.length === 0) return toast("ยังไม่มีรายชื่อ", "error")
    const final = buildFinal()
    const ok = await confirm?.({ title: "แจกเกียรติบัตร?", message: `ผู้สมัคร ${final.length} คน จะเห็นเกียรติบัตรในหน้า "รายการสมัครของฉัน"`, confirmText: "แจกเลย" }) ?? true
    if (!ok) return
    setGenning(true)
    try {
      await saveCertAwards(final.map((r) => ({ participant_id: r.participant_id, award: r.award })))
      await publishCertificates(final.map((r) => r.participant_id))
      toast("แจกเกียรติบัตรเรียบร้อย", "success")
    } catch (e) { toast("แจกไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false) }
  }

  async function doPreview(r, label) {
    if (!templateUrl) return toast("กรุณาอัปโหลดรูปพื้นหลังก่อน", "error")
    try {
      const url = await previewCertificate({ templateUrl, recipient: { ...r, award: label }, fields, fontFamily: FONT })
      setPreviewUrl(url)
    } catch (e) { toast("สร้างตัวอย่างไม่สำเร็จ: " + e.message, "error") }
  }

  async function doGenerate() {
    if (!templateUrl) return toast("กรุณาอัปโหลดรูปพื้นหลังก่อน", "error")
    if (recipients.length === 0) return toast("ไม่มีรายชื่อผู้รับ", "error")
    const final = buildFinal()
    setGenning(true)
    try {
      const courseName = courses.find((c) => c.id === courseId)?.title || "certificate"
      const doc = await generateCertificatePDF({ templateUrl, recipients: final, fields, fontFamily: FONT })
      const safe = courseName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
      doc.save(`เกียรติบัตร_${safe}.pdf`)
      toast(`สร้างเกียรติบัตรแล้ว ${final.length} ใบ`, "success")
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
          <p className="text-slate-400 text-xs mt-0.5">ตั้งรูปพื้นหลัง → เลือกคอร์ส → จัดรางวัล → ออก PDF (เฉพาะคนเช็คอิน)</p>
        </div>
      </div>

      {/* รูปพื้นหลัง */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1">
          <Ico.cap className="w-4 h-4 text-[#F15A24]" /> รูปพื้นหลังเกียรติบัตร
        </label>
        <p className="text-xs text-slate-400 mb-3">อัปโหลดรูปเทมเพลต (แนวนอน) — ระบบวางชื่อ/รางวัล/คอร์ส ทับบนรูป</p>
        {templateUrl ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={templateUrl} alt="template" className="w-full sm:w-72 rounded-xl border border-slate-200" />
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
          <label className="cursor-pointer block border-2 border-dashed border-slate-200 rounded-xl px-4 py-10 text-center hover:border-[#F15A24] hover:bg-orange-50/40 transition">
            <Ico.cap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <span className="text-sm font-bold text-slate-600">{uploading ? "กำลังอัปโหลด…" : "คลิกเพื่ออัปโหลดรูปพื้นหลัง"}</span>
            <span className="block text-[11px] text-slate-400 mt-1">แนวนอน (landscape) · ความละเอียดสูง · JPG / PNG</span>
            <input type="file" accept="image/*" onChange={handleTemplateFile} disabled={uploading} className="hidden" />
          </label>
        )}
      </div>

      {/* รายการรางวัล — ตั้งได้ตลอด (บันทึกทั้งงาน) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-700">รายการรางวัล</label>
          <button onClick={saveAwardNames}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
            <Ico.download className="w-3.5 h-3.5" /> บันทึกรายการรางวัล
          </button>
        </div>

        {/* เลือกคอร์ส */}
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1.5">เลือกคอร์ส (เพื่อจับคู่ผู้สมัคร)</label>
          <select value={courseId} onChange={(e) => loadRecipients(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm bg-white">
            <option value="">— เลือกคอร์ส —</option>
            {(Array.isArray(courses) ? courses : []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {loading && <p className="text-sm text-slate-400 text-center py-2">กำลังโหลดรายชื่อ…</p>}
        <p className="text-xs text-slate-400">
          {!courseId ? "พิมพ์ชื่อรางวัลแล้วกดบันทึก · เลือกคอร์สเพื่อจับคู่ผู้สมัคร"
            : recipients.length > 0 ? `มีผู้เช็คอิน ${recipients.length} คน · ค้นหาเพิ่มเข้ารางวัล · คนที่ไม่ได้จัด = ผู้เข้าร่วม`
            : "ยังไม่มีคนเช็คอินในคอร์สนี้ · ตั้งชื่อรางวัลไว้ก่อนได้"}
        </p>

        {/* แถวรางวัล — ขึ้นตลอด */}
        <div className="space-y-2.5">
          {rows.map((row, idx) => (
            <AwardRow key={row.id} idx={idx + 1} row={row}
              members={row.members.map(pFind).filter(Boolean)}
              pool={unassigned}
              hasRecipients={recipients.length > 0}
              onLabel={(v) => setRowLabel(row.id, v)}
              onAddMember={(pid) => addMember(row.id, pid)}
              onRemoveMember={(pid) => removeMember(row.id, pid)}
              onRemoveRow={rows.length > 1 ? () => removeRow(row.id) : null}
              onPreview={(r) => doPreview(r, row.label.trim() || "รางวัล")} />
          ))}
        </div>

        {/* ปุ่มเพิ่มแถว */}
        <button onClick={addRow}
          className="flex items-center gap-1.5 border-2 border-dashed border-slate-200 hover:border-[#F15A24] text-slate-500 hover:text-[#F15A24] rounded-xl px-4 py-2.5 text-sm font-bold transition w-full justify-center">
          <span className="text-lg leading-none">+</span> เพิ่มรางวัล
        </button>

        {/* ผู้เข้าร่วม — เฉพาะมีคนเช็คอิน */}
        {recipients.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-500 mb-2">{PARTICIPANT_LABEL} <span className="text-slate-400 font-normal">({unassigned.length} คน)</span></p>
            {unassigned.length === 0 ? (
              <p className="text-xs text-slate-400">ทุกคนถูกจัดรางวัลหมดแล้ว</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((r) => (
                  <span key={r.participant_id} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                    {r.full_name}
                    <button onClick={() => doPreview(r, PARTICIPANT_LABEL)} className="text-[#F15A24]" title="ดูตัวอย่าง"><Ico.eye className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ปุ่มบันทึกผล / โหลด / แจก — เฉพาะมีคนเช็คอิน */}
      {courseId && recipients.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row gap-3">
          <button onClick={doSave} disabled={genning}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
            <Ico.download className="w-4 h-4" /> บันทึกผลรางวัล
          </button>
          <button onClick={doGenerate} disabled={genning || !templateUrl}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
            <Ico.download className="w-4 h-4" /> {genning ? "กำลังสร้าง…" : "โหลด PDF ทั้งหมด"}
          </button>
          <button onClick={doPublish} disabled={genning}
            className="flex-1 flex items-center justify-center gap-2 bg-[#F15A24] hover:bg-[#c44215] text-white px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
            <Ico.cap className="w-4 h-4" /> ส่งเกียรติบัตร
          </button>
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

// ── แถวรางวัล 1 แถว: ซ้าย = พิมพ์ชื่อรางวัล · ขวา = search + คนที่เพิ่ม ──
function AwardRow({ idx, row, members, pool, hasRecipients, onLabel, onAddMember, onRemoveMember, onRemoveRow, onPreview }) {
  const [q, setQ] = useState("")
  const results = q.trim()
    ? pool.filter((r) =>
        (r.full_name || "").toLowerCase().includes(q.toLowerCase()) ||
        (r.school || "").toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : []

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <div className="flex gap-2 items-start">
        {/* ซ้าย: ชื่อรางวัล (พิมพ์เอง) */}
        <div className="w-40 sm:w-48 shrink-0">
          <input value={row.label} onChange={(e) => onLabel(e.target.value)}
            placeholder={`รางวัลที่ ${idx}`}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
        </div>

        {/* ขวา: search + คนที่เพิ่ม */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!hasRecipients}
              placeholder={hasRecipients ? "ค้นหาชื่อ/โรงเรียนผู้สมัคร…" : "รอคนเช็คอินก่อน…"}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] disabled:bg-slate-100 disabled:cursor-not-allowed" />
            {results.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                {results.map((r) => (
                  <button key={r.participant_id} onClick={() => { onAddMember(r.participant_id); setQ("") }}
                    className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm border-b border-slate-50 last:border-0">
                    <span className="font-medium text-slate-800">{r.full_name}</span>
                    {r.school && <span className="text-slate-400 text-xs ml-2">{r.school}</span>}
                  </button>
                ))}
              </div>
            )}
            {q.trim() && results.length === 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">ไม่พบ (อาจถูกจัดรางวัลอื่นแล้ว)</div>
            )}
          </div>

          {/* คนที่ได้รางวัลนี้ */}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {members.map((r) => (
                <span key={r.participant_id} className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-lg pl-2.5 pr-1 py-1 text-xs font-bold text-[#F15A24]">
                  {r.full_name}
                  <button onClick={() => onPreview(r)} className="text-[#F15A24]/70 hover:text-[#F15A24]" title="ดูตัวอย่าง"><Ico.eye className="w-3 h-3" /></button>
                  <button onClick={() => onRemoveMember(r.participant_id)} className="w-4 h-4 rounded-full bg-orange-200 hover:bg-rose-200 text-[#F15A24] hover:text-rose-600 flex items-center justify-center" title="เอาออก">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ลบแถว */}
        {onRemoveRow && (
          <button onClick={onRemoveRow} className="text-rose-400 hover:bg-rose-50 p-2 rounded-lg shrink-0" title="ลบรางวัลนี้"><Ico.alert className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  )
}