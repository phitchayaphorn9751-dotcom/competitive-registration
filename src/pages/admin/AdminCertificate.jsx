import { useEffect, useRef, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchCoursesAdmin, fetchCourseTypes, fetchCertificateRecipients, fetchCertificateAdvisors,
  fetchCertificateRecipientsByEvent,
  fetchEventSettings, uploadCertificateTemplate, patchEventSettings,
  saveCertAwards, publishCertificates,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"
import {
  generateCertificatePDF, previewCertificate,
  DEFAULT_CERT_FIELDS, CERT_FIELD_KEYS, CERT_FIELD_LABELS,
  CERT_TEMPLATE_KEYS, CERT_TEMPLATE_LABELS, normalizeCertTemplates, winnerKeyOf,
  CERT_FONT, safeFileName, autoLayoutFromUrl, stripTitle,
} from "../../lib/certificate.js"

const FONT = CERT_FONT

// ── โหมดของหมวดหมู่ ─────────────────────────────────────────────────
// competition = มีรางวัล (แข่งขัน) · attendance = ทุกคนได้ข้อความเดียวกัน (อบรม/workshop)
const MODE_COMPETITION = "competition"
const MODE_ATTENDANCE = "attendance"
const DEFAULT_LABEL = { [MODE_COMPETITION]: "ผู้เข้าร่วม", [MODE_ATTENDANCE]: "เข้าร่วมอบรม" }

// ค่าตั้งต้นของหมวดที่ยังไม่เคยตั้ง
function typeCfgOf(certTypes, typeId) {
  const raw = certTypes?.[typeId] || {}
  const mode = raw.mode === MODE_ATTENDANCE ? MODE_ATTENDANCE : MODE_COMPETITION
  return { mode, participantLabel: raw.participantLabel || DEFAULT_LABEL[mode] }
}

// วิธีแบ่งกลุ่มตอนดาวน์โหลด — ได้ PDF ไฟล์เดียวต่อกลุ่ม (ภายในคอร์สที่เลือก)
const GROUP_MODES = [
  { key: "school", label: "แยกตามโรงเรียน" },
  { key: "source", label: "แยกตามที่มา (นำเข้า / สมัครเอง)" },
]
const NO_SCHOOL = "ไม่ระบุโรงเรียน"
function groupKeyOf(r, mode) {
  if (mode === "school") return (r.school || "").trim() || NO_SCHOOL
  if (mode === "source") return r.is_imported ? "ผู้จัดนำเข้า" : "สมัครเอง"
  return ""
}

// ข้อความตัวอย่างในตัวแก้ตำแหน่ง (ยาวพอให้เห็นว่าล้นกรอบไหม)
const SAMPLE = {
  full_name: "เด็กหญิงตัวอย่าง นามสกุลยาวมากพอสมควร",
  award: "รางวัลชนะเลิศ",
  course_title: "การแข่งขันตัวอย่าง",
}

// ─ หมายเหตุ: ใบเกียรติบัตรวาดแค่ชื่อผู้รับ + ชื่อคอร์ส
//   ชื่อรางวัลไม่ได้วาดทับรูป เพราะอยู่ในดีไซน์ของเทมเพลตแต่ละแบบแล้ว
//   แต่ยังเก็บลง participants.award เหมือนเดิม (ใช้เลือกว่าจะพิมพ์ด้วยเทมเพลตไหน)

const newRow = (label = "", tpl = "") => ({ id: "r" + Math.random().toString(36).slice(2, 9), label, tpl, members: [] })

// แถวตั้งต้นของคอร์สแข่งขันที่ยังไม่เคยตั้งรางวัล — เฉพาะ 3 แถวชนะ
// ไม่ต้องมีแถว "ผู้เข้าร่วม"/"อบรม" เพราะระบบจัดให้อัตโนมัติอยู่แล้ว:
//   คนที่ไม่ได้อยู่แถวไหน → ผู้เข้าร่วม (เทมเพลต participant)
//   คอร์สหมวดอบรม        → ทุกคนได้เทมเพลต training ไม่มีแถวรางวัล
const WINNER_KEYS = ["winner1", "winner2", "winner3"]
const DEFAULT_ROW_LABELS = {
  winner1: "รางวัลที่ 1",
  winner2: "รางวัลที่ 2",
  winner3: "รางวัลที่ 3",
}
const seedRows = () => WINNER_KEYS.map((k) => newRow(DEFAULT_ROW_LABELS[k], k))

export default function AdminCertificate() {
  const { event } = useOutletContext()
  const { toast, confirm } = useDialog()

  const [courses, setCourses] = useState([])
  const [types, setTypes] = useState([])
  const [courseId, setCourseId] = useState("")
  const [recipients, setRecipients] = useState([])
  const [advisors, setAdvisors] = useState([])       // ครูที่ปรึกษาของคอร์สที่เลือก
  const [loading, setLoading] = useState(false)
  const [genning, setGenning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [groupMode, setGroupMode] = useState("")
  const [openPanel, setOpenPanel] = useState("")   // "template" | "layout" | "awards" | "types" | ""

  // ── ค่าตั้งทั้งงาน (เก็บใน event_settings) ──
  const [templates, setTemplates] = useState(() => normalizeCertTemplates(null))  // 6 แบบ { key: {url, fields} }
  const [layoutKey, setLayoutKey] = useState("participant")  // เทมเพลตที่กำลังแก้ตำแหน่งอยู่
  const [baseAwards, setBaseAwards] = useState([])        // รายการรางวัลกลาง — พิมพ์ครั้งเดียว
  const [awardTpl, setAwardTpl] = useState({})            // { [ชื่อรางวัล]: templateKey } — override ต่อชื่อรางวัล
  const [certTypes, setCertTypes] = useState({})          // { [typeId]: {mode, participantLabel} }
  const [courseAwards, setCourseAwards] = useState({})    // { [courseId]: string[] } — คอร์สที่แก้เฉพาะตัว

  // ── แถวรางวัลของคอร์สที่กำลังทำ ──
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!event?.id) return
    fetchCoursesAdmin(event.id).then((d) => setCourses(d || [])).catch(() => {})
    fetchCourseTypes(event.id).then((d) => setTypes(d || [])).catch(() => {})
    fetchEventSettings(event.id).then((es) => {
      // รองรับข้อมูลเก่าที่มีรูป/ตำแหน่งเดียว → ใช้เป็นค่าตั้งต้นของทุกแบบ
      setTemplates(normalizeCertTemplates(es.cert_templates, es.cert_template_url, es.cert_fields))
      setAwardTpl(es.cert_award_tpl && typeof es.cert_award_tpl === "object" ? es.cert_award_tpl : {})
      setBaseAwards(Array.isArray(es.cert_awards) ? es.cert_awards.filter(Boolean) : [])
      setCertTypes(es.cert_types && typeof es.cert_types === "object" ? es.cert_types : {})
      setCourseAwards(es.cert_course_awards && typeof es.cert_course_awards === "object" ? es.cert_course_awards : {})
    }).catch(() => {})
  }, [event?.id])

  // ── ข้อมูลของคอร์สที่เลือก ──
  const course = courses.find((c) => c.id === courseId) || null
  const type = course ? types.find((t) => t.id === course.type_id) || null : null
  const cfg = typeCfgOf(certTypes, course?.type_id)
  const isAttendance = cfg.mode === MODE_ATTENDANCE
  const hasOverride = courseId ? Object.prototype.hasOwnProperty.call(courseAwards, courseId) : false

  // ═══════════════════ รูปพื้นหลัง (6 แบบ) ═══════════════════
  async function handleTemplateFile(e, key) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!event?.id) return toast("ยังไม่ได้เลือกงาน", "error")
    setUploading(key)
    try {
      const url = await uploadCertificateTemplate(file, event.id, key)
      const next = { ...templates, [key]: { ...templates[key], url } }
      setTemplates(next)
      await patchEventSettings(event.id, { cert_templates: next })
      toast(`ตั้งรูป "${CERT_TEMPLATE_LABELS[key]}" เรียบร้อย`, "success")
    } catch (err) { toast("อัปโหลดไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(""); e.target.value = "" }
  }
  async function removeTemplate(key) {
    if (!event?.id) return
    try {
      const next = { ...templates, [key]: { ...templates[key], url: "" } }
      setTemplates(next)
      await patchEventSettings(event.id, { cert_templates: next })
      toast("ลบรูปแล้ว", "success")
    } catch (err) { toast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  // ═══════════════════ บันทึกค่าตั้งทั้งงาน ═══════════════════
  async function persist(patch, okMsg) {
    setSavingCfg(true)
    try { await patchEventSettings(event.id, patch); toast(okMsg, "success") }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
    finally { setSavingCfg(false) }
  }
  const saveFields = () => persist({ cert_templates: templates }, "บันทึกตำแหน่งข้อความแล้ว")
  const saveBaseAwards = () => persist({ cert_awards: baseAwards.map((a) => a.trim()).filter(Boolean) }, "บันทึกรายการรางวัลกลางแล้ว")
  const saveCertTypes = () => persist({ cert_types: certTypes }, "บันทึกค่าตามหมวดหมู่แล้ว")

  // แก้ตำแหน่งข้อความของเทมเพลตที่กำลังเลือกอยู่ (layoutKey)
  const fields = templates[layoutKey].fields
  function setField(fieldKey, patch) {
    setTemplates((t) => ({
      ...t,
      [layoutKey]: { ...t[layoutKey], fields: { ...t[layoutKey].fields, [fieldKey]: { ...t[layoutKey].fields[fieldKey], ...patch } } },
    }))
  }
  function resetFields() {
    setTemplates((t) => ({ ...t, [layoutKey]: { ...t[layoutKey], fields: DEFAULT_CERT_FIELDS } }))
  }
  // วิเคราะห์รูปเทมเพลตแล้วเดาตำแหน่งให้ (ยังต้องตรวจ/ปรับเองอีกที)
  const [autoBusy, setAutoBusy] = useState(false)
  async function autoLayout() {
    setAutoBusy(true)
    try {
      const guess = await autoLayoutFromUrl(templates[layoutKey].url)
      setTemplates((t) => ({ ...t, [layoutKey]: { ...t[layoutKey], fields: guess } }))
      toast("จัดตำแหน่งให้แล้ว — ตรวจดูอีกทีก่อนบันทึก", "success")
    } catch (e) { toast("วิเคราะห์รูปไม่สำเร็จ: " + e.message, "error") }
    finally { setAutoBusy(false) }
  }

  // เทมเพลตของแถวรางวัลลำดับที่ i — ใช้ที่ตั้งไว้ต่อชื่อรางวัล ถ้าไม่มีก็ไล่ตามลำดับแถว
  function rowTplOf(row, i) {
    return row.tpl || awardTpl[row.label.trim()] || winnerKeyOf(i)
  }
  function setRowTpl(id, tpl) { setRows((rs) => rs.map((r) => r.id === id ? { ...r, tpl } : r)) }
  function setTypeCfg(typeId, patch) {
    setCertTypes((m) => ({ ...m, [typeId]: { ...typeCfgOf(m, typeId), ...patch } }))
  }

  // ═══════════════════ เลือกคอร์ส ═══════════════════
  async function loadRecipients(cid) {
    setCourseId(cid); setRecipients([]); setAdvisors([]); setPreviewUrl(""); setGroupMode("")
    if (!cid) { setRows([]); return }
    fetchCertificateAdvisors(cid).then(setAdvisors).catch(() => setAdvisors([]))
    // แถวเริ่มต้น = ของคอร์สนี้ถ้าเคยแก้ไว้ ไม่งั้นใช้ค่ากลาง
    const labels = Object.prototype.hasOwnProperty.call(courseAwards, cid) ? courseAwards[cid] : baseAwards
    const start = (labels || []).filter(Boolean).map((l) => newRow(l))
    setLoading(true)
    try {
      const list = await fetchCertificateRecipients(cid)
      setRecipients(list)
      const c = courses.find((x) => x.id === cid)
      const mode = typeCfgOf(certTypes, c?.type_id).mode
      // โหมดอบรมไม่มีแถวรางวัล · โหมดแข่งขันดึงผลที่เคยบันทึกกลับเข้าแถว
      setRows(mode === MODE_ATTENDANCE ? [] : rehydrateRows(start.length ? start : seedRows(), list, cfgLabelOf(certTypes, c?.type_id)))
    } catch (e) { toast("โหลดรายชื่อไม่สำเร็จ: " + e.message, "error"); setRows(start.length ? start : seedRows()) }
    finally { setLoading(false) }
  }

  // ── แถวรางวัลของคอร์สนี้ ──
  function setRowLabel(id, label) { setRows((rs) => rs.map((r) => r.id === id ? { ...r, label } : r)) }
  function addRow() { setRows((rs) => [...rs, newRow()]) }
  function removeRow(id) { setRows((rs) => rs.filter((r) => r.id !== id)) }
  function addMember(rowId, pid) { setRows((rs) => rs.map((r) => r.id === rowId ? { ...r, members: [...r.members, pid] } : r)) }
  function removeMember(rowId, pid) { setRows((rs) => rs.map((r) => r.id === rowId ? { ...r, members: r.members.filter((m) => m !== pid) } : r)) }

  // บันทึกชื่อรางวัลเฉพาะคอร์สนี้ (กลายเป็น override — ค่ากลางเปลี่ยนแล้วไม่ทับ)
  // เก็บเทมเพลตที่เลือกไว้ต่อชื่อรางวัลด้วย จะได้จำได้ตอนเปิดคอร์สอื่นที่ใช้ชื่อรางวัลเดียวกัน
  async function saveCourseAwards() {
    const labels = rows.map((r) => r.label.trim()).filter(Boolean)
    const nextAwards = { ...courseAwards, [courseId]: labels }
    const nextTpl = { ...awardTpl }
    rows.forEach((r, i) => { const l = r.label.trim(); if (l) nextTpl[l] = rowTplOf(r, i) })
    setCourseAwards(nextAwards); setAwardTpl(nextTpl)
    await persist({ cert_course_awards: nextAwards, cert_award_tpl: nextTpl }, "บันทึกรางวัลเฉพาะคอร์สนี้แล้ว")
  }
  // เลิก override → กลับไปใช้ค่ากลาง
  async function resetToBase() {
    const next = { ...courseAwards }
    delete next[courseId]
    setCourseAwards(next)
    const start = baseAwards.filter(Boolean).map((l) => newRow(l))
    setRows(rehydrateRows(start.length ? start : seedRows(), recipients, cfg.participantLabel))
    await persist({ cert_course_awards: next }, "กลับไปใช้รายการรางวัลกลางแล้ว")
  }

  // ═══════════════════ รายชื่อออกใบจริง ═══════════════════
  const assignedIds = new Set(rows.flatMap((r) => r.members))
  const unassigned = recipients.filter((r) => !assignedIds.has(r.participant_id))
  const pFind = (pid) => recipients.find((r) => r.participant_id === pid)

  // แนบ templateKey ให้ทุกคน — ตัวสร้าง PDF ใช้เลือกรูป/ตำแหน่งข้อความของใบนั้น
  function buildFinal() {
    // โหมดอบรม — ทุกคนได้ข้อความเดียวกันของหมวด ไม่มีรางวัล ใช้เทมเพลต "อบรม"
    if (isAttendance) return recipients.map((p) => ({ ...p, award: cfg.participantLabel, templateKey: "training" }))
    const out = []
    rows.forEach((row, i) => {
      const label = row.label.trim() || "รางวัล"
      const templateKey = rowTplOf(row, i)
      for (const pid of row.members) {
        const p = pFind(pid)
        if (p) out.push({ ...p, award: label, templateKey })
      }
    })
    for (const p of unassigned) out.push({ ...p, award: cfg.participantLabel, templateKey: "participant" })
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
    const ok = await confirm?.({
      title: "ส่งเกียรติบัตร?",
      message: `ผู้สมัคร ${final.length} คน จะเห็นเกียรติบัตรของตัวเองในหน้า "รายการสมัครของฉัน" และโหลด PDF เองได้`,
      confirmText: "ส่งเลย",
    }) ?? true
    if (!ok) return
    setGenning(true)
    try {
      await saveCertAwards(final.map((r) => ({ participant_id: r.participant_id, award: r.award })))
      // ผูกชื่อรางวัล → เทมเพลต ก่อนส่ง — ฝั่งผู้สมัครใช้ map นี้เลือกรูปให้ตรงใบ
      const nextTpl = { ...awardTpl }
      final.forEach((r) => { if (r.award) nextTpl[r.award] = r.templateKey })
      setAwardTpl(nextTpl)
      await patchEventSettings(event.id, { cert_award_tpl: nextTpl })
      await publishCertificates(final.map((r) => r.participant_id))
      setRecipients((rs) => rs.map((r) => ({ ...r, cert_published: true })))
      toast(`ส่งเกียรติบัตรแล้ว ${final.length} คน`, "success")
    } catch (e) { toast("ส่งไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false) }
  }

  // ครูที่ปรึกษา — เทมเพลตของตัวเอง ไม่มีรางวัล ไม่ต้องเช็คอิน
  // ออกเป็น PDF ให้แอดมินอย่างเดียว ไม่มีฝั่งผู้สมัคร (ครูไม่มีบัญชีในระบบ)
  function buildAdvisors() {
    return advisors.map((a) => ({
      full_name: a.full_name,
      course_title: a.course_title,
      award: "ครูที่ปรึกษา",
      templateKey: "advisor",
    }))
  }
  async function doGenerateAdvisors() {
    const list = buildAdvisors()
    if (list.length === 0) return toast("คอร์สนี้ไม่มีครูที่ปรึกษา", "error")
    await doGenerate(list, "ครูที่ปรึกษา")
  }

  // ═══════════════════ ค้นหา & โหลดข้ามคอร์ส ═══════════════════
  const [allRecipients, setAllRecipients] = useState(null)   // null = ยังไม่โหลด
  const [searchLoading, setSearchLoading] = useState(false)
  const [q, setQ] = useState("")
  const [srcFilter, setSrcFilter] = useState("all")          // all | self | imported
  const [picked, setPicked] = useState(() => new Set())

  async function loadAllRecipients() {
    if (allRecipients || searchLoading) return
    setSearchLoading(true)
    try { setAllRecipients(await fetchCertificateRecipientsByEvent(event.id)) }
    catch (e) { toast("โหลดรายชื่อทั้งงานไม่สำเร็จ: " + e.message, "error"); setAllRecipients([]) }
    finally { setSearchLoading(false) }
  }

  // เทมเพลตของคนคนหนึ่ง — ครูที่ปรึกษาใช้แบบของตัวเอง ที่เหลือดูหมวดคอร์ส + ชื่อรางวัล
  function tplKeyFor(r) {
    if (r.kind === "advisor") return "advisor"
    const c = typeCfgOf(certTypes, r.type_id)
    if (c.mode === MODE_ATTENDANCE) return "training"
    const a = (r.award || "").trim()
    if (!a || a === c.participantLabel) return "participant"
    return awardTpl[a] || "participant"
  }

  const searchHits = (() => {
    const list = allRecipients || []
    const kw = q.trim().toLowerCase()
    return list.filter((r) => {
      if (srcFilter === "self" && (r.is_imported || r.kind === "advisor")) return false
      if (srcFilter === "imported" && (!r.is_imported || r.kind === "advisor")) return false
      if (srcFilter === "advisor" && r.kind !== "advisor") return false
      if (srcFilter === "student" && r.kind === "advisor") return false
      if (!kw) return true
      return [r.full_name, r.course_title, r.theme_name, r.school, r.award]
        .some((v) => (v || "").toLowerCase().includes(kw))
    })
  })()

  function togglePick(id) {
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const pickedList = searchHits.filter((r) => picked.has(r.participant_id))

  async function doGenerateSearch(list, label) {
    if (!list.length) return toast("ไม่มีรายชื่อให้ออกใบ", "error")
    await doGenerateFree(list.map((r) => ({ ...r, templateKey: tplKeyFor(r) })), label)
  }

  // สร้าง PDF จากรายชื่ออิสระ (ไม่ผูกกับคอร์สที่เลือกอยู่) — ตั้งชื่อไฟล์เอง
  async function doGenerateFree(final, fileLabel) {
    const missing = [...new Set(final.map((r) => r.templateKey))].filter((k) => !templates[k]?.url)
    if (missing.length) return toast(`ยังไม่ได้อัปโหลดรูป: ${missing.map((k) => CERT_TEMPLATE_LABELS[k]).join(", ")}`, "error")
    setGenning(true); setProgress({ done: 0, total: final.length })
    try {
      const doc = await generateCertificatePDF({
        templates, recipients: final, fontFamily: FONT,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      doc.save(`เกียรติบัตร_${safeFileName(fileLabel, 40)}.pdf`)
      toast(`สร้างเกียรติบัตรแล้ว ${final.length} ใบ`, "success")
    } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false); setProgress(null) }
  }

  async function doPreview(r, label, key = "participant") {
    const t = templates[key] || templates.participant
    if (!t?.url) return toast(`ยังไม่ได้อัปโหลดรูปของเทมเพลต "${CERT_TEMPLATE_LABELS[key]}"`, "error")
    try {
      setPreviewUrl(await previewCertificate({ templateUrl: t.url, recipient: { ...r, award: label }, fields: t.fields, fontFamily: FONT }))
    } catch (e) { toast("สร้างตัวอย่างไม่สำเร็จ: " + e.message, "error") }
  }

  async function doGenerate(list = null, groupLabel = "") {
    const final = list || buildFinal()
    if (final.length === 0) return toast("ไม่มีรายชื่อผู้รับ", "error")
    // เช็คว่าเทมเพลตที่ต้องใช้จริงในชุดนี้มีรูปครบไหม (ไม่ต้องมีครบทั้ง 5)
    const missing = [...new Set(final.map((r) => r.templateKey))].filter((k) => !templates[k]?.url)
    if (missing.length) return toast(`ยังไม่ได้อัปโหลดรูป: ${missing.map((k) => CERT_TEMPLATE_LABELS[k]).join(", ")}`, "error")
    setGenning(true); setProgress({ done: 0, total: final.length })
    try {
      const doc = await generateCertificatePDF({
        templates, recipients: final, fontFamily: FONT,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const suffix = groupLabel ? `_${safeFileName(groupLabel, 30)}` : ""
      doc.save(`เกียรติบัตร_${safeFileName(course?.title || "certificate", 30)}${suffix}.pdf`)
      toast(`สร้างเกียรติบัตรแล้ว ${final.length} ใบ${groupLabel ? ` (${groupLabel})` : ""}`, "success")
    } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + e.message, "error") }
    finally { setGenning(false); setProgress(null) }
  }

  const groups = groupMode
    ? [...buildFinal().reduce((m, r) => {
        const k = groupKeyOf(r, groupMode)
        m.set(k, [...(m.get(k) || []), r]); return m
      }, new Map())]
      .map(([label, list]) => ({ label, list }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"))
    : []

  const publishedCount = recipients.filter((r) => r.cert_published).length
  const tplReady = CERT_TEMPLATE_KEYS.filter((k) => templates[k]?.url).length

  if (!event) return <div className="bg-white rounded-2xl p-12 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีงาน — สร้างงานในเมนูตั้งค่าเว็บ</div>

  const panel = (key) => ({ open: openPanel === key, toggle: () => setOpenPanel((p) => p === key ? "" : key) })

  return (
    <div className="max-w-5xl space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.cap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">ออกเกียรติบัตร</h1>
          <p className="text-slate-400 text-xs mt-0.5">ตั้งค่าครั้งเดียวใช้ทั้งงาน → เลือกคอร์ส → จัดรางวัล → ออก PDF / ส่งให้ผู้สมัคร</p>
        </div>
      </div>

      {/* ══════════ ส่วนที่ 1: ค้นหา & โหลดข้ามคอร์ส ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-extrabold text-slate-700">ค้นหา &amp; โหลดเกียรติบัตร <span className="text-slate-400 font-bold">· ทั้งงาน</span></p>
            <p className="text-[11px] text-slate-400 mt-0.5">ค้นด้วยชื่อคน · ชื่อรายการ · ชื่อทีม · โรงเรียน · ชื่อรางวัล — ข้ามคอร์สได้</p>
          </div>
          {allRecipients === null && (
            <button onClick={loadAllRecipients} disabled={searchLoading}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50">
              {searchLoading ? "กำลังโหลด…" : "โหลดรายชื่อทั้งงาน"}
            </button>
          )}
        </div>

        {allRecipients !== null && (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="พิมพ์ชื่อคน / ชื่อรายการ / ชื่อทีม…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
              </div>
              {[["all", "ทั้งหมด"], ["student", "นักเรียน"], ["advisor", "ครูที่ปรึกษา"], ["self", "สมัครเอง"], ["imported", "นำเข้า"]].map(([k, label]) => (
                <button key={k} onClick={() => setSrcFilter(k)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition ${srcFilter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">เจอ <b className="text-slate-700">{searchHits.length}</b> คน{picked.size > 0 && <> · เลือกไว้ <b className="text-[#F15A24]">{pickedList.length}</b></>}</span>
              <button onClick={() => setPicked(new Set(searchHits.map((r) => r.participant_id)))}
                className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition">เลือกทั้งหมดที่เจอ</button>
              {picked.size > 0 && (
                <button onClick={() => setPicked(new Set())}
                  className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition">ล้างที่เลือก</button>
              )}
              <div className="flex-1" />
              <button onClick={() => doGenerateSearch(pickedList, `เลือก_${pickedList.length}ใบ`)}
                disabled={genning || pickedList.length === 0}
                className="inline-flex items-center gap-1.5 bg-[#F15A24] hover:bg-[#c44215] text-white px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50">
                <Ico.download className="w-3.5 h-3.5" /> โหลดที่เลือก ({pickedList.length})
              </button>
              <button onClick={() => doGenerateSearch(searchHits, q.trim() || "ทั้งงาน")}
                disabled={genning || searchHits.length === 0}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50">
                <Ico.download className="w-3.5 h-3.5" /> โหลดทั้งหมดที่เจอ ({searchHits.length})
              </button>
            </div>

            {searchHits.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-xl">
                {allRecipients.length === 0
                  ? "ยังไม่มีใครเช็คอินในงานนี้ — ส่วนนี้จะมีข้อมูลหลังเริ่มเช็คอินแล้ว"
                  : "ไม่พบรายชื่อที่ตรงกับคำค้น"}
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                {searchHits.slice(0, 300).map((r) => (
                  <label key={r.participant_id}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-50 last:border-0 hover:bg-orange-50/40 cursor-pointer">
                    <input type="checkbox" checked={picked.has(r.participant_id)} onChange={() => togglePick(r.participant_id)}
                      className="w-4 h-4 accent-[#F15A24] shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{r.full_name}</span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {r.course_title}{r.theme_name && ` · ${r.theme_name}`}{r.school && ` · ${r.school}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                      {CERT_TEMPLATE_LABELS[tplKeyFor(r)]}
                    </span>
                    {r.kind === "advisor"
                      ? <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100">ครู{r.team_count > 1 ? ` ·${r.team_count} ทีม` : ""}</span>
                      : r.is_imported && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100">นำเข้า</span>}
                    <button onClick={(e) => { e.preventDefault(); doGenerateSearch([r], r.full_name) }}
                      disabled={genning} title="โหลดใบนี้ใบเดียว"
                      className="shrink-0 text-slate-400 hover:text-[#F15A24] p-1 rounded-lg transition disabled:opacity-40">
                      <Ico.download className="w-4 h-4" />
                    </button>
                  </label>
                ))}
                {searchHits.length > 300 && (
                  <p className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50">
                    แสดง 300 แถวแรกจาก {searchHits.length} · ปุ่ม "โหลดทั้งหมดที่เจอ" ยังรวมครบทุกคน
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              รวมสมาชิกในทีมทุกคน และครูที่ปรึกษา · เทมเพลตของแต่ละคนคิดจากหมวดคอร์ส + ชื่อรางวัลที่บันทึกไว้ (ป้ายขวามือ) ·
              คนที่ยังไม่ได้บันทึกผลรางวัลจะขึ้นเป็น "{CERT_TEMPLATE_LABELS.participant}" ·
              <b className="text-slate-500">ครูที่ปรึกษาได้ใบเมื่อมีลูกทีมมาเช็คอินอย่างน้อย 1 คน</b> (ครูไม่มีรหัสเช็คอินของตัวเอง) ·
              รายชื่อนี้โหลดครั้งเดียวตอนกดปุ่ม — บันทึกรางวัลเพิ่มแล้วรีเฟรชหน้าเพื่อดูค่าล่าสุด
            </p>
          </>
        )}
      </div>

      {/* ══════════ ส่วนที่ 2: ตั้งค่าทั้งงาน ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-sm font-extrabold text-slate-700">ตั้งค่าเกียรติบัตร <span className="text-slate-400 font-bold">· ใช้ร่วมทั้งงาน</span></p>
          <p className="text-[11px] text-slate-400 mt-0.5">ตั้งครั้งเดียว ทุกรายการแข่งขันใช้ค่านี้ — แก้เฉพาะบางคอร์สได้ในส่วนด้านล่าง</p>
        </div>

        {/* 1.1 รูปพื้นหลัง — 6 แบบ */}
        <Section
          title={`รูปพื้นหลังเกียรติบัตร (${CERT_TEMPLATE_KEYS.length} แบบ)`}
          desc={`ตั้งแล้ว ${tplReady}/${CERT_TEMPLATE_KEYS.length} แบบ${tplReady === 0 ? " — ต้องมีอย่างน้อย 1 ถึงออก PDF ได้" : ""}`}
          tone={tplReady === CERT_TEMPLATE_KEYS.length ? "ok" : tplReady > 0 ? "" : "warn"} {...panel("template")}>
          <p className="text-xs text-slate-400 mb-3">
            ขนาดหน้า PDF ยึดสัดส่วนรูปแต่ละแบบ (ไม่ยืด) · เก็บไฟล์ต้นฉบับไม่บีบอัด — พิมพ์ A4 แนะนำกว้าง 3508px (300 DPI) ·
            อัปเฉพาะแบบที่ใช้จริงก็ได้ ไม่ต้องครบทุกแบบ
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {CERT_TEMPLATE_KEYS.map((k) => (
              <div key={k} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-700">{CERT_TEMPLATE_LABELS[k]}</span>
                  {templates[k].url
                    ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">พร้อม</span>
                    : <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">ยังไม่มีรูป</span>}
                </div>
                {templates[k].url && (
                  <img src={templates[k].url} alt={k} className="w-full rounded-lg border border-slate-200 mb-2" />
                )}
                <div className="flex gap-1.5">
                  <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                    <Ico.cap className="w-3.5 h-3.5" />
                    {uploading === k ? "กำลังอัปโหลด…" : templates[k].url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                    <input type="file" accept="image/*" onChange={(e) => handleTemplateFile(e, k)} disabled={!!uploading} className="hidden" />
                  </label>
                  {templates[k].url && (
                    <button onClick={() => removeTemplate(k)} className="text-rose-400 hover:bg-rose-50 px-2 rounded-lg transition" title="ลบรูป">
                      <Ico.alert className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 1.2 ตำแหน่งข้อความ — แยกต่อเทมเพลต */}
        <Section title="ตำแหน่งข้อความบนใบ" desc="เลือกแบบ แล้วลากป้ายบนรูป · แต่ละแบบตั้งตำแหน่งของตัวเอง"
          disabled={tplReady === 0} disabledHint="อัปโหลดรูปอย่างน้อย 1 แบบก่อน" {...panel("layout")}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {CERT_TEMPLATE_KEYS.map((k) => (
                <button key={k} onClick={() => setLayoutKey(k)} disabled={!templates[k].url}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    layoutKey === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {CERT_TEMPLATE_LABELS[k]}
                </button>
              ))}
            </div>

            {templates[layoutKey].url ? (
              <>
                <LayoutCanvas templateUrl={templates[layoutKey].url} fields={fields} onMove={setField}
                  sample={{ name: stripTitle(SAMPLE.full_name), course: course?.title || SAMPLE.course_title }} />
                <div className="grid sm:grid-cols-2 gap-3">
                  {CERT_FIELD_KEYS.map((k) => (
                    <FieldControls key={k} fieldKey={k} cfg={fields[k]} onChange={(patch) => setField(k, patch)} />
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <SaveBtn onClick={saveFields} busy={savingCfg}>บันทึกตำแหน่งข้อความ (ทุกแบบ)</SaveBtn>
                  <button onClick={autoLayout} disabled={autoBusy}
                    className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50">
                    <Ico.eye className="w-4 h-4" style={{ color: "#fb923c" }} />
                    {autoBusy ? "กำลังวิเคราะห์…" : "จัดตำแหน่งอัตโนมัติ"}
                  </button>
                  <button onClick={() => doPreview({ ...SAMPLE }, SAMPLE.award, layoutKey)}
                    className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold transition">
                    <Ico.eye className="w-4 h-4" /> ดูใบตัวอย่างจริง
                  </button>
                  <button onClick={resetFields}
                    className="flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-bold transition">
                    คืนค่าเริ่มต้น
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8 bg-slate-50 rounded-xl">แบบนี้ยังไม่มีรูป — อัปโหลดในส่วนด้านบนก่อน</p>
            )}

            <p className="text-[11px] text-slate-400">
              <b className="text-slate-500">จัดตำแหน่งอัตโนมัติ</b> — ระบบสแกนรูปหาที่ว่างและบรรทัดที่มีข้อความอยู่
              แล้ววางชื่อกลางช่องว่างที่กว้างที่สุด ส่วนชื่อคอร์สจะต่อท้ายข้อความที่พิมพ์ไว้ในเทมเพลต (ถ้าเจอ)
              เป็นการเดาจากภาพ ไม่ได้อ่านข้อความ — <b className="text-slate-500">ต้องตรวจและปรับเองอีกที</b> ·
              ข้อความยาวเกินกรอบ ระบบจะย่อฟอนต์ก่อนแล้วค่อยตัดบรรทัด · ปุ่มบันทึกเก็บตำแหน่งของทุกแบบพร้อมกัน
            </p>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <b>ชื่อคอร์สยาวไม่เท่ากันทุกคอร์ส</b> — ถ้าอยากให้หัวข้อความเริ่มตรงจุดเดียวกันเสมอ
              ตั้ง <b>จัดชิด = ชิดซ้าย</b> แล้วลากให้ขอบซ้ายของข้อความอยู่ตรงที่ต้องการ
              (ถ้าใช้กึ่งกลาง จุดเริ่มจะขยับตามความยาวชื่อ) · เลือกคอร์สด้านล่างก่อน
              ข้อความตัวอย่างจะเปลี่ยนเป็นชื่อคอร์สจริงให้เทียบได้เลย
            </p>
          </div>
        </Section>

        {/* 1.3 รายการรางวัลกลาง */}
        <Section title="รายการรางวัลกลาง"
          desc={baseAwards.length ? `${baseAwards.length} รางวัล — ทุกรายการแข่งขันใช้ชุดนี้` : "ยังไม่ได้ตั้ง — พิมพ์ครั้งเดียวใช้ได้ทุกรายการ"}
          tone={baseAwards.length ? "ok" : "warn"} {...panel("awards")}>
          <p className="text-xs text-slate-400 mb-3">
            พิมพ์ครั้งเดียว เช่น "รางวัลชนะเลิศ" → ทุกรายการแข่งขันจะมีรางวัลนี้เหมือนกัน · คอร์สไหนอยากได้ต่างจากนี้ ไปแก้ในส่วน "ออกเกียรติบัตร" ด้านล่าง
          </p>
          <div className="space-y-2">
            {baseAwards.map((a, i) => (
              <div key={i} className="flex gap-2">
                <span className="w-7 h-9 shrink-0 flex items-center justify-center text-xs font-bold text-slate-400">{i + 1}</span>
                <input value={a} onChange={(e) => setBaseAwards((xs) => xs.map((x, j) => j === i ? e.target.value : x))}
                  placeholder={`ชื่อรางวัลที่ ${i + 1}`}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
                <button onClick={() => setBaseAwards((xs) => xs.filter((_, j) => j !== i))}
                  className="text-rose-400 hover:bg-rose-50 p-2 rounded-lg shrink-0" title="ลบ"><Ico.alert className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => setBaseAwards((xs) => [...xs, ""])}
              className="flex items-center gap-1.5 border-2 border-dashed border-slate-200 hover:border-[#F15A24] text-slate-500 hover:text-[#F15A24] rounded-xl px-4 py-2.5 text-sm font-bold transition w-full justify-center">
              <span className="text-lg leading-none">+</span> เพิ่มรางวัล
            </button>
            <SaveBtn onClick={saveBaseAwards} busy={savingCfg} full>บันทึกรายการรางวัลกลาง</SaveBtn>
            {Object.keys(courseAwards).length > 0 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                มี {Object.keys(courseAwards).length} คอร์สที่ตั้งรางวัลเฉพาะตัวไว้ — คอร์สเหล่านั้นจะไม่โดนค่ากลางทับ
              </p>
            )}
          </div>
        </Section>

        {/* 1.4 ตั้งค่าตามหมวดหมู่ */}
        <Section title="ค่าตามหมวดหมู่" desc={`${types.length} หมวด — เลือกว่าหมวดไหนแข่งขัน หมวดไหนอบรม`} {...panel("types")} last>
          <p className="text-xs text-slate-400 mb-3">
            หมวด "อบรม" จะไม่มีการจัดรางวัล — ทุกคนที่เช็คอินได้ข้อความเดียวกันหมด (เช่น workshop ที่เก็บค่าสมัคร)
          </p>
          {types.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีหมวดหมู่ — สร้างได้ในเมนูตั้งค่าเว็บ</p>
          ) : (
            <div className="space-y-2">
              {types.map((t) => {
                const c = typeCfgOf(certTypes, t.id)
                const att = c.mode === MODE_ATTENDANCE
                return (
                  <div key={t.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color || "#94a3b8" }} />
                      <span className="font-bold text-sm text-slate-800 flex-1 min-w-0 truncate">{t.label}</span>
                      <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0">
                        <button onClick={() => setTypeCfg(t.id, { mode: MODE_COMPETITION, participantLabel: DEFAULT_LABEL[MODE_COMPETITION] })}
                          className={`px-3 py-1.5 text-xs font-bold transition ${!att ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>
                          แข่งขัน
                        </button>
                        <button onClick={() => setTypeCfg(t.id, { mode: MODE_ATTENDANCE, participantLabel: DEFAULT_LABEL[MODE_ATTENDANCE] })}
                          className={`px-3 py-1.5 text-xs font-bold transition ${att ? "bg-[#F15A24] text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>
                          อบรม
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                        {att ? "ข้อความบนใบ (ทุกคนได้เหมือนกัน)" : "ข้อความสำหรับคนที่ไม่ได้รางวัล"}
                      </span>
                      <input value={c.participantLabel} onChange={(e) => setTypeCfg(t.id, { participantLabel: e.target.value })}
                        placeholder={DEFAULT_LABEL[c.mode]}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
                    </label>
                  </div>
                )
              })}
              <SaveBtn onClick={saveCertTypes} busy={savingCfg} full>บันทึกค่าตามหมวดหมู่</SaveBtn>
            </div>
          )}
        </Section>
      </div>

      {/* ══════════ ส่วนที่ 3: ออกเกียรติบัตรรายคอร์ส ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div>
          <p className="text-sm font-extrabold text-slate-700 mb-2">ออกเกียรติบัตร <span className="text-slate-400 font-bold">· รายคอร์ส</span></p>
          <select value={courseId} onChange={(e) => loadRecipients(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm bg-white">
            <option value="">— เลือกคอร์ส —</option>
            {(Array.isArray(courses) ? courses : []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {/* แถบสถานะของคอร์สที่เลือก */}
        {course && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {type && (
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold">
                <span className="w-2 h-2 rounded-full" style={{ background: type.color || "#94a3b8" }} /> {type.label}
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-lg font-bold ${isAttendance ? "bg-orange-50 text-[#F15A24] border border-orange-200" : "bg-slate-900 text-white"}`}>
              {isAttendance ? "อบรม — ไม่มีรางวัล" : "แข่งขัน — จัดรางวัลได้"}
            </span>
            {!isAttendance && (
              <span className={`px-2.5 py-1 rounded-lg font-bold ${hasOverride ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"}`}>
                {hasOverride ? "รางวัลเฉพาะคอร์สนี้" : "ใช้รายการรางวัลกลาง"}
              </span>
            )}
            {recipients.length > 0 && (
              <span className="px-2.5 py-1 rounded-lg font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                เช็คอิน {recipients.length} คน{publishedCount > 0 ? ` · ส่งแล้ว ${publishedCount}` : ""}
              </span>
            )}
          </div>
        )}

        {loading && <p className="text-sm text-slate-400 text-center py-2">กำลังโหลดรายชื่อ…</p>}

        {courseId && !loading && recipients.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-xl">
            ยังไม่มีคนเช็คอินในคอร์สนี้ (นับเฉพาะใบสมัครที่ยืนยันแล้ว)
          </p>
        )}

        {/* ── โหมดอบรม: ไม่มีแถวรางวัล ── */}
        {courseId && isAttendance && recipients.length > 0 && (
          <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-4">
            <p className="text-sm font-bold text-[#F15A24] mb-1">ทุกคนได้ข้อความเดียวกัน</p>
            <p className="text-sm text-slate-700">
              ผู้เช็คอินทั้ง <b>{recipients.length}</b> คน จะได้ข้อความ <b>"{cfg.participantLabel}"</b> บนใบ
            </p>
            <p className="text-[11px] text-slate-400 mt-1.5">แก้ข้อความได้ที่ "ค่าตามหมวดหมู่" ด้านบน (มีผลกับทุกคอร์สในหมวด{type ? ` ${type.label}` : ""})</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {recipients.slice(0, 30).map((r) => (
                <span key={r.participant_id} className="inline-flex items-center gap-1 bg-white border border-orange-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  {r.full_name}
                  <button onClick={() => doPreview(r, cfg.participantLabel)} className="text-[#F15A24]" title="ดูตัวอย่าง"><Ico.eye className="w-3 h-3" /></button>
                </span>
              ))}
              {recipients.length > 30 && <span className="text-xs text-slate-400 self-center">…อีก {recipients.length - 30} คน</span>}
            </div>
          </div>
        )}

        {/* ── โหมดแข่งขัน: แถวรางวัล ── */}
        {courseId && !isAttendance && recipients.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-500">รางวัลของคอร์สนี้</p>
              <div className="flex gap-2">
                {hasOverride && (
                  <button onClick={resetToBase} disabled={savingCfg}
                    className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                    กลับไปใช้ค่ากลาง
                  </button>
                )}
                <button onClick={saveCourseAwards} disabled={savingCfg}
                  className="text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                  บันทึกรางวัลเฉพาะคอร์สนี้
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {rows.map((row, idx) => (
                <AwardRow key={row.id} idx={idx + 1} row={row}
                  members={row.members.map(pFind).filter(Boolean)}
                  pool={unassigned}
                  tplKey={rowTplOf(row, idx)}
                  templates={templates}
                  onTpl={(v) => setRowTpl(row.id, v)}
                  onLabel={(v) => setRowLabel(row.id, v)}
                  onAddMember={(pid) => addMember(row.id, pid)}
                  onRemoveMember={(pid) => removeMember(row.id, pid)}
                  onRemoveRow={() => removeRow(row.id)}
                  onPreview={(r) => doPreview(r, row.label.trim() || "รางวัล", rowTplOf(row, idx))} />
              ))}
            </div>

            <button onClick={addRow}
              className="flex items-center gap-1.5 border-2 border-dashed border-slate-200 hover:border-[#F15A24] text-slate-500 hover:text-[#F15A24] rounded-xl px-4 py-2.5 text-sm font-bold transition w-full justify-center">
              <span className="text-lg leading-none">+</span> เพิ่มรางวัล (เฉพาะคอร์สนี้)
            </button>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-500 mb-2">
                {cfg.participantLabel} <span className="text-slate-400 font-normal">({unassigned.length} คน)</span>
                <span className="ml-2 font-normal text-[11px] text-slate-400">
                  · คนที่ไม่ได้จัดรางวัล ได้เทมเพลต "{CERT_TEMPLATE_LABELS.participant}" อัตโนมัติ
                </span>
              </p>
              {unassigned.length === 0 ? (
                <p className="text-xs text-slate-400">ทุกคนถูกจัดรางวัลหมดแล้ว</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {unassigned.slice(0, 40).map((r) => (
                    <span key={r.participant_id} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                      {r.full_name}
                      <button onClick={() => doPreview(r, cfg.participantLabel)} className="text-[#F15A24]" title="ดูตัวอย่าง"><Ico.eye className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {unassigned.length > 40 && <span className="text-xs text-slate-400 self-center">…อีก {unassigned.length - 40} คน</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ครูที่ปรึกษา — ใบเข้าร่วม ไม่มีรางวัล ไม่ต้องเช็คอิน ── */}
        {courseId && advisors.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-bold text-slate-600">
                ครูที่ปรึกษา <span className="text-slate-400 font-normal">({advisors.length} คน)</span>
              </p>
              <button onClick={doGenerateAdvisors} disabled={genning || !templates.advisor?.url}
                title={templates.advisor?.url ? "" : "ยังไม่ได้อัปโหลดรูปเทมเพลตครูที่ปรึกษา"}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50">
                <Ico.download className="w-3.5 h-3.5" /> โหลด PDF ครูที่ปรึกษา
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {advisors.map((a) => (
                <span key={a.advisor_id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  {a.full_name}
                  {a.reg_count > 1 && <b className="text-slate-400 font-normal">·{a.reg_count} ทีม</b>}
                  <button onClick={() => doPreview({ full_name: a.full_name, course_title: a.course_title }, "ครูที่ปรึกษา", "advisor")}
                    className="text-[#F15A24]" title="ดูตัวอย่าง"><Ico.eye className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            {!templates.advisor?.url && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2.5">
                ยังไม่ได้อัปโหลดรูปเทมเพลต "{CERT_TEMPLATE_LABELS.advisor}" — ไปอัปในส่วนตั้งค่าด้านบนก่อน
              </p>
            )}
            <p className="text-[11px] text-slate-400 mt-2.5">
              ใช้เทมเพลต "{CERT_TEMPLATE_LABELS.advisor}" ทุกคน · ไม่ต้องเช็คอิน · ครูคนเดียวคุมหลายทีมได้ใบเดียว ·
              เป็นไฟล์ให้แอดมินส่งต่อเอง ไม่ขึ้นในหน้าผู้สมัคร (ครูไม่มีบัญชีในระบบ)
            </p>
          </div>
        )}

        {/* ── ปุ่มออก/ส่ง + โหลดแยกกลุ่ม ── */}
        {courseId && recipients.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 border-t border-slate-100 pt-4">
              <button onClick={doSave} disabled={genning}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
                <Ico.download className="w-4 h-4" /> บันทึกผลรางวัล
              </button>
              <button onClick={() => doGenerate()} disabled={genning || tplReady === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
                <Ico.download className="w-4 h-4" />
                {progress ? `กำลังสร้าง ${progress.done}/${progress.total}…` : genning ? "กำลังสร้าง…" : "โหลด PDF ทั้งหมด"}
              </button>
              <button onClick={doPublish} disabled={genning}
                className="flex-1 flex items-center justify-center gap-2 bg-[#F15A24] hover:bg-[#c44215] text-white px-4 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50">
                <Ico.cap className="w-4 h-4" /> ส่งเกียรติบัตร
              </button>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-bold text-slate-500">โหลดแยกกลุ่ม:</span>
                <button onClick={() => setGroupMode("")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${!groupMode ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>ไม่แยก</button>
                {GROUP_MODES.map((g) => (
                  <button key={g.key} onClick={() => setGroupMode(g.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${groupMode === g.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{g.label}</button>
                ))}
              </div>
              {!groupMode ? (
                <p className="text-[11px] text-slate-400">เลือกวิธีแยกเพื่อโหลดเฉพาะบางกลุ่ม — ได้ PDF ไฟล์เดียวต่อกลุ่ม (ส่งให้แต่ละโรงเรียนได้เลย)</p>
              ) : groups.length === 0 ? (
                <p className="text-[11px] text-slate-400">ไม่มีข้อมูลให้แบ่งกลุ่ม</p>
              ) : (
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <div key={g.label} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">{g.label}</span>
                      <span className="text-xs text-slate-400 shrink-0">{g.list.length} ใบ</span>
                      <button onClick={() => doGenerate(g.list, g.label)} disabled={genning || tplReady === 0}
                        className="shrink-0 inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50">
                        <Ico.download className="w-3.5 h-3.5" /> โหลด
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400 pt-1">
                    รวม {groups.reduce((n, g) => n + g.list.length, 0)} ใบ ใน {groups.length} กลุ่ม · ชื่อไฟล์: เกียรติบัตร_{"{คอร์ส}"}_{"{กลุ่ม}"}.pdf
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>


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

// ── ป้ายข้อความของคนที่ไม่ได้รางวัล (ใช้ตอน rehydrate) ──
function cfgLabelOf(certTypes, typeId) { return typeCfgOf(certTypes, typeId).participantLabel }

// ── ดึงผลรางวัลที่บันทึกไว้ใน DB กลับเข้าแถว ──────────────────────────
// แถวที่ชื่อตรงกับ award ใน DB → เติมคนกลับ · award ที่ไม่มีแถวรองรับ → สร้างแถวใหม่ต่อท้าย
function rehydrateRows(rows, recipients, participantLabel) {
  const byAward = new Map()
  for (const r of recipients) {
    const a = (r.award || "").trim()
    if (!a || a === participantLabel) continue   // ไม่มีรางวัล = คนทั่วไป (ไม่ต้องเข้าแถว)
    if (!byAward.has(a)) byAward.set(a, [])
    byAward.get(a).push(r.participant_id)
  }
  const next = rows.map((row) => {
    const key = row.label.trim()
    const members = key ? (byAward.get(key) || []) : []
    if (key) byAward.delete(key)
    return { ...row, members }
  })
  for (const [label, members] of byAward) next.push({ ...newRow(label), members })
  return next
}

// ── กล่องพับได้ในส่วนตั้งค่า ─────────────────────────────────────────
function Section({ title, desc, tone, disabled, disabledHint, open, toggle, last, children }) {
  const dot = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-slate-300"
  return (
    <div className={last ? "" : "border-b border-slate-100"}>
      <button onClick={disabled ? undefined : toggle} disabled={disabled}
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-700">{title}</span>
          <span className="block text-[11px] text-slate-400 truncate">{disabled ? disabledHint : desc}</span>
        </span>
        <span className={`text-slate-400 text-xl leading-none transition-transform shrink-0 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && !disabled && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

function SaveBtn({ onClick, busy, full, children }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`${full ? "w-full" : "flex-1"} flex items-center justify-center gap-2 bg-gradient-to-r from-[#F15A24] to-amber-500 hover:from-[#c44215] hover:to-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-orange-500/20 transition active:scale-95 disabled:opacity-50`}>
      <Ico.download className="w-4 h-4" /> {busy ? "กำลังบันทึก…" : children}
    </button>
  )
}

// ── รูปเทมเพลต + ข้อความตัวอย่างที่ลากวางได้ ─────────────────────────
// แสดงข้อความจริงตามขนาด/สี/น้ำหนัก/การจัดชิด ไม่ใช่แค่ป้ายชื่อฟิลด์
// จะได้เห็นว่า "หัวข้อความ" เริ่มตรงไหน — สำคัญตอนตั้งชิดซ้ายให้ทุกคอร์สเริ่มจุดเดียวกัน
function LayoutCanvas({ templateUrl, fields, sample, onMove }) {
  const boxRef = useRef(null)
  const [dragKey, setDragKey] = useState(null)
  const [boxW, setBoxW] = useState(0)

  // ต้องรู้ความกว้างจริงของกล่อง เพื่อสเกลขนาดฟอนต์ให้ตรงกับใบจริง (size อิงฐานกว้าง 1000px)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const sync = () => setBoxW(el.clientWidth)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function pointToPercent(e) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || !box.width || !box.height) return null
    return {
      x: clamp(((e.clientX - box.left) / box.width) * 100),
      y: clamp(((e.clientY - box.top) / box.height) * 100),
    }
  }
  function onPointerDown(e, key) {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragKey(key)
  }
  function onPointerMove(e) {
    if (!dragKey) return
    const p = pointToPercent(e)
    if (p) onMove(dragKey, { x: round1(p.x), y: round1(p.y) })
  }
  function onPointerUp(e) {
    if (!dragKey) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDragKey(null)
  }

  return (
    <div ref={boxRef} className="relative select-none rounded-xl overflow-hidden border border-slate-200 bg-slate-50 touch-none"
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <img src={templateUrl} alt="template" className="block w-full pointer-events-none" draggable={false} />
      {CERT_FIELD_KEYS.map((k) => {
        const cfg = fields[k]
        const align = cfg.align || "center"
        // size อิงฐานรูปกว้าง 1000px → สเกลตามความกว้างจริงของกล่อง preview
        const fontPx = boxW ? (cfg.size || 28) * (boxW / 1000) : 0
        return (
          <div key={k} onPointerDown={(e) => onPointerDown(e, k)}
            title={`ลากเพื่อย้าย ${CERT_FIELD_LABELS[k]}`}
            style={{
              left: `${cfg.x}%`, top: `${cfg.y}%`,
              // จุดยึดตามการจัดชิด — ชิดซ้ายข้อความเริ่มที่ x, ชิดขวาจบที่ x
              transform: `translate(${align === "left" ? "0" : align === "right" ? "-100%" : "-50%"}, -50%)`,
              color: cfg.color,
              fontFamily: FONT,
              fontSize: fontPx ? `${fontPx}px` : undefined,
              fontWeight: cfg.weight === "bold" ? 700 : 400,
              lineHeight: 1.15,
              visibility: fontPx ? "visible" : "hidden",   // กันกระพริบตอนยังไม่รู้ความกว้าง
            }}
            className={`absolute cursor-grab active:cursor-grabbing whitespace-nowrap
              outline-dashed outline-1 outline-offset-2
              ${dragKey === k ? "outline-[#F15A24] z-20" : "outline-slate-400/50 hover:outline-[#F15A24] z-10"}`}>
            {sample?.[k] || CERT_FIELD_LABELS[k]}
          </div>
        )
      })}

      {/* เส้นบอกจุดยึด + กรอบความกว้างสูงสุด — ขึ้นตอนลาก */}
      {dragKey && (() => {
        const f = fields[dragKey]
        const al = f.align || "center"
        const mw = f.maxWidth ?? 80
        const left = al === "left" ? f.x : al === "right" ? f.x - mw : f.x - mw / 2
        return (
          <>
            <div className="absolute pointer-events-none border-x border-dashed border-[#F15A24]/50"
              style={{ left: `${clamp(left)}%`, width: `${mw}%`, top: 0, bottom: 0 }} />
            <div className="absolute pointer-events-none bg-[#F15A24]" style={{ left: `${f.x}%`, top: 0, bottom: 0, width: 1 }} />
            <div className="absolute pointer-events-none bg-[#F15A24]" style={{ top: `${f.y}%`, left: 0, right: 0, height: 1 }} />
          </>
        )
      })()}
    </div>
  )
}

const clamp = (v) => Math.min(100, Math.max(0, v))
const round1 = (v) => Math.round(v * 10) / 10

// ── กล่องปรับค่าละเอียดของ 1 ฟิลด์ ──────────────────────────────────
function FieldControls({ fieldKey, cfg, onChange }) {
  const num = (key, label, min, max, step = 1) => (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">{label}</span>
      <input type="number" value={cfg[key]} min={min} max={max} step={step}
        onChange={(e) => onChange({ [key]: Number(e.target.value) })}
        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#F15A24]" />
    </label>
  )
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <p className="text-xs font-bold text-slate-700 mb-2">{CERT_FIELD_LABELS[fieldKey]}</p>
      <div className="grid grid-cols-4 gap-2">
        {num("x", "X %", 0, 100, 0.5)}
        {num("y", "Y %", 0, 100, 0.5)}
        {num("size", "ขนาด", 8, 200)}
        {num("maxWidth", "กว้าง %", 10, 100)}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <label className="block">
          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">สี</span>
          <input type="color" value={cfg.color} onChange={(e) => onChange({ color: e.target.value })}
            className="w-full h-[30px] border border-slate-200 rounded-lg cursor-pointer bg-white" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">น้ำหนัก</span>
          <select value={cfg.weight} onChange={(e) => onChange({ weight: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#F15A24] bg-white">
            <option value="normal">ปกติ</option>
            <option value="bold">หนา</option>
          </select>
        </label>
        <label className="block">
          {/* จุด X หมายถึงอะไร ขึ้นกับการจัดชิด — ชิดซ้ายใช้ต่อท้ายข้อความที่มีในเทมเพลต */}
          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">จัดชิด</span>
          <select value={cfg.align || "center"} onChange={(e) => onChange({ align: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#F15A24] bg-white">
            <option value="center">กึ่งกลาง</option>
            <option value="left">ชิดซ้าย</option>
            <option value="right">ชิดขวา</option>
          </select>
        </label>
      </div>
    </div>
  )
}

// ── แถวรางวัล 1 แถว: ซ้าย = ชื่อรางวัล · ขวา = search + คนที่เพิ่ม ──
function AwardRow({ idx, row, members, pool, tplKey, templates, onTpl, onLabel, onAddMember, onRemoveMember, onRemoveRow, onPreview }) {
  const [q, setQ] = useState("")
  const results = q.trim()
    ? pool.filter((r) =>
        (r.full_name || "").toLowerCase().includes(q.toLowerCase()) ||
        (r.school || "").toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : []

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <div className="flex gap-2 items-start">
        <div className="w-40 sm:w-48 shrink-0 space-y-1.5">
          <input value={row.label} onChange={(e) => onLabel(e.target.value)}
            placeholder={`รางวัลที่ ${idx}`}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
          {/* เทมเพลตที่ใช้พิมพ์ใบของรางวัลนี้ — ค่าเริ่มต้นไล่ตามลำดับแถว */}
          <select value={tplKey} onChange={(e) => onTpl(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 bg-white outline-none focus:border-[#F15A24]">
            {CERT_TEMPLATE_KEYS.map((k) => (
              <option key={k} value={k} disabled={!templates?.[k]?.url}>
                {CERT_TEMPLATE_LABELS[k]}{templates?.[k]?.url ? "" : " (ยังไม่มีรูป)"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ/โรงเรียนผู้สมัคร…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24]" />
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

        <button onClick={onRemoveRow} className="text-rose-400 hover:bg-rose-50 p-2 rounded-lg shrink-0" title="ลบรางวัลนี้"><Ico.alert className="w-4 h-4" /></button>
      </div>
    </div>
  )
}
