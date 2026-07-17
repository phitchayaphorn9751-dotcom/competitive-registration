import { useState, useEffect, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchSurveys, createSurvey, updateSurvey, deleteSurvey,
  fetchSurveyQuestions, saveSurveyQuestions, duplicateSurvey,
  createFormFromTemplate, fetchCoursesByType,
  fetchSurveyResponses, fetchResponseStats,
} from "../../lib/supabase.js"

const BRAND = "#F15A24"

// 3 แพทเทิร์นแบบประเมิน (tag ให้แอดมินสร้าง/ทำสำเนาเป็นเทมเพลตเองได้)
const PATTERNS = [
  { key: "booth", label: "บูท", emoji: "🏬" },
  { key: "competition", label: "แข่งขัน", emoji: "🏆" },
  { key: "workshop", label: "Workshop", emoji: "🛠" },
]
const PATTERN_LABEL = Object.fromEntries(PATTERNS.map((p) => [p.key, p.label]))

// ชนิดคำถาม (เหมือน Google Form)
const Q_TYPES = [
  { key: "linear_scale", label: "⭐ สเกลคะแนน" },
  { key: "radio", label: "🔘 หลายตัวเลือก" },
  { key: "checkbox", label: "☑️ ช่องทำเครื่องหมาย" },
  { key: "dropdown", label: "🔽 รายการเลื่อนลง" },
  { key: "short_text", label: "📝 ข้อความสั้น" },
  { key: "long_text", label: "📃 ย่อหน้า" },
]
const hasOptions = (t) => t === "radio" || t === "checkbox" || t === "dropdown"
const isScale = (t) => t === "linear_scale"
const defaultScale = () => ({ min: 1, max: 5, minLabel: "", maxLabel: "" })

// แปลงชนิดเก่า (rating/scale) → linear_scale + จัดรูป options ให้ตรงชนิด (backward compat)
function normalizeQ(q) {
  let type = q.question_type
  let options = q.options
  if (type === "rating" || type === "scale") {
    type = "linear_scale"; options = defaultScale()
  } else if (isScale(type)) {
    options = (options && !Array.isArray(options)) ? { ...defaultScale(), ...options } : defaultScale()
  } else {
    options = Array.isArray(options) ? options : []
  }
  return { ...q, question_type: type, options }
}

// ── icon จิ๋ว (inline svg) ──
function I({ d, className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
}
const IC = {
  plus: <I d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />,
  trash: <I d={<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} />,
  copy: <I d={<><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>} />,
  up: <I d={<><path d="m18 15-6-6-6 6"/></>} />,
  down: <I d={<><path d="m6 9 6 6 6-6"/></>} />,
  link: <I d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>} />,
  qr: <I d={<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 20h.01M17 20h.01M20 17h.01"/></>} />,
  chart: <I d={<><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></>} />,
  back: <I d={<><path d="m15 18-6-6 6-6"/></>} />,
  edit: <I d={<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></>} />,
  x: <I d={<><path d="M18 6 6 18M6 6l12 12"/></>} />,
  save: <I d={<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>} />,
}

const tabCls = (on) => `px-4 py-1.5 rounded-lg text-xs font-bold transition ${on ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500"}`

function StatCard({ label, value, color }) {
  const text = { orange: "text-[#F15A24]", sky: "text-sky-600", amber: "text-amber-600" }[color] || "text-slate-700"
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-xl font-extrabold mt-1 ${text}`}>{value}</p>
    </div>
  )
}

export default function AdminSurveys() {
  const { event } = useOutletContext()
  const [surveys, setSurveys] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("templates")   // templates | forms
  const [editing, setEditing] = useState(null)   // survey ที่กำลังแก้ (builder) | null = list
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null)       // 'template' | 'form' | null
  const [busy, setBusy] = useState(false)
  const [respStats, setRespStats] = useState([])   // answers ของทุกฟอร์ม (คำนวณ stat cards)

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    if (!event?.id) { setLoading(false); return }
    Promise.all([fetchSurveys(event.id), fetchCoursesByType(event.id).catch(() => [])])
      .then(([s, c]) => { setSurveys(s); setCourses(c) })
      .catch((e) => flash("โหลดไม่สำเร็จ: " + e.message, false))
      .finally(() => setLoading(false))
  }, [event?.id])

  // ดึง answers ของฟอร์มทั้งหมด → คะแนนเฉลี่ยรวม (stat card)
  useEffect(() => {
    const ids = surveys.filter((s) => !s.is_template).map((s) => s.id)
    if (!ids.length) { setRespStats([]); return }
    fetchResponseStats(ids).then(setRespStats).catch(() => setRespStats([]))
  }, [surveys])

  async function reload() {
    try { setSurveys(await fetchSurveys(event.id)) } catch { /* ignore */ }
  }

  const templates = useMemo(() => surveys.filter((s) => s.is_template), [surveys])
  const forms = useMemo(() => surveys.filter((s) => !s.is_template), [surveys])
  const courseName = (id) => courses.find((c) => c.id === id)?.title

  // stat cards: จำนวนฟอร์ม · คำตอบรวม · คะแนนเฉลี่ยรวม
  const avgRating = useMemo(() => {
    let sum = 0, n = 0
    respStats.forEach((r) => Object.values(r.answers || {}).forEach((v) => { if (typeof v === "number") { sum += v; n++ } }))
    return n > 0 ? (sum / n).toFixed(1) : "0.0"
  }, [respStats])

  async function createTemplate({ title, pattern }) {
    setBusy(true)
    try {
      const s = await createSurvey(event.id, { title: title.trim(), pattern, is_template: true })
      setModal(null); await reload(); setEditing(s)
    } catch (e) { flash("สร้างไม่สำเร็จ: " + e.message, false) }
    finally { setBusy(false) }
  }

  async function createForm({ templateId, courseId, customTitle }) {
    setBusy(true)
    try {
      const tpl = templates.find((t) => t.id === templateId)
      const title = customTitle?.trim() || courseName(courseId) || "แบบประเมิน"
      const f = await createFormFromTemplate(templateId, {
        event_id: event.id, title, course_id: courseId || null, pattern: tpl?.pattern || null,
      })
      setModal(null); await reload(); setEditing(f)
    } catch (e) { flash("สร้างไม่สำเร็จ: " + e.message, false) }
    finally { setBusy(false) }
  }

  async function onDuplicate(s) {
    try { const c = await duplicateSurvey(s.id); await reload(); flash("ทำสำเนาแล้ว"); setEditing(c) }
    catch (e) { flash("ทำสำเนาไม่สำเร็จ: " + e.message, false) }
  }
  async function onDelete(s) {
    if (!confirm(`ลบ "${s.title}"?\nคำถาม/คำตอบทั้งหมดจะหายไป`)) return
    try { await deleteSurvey(s.id); await reload(); flash("ลบแล้ว") }
    catch (e) { flash("ลบไม่สำเร็จ: " + e.message, false) }
  }
  async function onToggleOpen(s) {
    try { await updateSurvey(s.id, { is_open: !s.is_open }); await reload() }
    catch (e) { flash("แก้ไม่สำเร็จ: " + e.message, false) }
  }

  if (!event) return <div className="p-12 text-center text-slate-400">ยังไม่มีงาน</div>
  if (loading) return <div className="p-12 text-center text-slate-400">กำลังโหลด…</div>

  // ── โหมด builder ──
  if (editing) {
    return <SurveyBuilder survey={editing} isTemplate={!!editing.is_template} courseLabel={courseName(editing.course_id)}
      onBack={() => { setEditing(null); reload() }} flash={flash} />
  }

  // ── โหมด list (2 แท็บ) ──
  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-4xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg ${toast.ok ? "bg-emerald-500" : "bg-rose-500"}`}>{toast.msg}</div>
      )}
      {modal === "template" && <TemplateModal busy={busy} onClose={() => setModal(null)} onCreate={createTemplate} />}
      {modal === "form" && <FormModal templates={templates} courses={courses} busy={busy} onClose={() => setModal(null)} onCreate={createForm} />}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h1 className="text-lg font-extrabold text-slate-800">แบบประเมิน</h1>
        <p className="text-xs text-slate-400 mt-0.5 mb-3">สร้างเทมเพลตคำถาม แล้วแตกเป็นแบบฟอร์มรายวิชา · แต่ละฟอร์มมีลิงก์/QR</p>
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
          <button onClick={() => setTab("templates")} className={tabCls(tab === "templates")}>เทมเพลต ({templates.length})</button>
          <button onClick={() => setTab("forms")} className={tabCls(tab === "forms")}>แบบฟอร์ม ({forms.length})</button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon="file" label="ฟอร์มทั้งหมด" value={forms.length} color="orange" />
        <StatCard icon="users" label="คำตอบรวม" value={respStats.length} color="sky" />
        <StatCard icon="star" label="คะแนนเฉลี่ย" value={`${avgRating} / 5`} color="amber" />
      </div>

      {tab === "templates"
        ? <TemplateList templates={templates} onNew={() => setModal("template")} onEdit={setEditing} onDup={onDuplicate} onDelete={onDelete} />
        : <FormList forms={forms} courseName={courseName} templates={templates} hasTemplates={templates.length > 0}
            onNew={() => setModal("form")} onEdit={setEditing} onToggle={onToggleOpen} onDelete={onDelete} />}
    </div>
  )
}

// ── รายการเทมเพลต ──
function TemplateList({ templates, onNew, onEdit, onDup, onDelete }) {
  return (
    <>
      <div className="flex justify-end">
        <button onClick={onNew} className="inline-flex items-center gap-1.5 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition active:scale-95" style={{ background: BRAND }}>{IC.plus} สร้างเทมเพลต</button>
      </div>
      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-sm text-slate-400">ยังไม่มีเทมเพลต — สร้างเทมเพลตต้นแบบก่อน แล้วค่อยแตกเป็นแบบฟอร์ม</div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {PATTERN_LABEL[t.pattern] && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 text-[#F15A24] border border-orange-100">{PATTERN_LABEL[t.pattern]}</span>}
                  <h3 className="font-bold text-slate-800 truncate">{t.title}</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">{t.question_count} คำถาม</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onEdit(t)} title="แก้ไข" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#F15A24]">{IC.edit}</button>
                <button onClick={() => onDup(t)} title="ทำสำเนา" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#F15A24]">{IC.copy}</button>
                <button onClick={() => onDelete(t)} title="ลบ" className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500">{IC.trash}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── รายการแบบฟอร์ม (จัดกลุ่มตามแพทเทิร์น) ──
function FormList({ forms, courseName, templates, hasTemplates, onNew, onEdit, onToggle, onDelete }) {
  const groups = PATTERNS.map((p) => ({ ...p, items: forms.filter((f) => f.pattern === p.key) }))
  const other = forms.filter((f) => !PATTERNS.some((p) => p.key === f.pattern))
  const tplName = (id) => templates.find((t) => t.id === id)?.title

  return (
    <>
      <div className="flex justify-end">
        <button onClick={onNew} disabled={!hasTemplates}
          className="inline-flex items-center gap-1.5 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-40" style={{ background: BRAND }}>{IC.plus} สร้างแบบฟอร์ม</button>
      </div>
      {!hasTemplates && <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-xl px-4 py-3">สร้างเทมเพลตในแท็บ "เทมเพลต" ก่อน แล้วจึงแตกเป็นแบบฟอร์มได้</div>}
      {forms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-sm text-slate-400">ยังไม่มีแบบฟอร์ม</div>
      ) : (
        [...groups.filter((g) => g.items.length), ...(other.length ? [{ key: "other", label: "อื่นๆ", emoji: "📋", items: other }] : [])].map((g) => (
          <div key={g.key} className="space-y-2">
            <div className="flex items-center gap-2 px-1 pt-1">
              <span className="text-sm font-bold text-slate-600">{g.emoji} {g.label}</span>
              <span className="text-[11px] text-slate-400">{g.items.length}</span>
            </div>
            {g.items.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-800 truncate">{f.title}</h3>
                    <button onClick={() => onToggle(f)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${f.is_open ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                      {f.is_open ? "เปิดรับ" : "ปิดรับ"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {courseName(f.course_id) ? `วิชา ${courseName(f.course_id)} · ` : ""}
                    {tplName(f.template_id) ? `จาก ${tplName(f.template_id)} · ` : ""}
                    {f.question_count} คำถาม · {f.response_count} คำตอบ
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onEdit(f)} title="แก้ไข/ลิงก์" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#F15A24]">{IC.edit}</button>
                  <button onClick={() => onDelete(f)} title="ลบ" className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500">{IC.trash}</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </>
  )
}

// ═══════════════════════════════════════════
// Template Modal — เลือกแพทเทิร์น + ตั้งชื่อ (สร้างเทมเพลต)
// ═══════════════════════════════════════════
function TemplateModal({ busy, onClose, onCreate }) {
  const [pattern, setPattern] = useState("")
  const [title, setTitle] = useState("")

  function pickPattern(key) {
    setPattern(key)
    const label = PATTERN_LABEL[key]
    if (label && !title.trim()) setTitle(`เทมเพลต${label}`)
  }
  const canCreate = title.trim().length > 0 && !!pattern

  return (
    <ModalShell title="สร้างเทมเพลตใหม่" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-2">เลือกแพทเทิร์น</label>
          <div className="grid grid-cols-3 gap-2">
            {PATTERNS.map((p) => (
              <button key={p.key} onClick={() => pickPattern(p.key)}
                className={`px-2 py-3 rounded-xl border-2 transition text-center ${pattern === p.key ? "border-[#F15A24] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="text-2xl leading-none mb-1">{p.emoji}</div>
                <span className={`text-xs font-bold ${pattern === p.key ? "text-[#F15A24]" : "text-slate-700"}`}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1.5">ชื่อเทมเพลต</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="เช่น เทมเพลตบูทมาตรฐาน"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition"
            onKeyDown={(e) => { if (e.key === "Enter" && canCreate) onCreate({ title, pattern }) }} />
        </div>
      </div>
      <ModalFooter onClose={onClose} disabled={!canCreate || busy}
        label={busy ? "กำลังสร้าง…" : "สร้างและทำคำถาม"} onSubmit={() => onCreate({ title, pattern })} />
    </ModalShell>
  )
}

// ═══════════════════════════════════════════
// Form Modal — เลือกเทมเพลต → เลือกวิชา/พิมพ์ชื่อเอง (สร้างแบบฟอร์ม)
// ═══════════════════════════════════════════
function FormModal({ templates, courses, busy, onClose, onCreate }) {
  const [templateId, setTemplateId] = useState("")
  const [courseId, setCourseId] = useState("")
  const [customMode, setCustomMode] = useState(false)
  const [customTitle, setCustomTitle] = useState("")

  const canCreate = !!templateId && (customMode ? customTitle.trim().length > 0 : !!courseId)

  return (
    <ModalShell title="สร้างแบบฟอร์มใหม่" onClose={onClose}>
      <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* 1) เลือกเทมเพลต */}
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-2">1) เลือกเทมเพลต</label>
          <div className="space-y-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setTemplateId(t.id)}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border-2 transition ${templateId === t.id ? "border-[#F15A24] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${templateId === t.id ? "border-[#F15A24]" : "border-slate-300"}`}>
                  {templateId === t.id && <span className="w-2 h-2 rounded-full bg-[#F15A24]" />}
                </span>
                <span className="text-lg">{PATTERNS.find((p) => p.key === t.pattern)?.emoji || "📋"}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800 truncate">{t.title}</span>
                  <span className="block text-[11px] text-slate-400">{PATTERN_LABEL[t.pattern] || "ทั่วไป"} · {t.question_count} คำถาม</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2) เลือกวิชา / พิมพ์ชื่อเอง */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500">2) {customMode ? "พิมพ์ชื่อฟอร์ม" : "เลือกวิชา"}</label>
            <button onClick={() => setCustomMode((v) => !v)} className="text-[11px] font-bold text-[#F15A24] hover:underline">
              {customMode ? "← เลือกจากวิชา" : "พิมพ์ชื่อเอง →"}
            </button>
          </div>
          {customMode ? (
            <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="เช่น ประเมินกิจกรรมเปิดบ้าน"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition" />
          ) : (
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none">
              <option value="">— เลือกวิชา —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.base_id ? ` (${c.base_id})` : ""}</option>)}
            </select>
          )}
        </div>
      </div>
      <ModalFooter onClose={onClose} disabled={!canCreate || busy}
        label={busy ? "กำลังสร้าง…" : "สร้างและทำฟอร์ม"}
        onSubmit={() => onCreate({ templateId, courseId: customMode ? null : courseId, customTitle: customMode ? customTitle : "" })} />
    </ModalShell>
  )
}

// ── โครง modal ร่วม ──
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100" style={{ background: BRAND }}>
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">{IC.x}</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function ModalFooter({ onClose, onSubmit, disabled, label }) {
  return (
    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition">ยกเลิก</button>
      <button onClick={onSubmit} disabled={disabled}
        className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-40" style={{ background: BRAND }}>
        {IC.plus} {label}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════
// Survey Builder — สร้างคำถาม (Google Form style)
// ═══════════════════════════════════════════
function SurveyBuilder({ survey, isTemplate, courseLabel, onBack, flash }) {
  const [title, setTitle] = useState(survey.title || "")
  const [pattern, setPattern] = useState(survey.pattern || "")
  const [desc, setDesc] = useState(survey.description || "")
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState("build")   // build | responses | share
  const [activeIdx, setActiveIdx] = useState(0)   // การ์ดคำถามที่กำลังแก้ (GG Form style)

  useEffect(() => {
    fetchSurveyQuestions(survey.id)
      .then((qs) => setQuestions(qs.map(normalizeQ)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [survey.id])

  function newQ(type) {
    return { question_text: "", question_type: type, required: false, _new: true,
      options: isScale(type) ? defaultScale() : (hasOptions(type) ? ["ตัวเลือก 1"] : []) }
  }
  function addQuestion(type = "linear_scale") {
    setQuestions((qs) => { const next = [...qs, newQ(type)]; setActiveIdx(next.length - 1); return next })
  }
  function updateQ(i, patch) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q)) }
  function removeQ(i) {
    setQuestions((qs) => qs.filter((_, j) => j !== i))
    setActiveIdx((a) => Math.max(0, a > i ? a - 1 : a))
  }
  function dupQ(i) {
    setQuestions((qs) => { const c = JSON.parse(JSON.stringify(qs[i])); c._new = true; return [...qs.slice(0, i + 1), c, ...qs.slice(i + 1)] })
    setActiveIdx(i + 1)
  }
  function moveQ(i, dir) {
    setQuestions((qs) => {
      const j = i + dir
      if (j < 0 || j >= qs.length) return qs
      const c = [...qs]; [c[i], c[j]] = [c[j], c[i]]; return c
    })
    setActiveIdx((a) => a === i ? i + dir : a)
  }
  function changeType(i, type) {
    setQuestions((qs) => qs.map((q, j) => {
      if (j !== i) return q
      const options = isScale(type) ? (q.options && !Array.isArray(q.options) ? q.options : defaultScale())
        : (hasOptions(type) ? (Array.isArray(q.options) && q.options.length ? q.options : ["ตัวเลือก 1"]) : [])
      return { ...q, question_type: type, options }
    }))
  }
  // options (radio/checkbox/dropdown)
  function addOpt(i) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: [...(q.options || []), `ตัวเลือก ${(q.options?.length || 0) + 1}`] } : q)) }
  function updateOpt(i, k, val) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? val : o) } : q)) }
  function removeOpt(i, k) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k) } : q)) }
  // linear_scale config
  function setScale(i, patch) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: { ...defaultScale(), ...(q.options || {}), ...patch } } : q)) }

  async function saveMeta() {
    await updateSurvey(survey.id, { title: title.trim() || "แบบประเมิน", pattern: pattern || null, description: desc })
  }
  async function onSave() {
    // validate
    for (const q of questions) {
      if (!q.question_text.trim()) { flash("มีคำถามที่ยังไม่ได้พิมพ์ข้อความ", false); return }
      if (hasOptions(q.question_type) && (!Array.isArray(q.options) || q.options.length === 0)) { flash("คำถามเลือกตอบต้องมีตัวเลือก", false); return }
    }
    setSaving(true)
    try {
      await saveMeta()
      await saveSurveyQuestions(survey.id, questions)
      flash("บันทึกแล้ว")
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + e.message, false) }
    finally { setSaving(false) }
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""

  if (loading) return <div className="p-12 text-center text-slate-400">กำลังโหลด…</div>

  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-3xl">
      {/* header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#F15A24] text-sm font-bold">{IC.back} กลับ</button>
          <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50" style={{ background: BRAND }}>
            {IC.save} {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
        {/* tabs — เทมเพลตไม่มีการตอบกลับ/ลิงก์/QR */}
        {!isTemplate ? (
          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
            <button onClick={() => setTab("build")} className={tabCls(tab === "build")}>สร้างคำถาม</button>
            <button onClick={() => setTab("responses")} className={tabCls(tab === "responses")}>การตอบกลับ</button>
            <button onClick={() => setTab("share")} className={tabCls(tab === "share")}>ลิงก์ / QR</button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#F15A24] bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-lg">เทมเพลต · ใช้แตกเป็นแบบฟอร์ม</span>
        )}
      </div>

      {tab === "build" || isTemplate ? (
        <>
          {/* meta */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 border-t-4" style={{ borderTopColor: BRAND }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อแบบประเมิน"
              className="w-full text-lg font-bold text-slate-800 border-0 border-b-2 border-slate-100 focus:border-[#F15A24] outline-none pb-1 bg-transparent" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" rows={2}
              className="w-full text-sm text-slate-600 border-0 border-b border-slate-100 focus:border-[#F15A24] outline-none resize-none bg-transparent" />
            {isTemplate ? (
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">แพทเทิร์น</label>
                <select value={pattern} onChange={(e) => setPattern(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none">
                  <option value="">— เลือกแพทเทิร์น —</option>
                  {PATTERNS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
                </select>
              </div>
            ) : (
              (courseLabel || PATTERN_LABEL[pattern]) && (
                <p className="text-xs text-slate-400">
                  {courseLabel ? `วิชา ${courseLabel}` : ""}{courseLabel && PATTERN_LABEL[pattern] ? " · " : ""}
                  {PATTERN_LABEL[pattern] ? `แพทเทิร์น ${PATTERN_LABEL[pattern]}` : ""}
                </p>
              )
            )}
          </div>

          {/* questions — คลิกเพื่อแก้ (active) / อื่นๆ เป็น preview ย่อ */}
          {questions.map((q, i) => (
            i === activeIdx ? (
              // ── ACTIVE (แก้ไข) ──
              <div key={i} className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-[#F15A24] shadow-md p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-slate-300 mt-2.5 w-5 text-center shrink-0">{i + 1}</span>
                  <input value={q.question_text} onChange={(e) => updateQ(i, { question_text: e.target.value })} placeholder="พิมพ์คำถาม…"
                    className="flex-1 text-sm font-medium text-slate-800 bg-slate-50 rounded-lg border-b-2 border-slate-200 focus:border-[#F15A24] outline-none px-3 py-2" />
                  <select value={q.question_type} onChange={(e) => changeType(i, e.target.value)}
                    className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-2 bg-white focus:border-[#F15A24] outline-none shrink-0">
                    {Q_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>

                <div className="pl-7">
                  {isScale(q.question_type) && (
                    <div className="bg-slate-50 rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>สเกลคะแนน 1 ถึง</span>
                        <select value={(q.options || {}).max || 5} onChange={(e) => setScale(i, { max: Number(e.target.value) })}
                          className="border border-slate-300 rounded px-2 py-0.5 bg-white font-bold">
                          <option value={5}>5</option><option value={10}>10</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 w-16 shrink-0">ป้ายต่ำสุด</span>
                        <input value={(q.options || {}).minLabel || ""} onChange={(e) => setScale(i, { minLabel: e.target.value })} placeholder="เช่น น้อยที่สุด"
                          className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-300 bg-white" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 w-16 shrink-0">ป้ายสูงสุด</span>
                        <input value={(q.options || {}).maxLabel || ""} onChange={(e) => setScale(i, { maxLabel: e.target.value })} placeholder="เช่น มากที่สุด"
                          className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-300 bg-white" />
                      </div>
                    </div>
                  )}
                  {hasOptions(q.question_type) && (
                    <div className="space-y-1.5">
                      {(q.options || []).map((o, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className={`w-4 h-4 border-2 border-slate-300 shrink-0 ${q.question_type === "radio" ? "rounded-full" : q.question_type === "dropdown" ? "rounded text-[9px] flex items-center justify-center text-slate-400" : "rounded"}`}>{q.question_type === "dropdown" ? k + 1 : ""}</span>
                          <input value={o} onChange={(e) => updateOpt(i, k, e.target.value)}
                            className="flex-1 text-sm text-slate-700 border-0 border-b border-slate-100 focus:border-[#F15A24] outline-none pb-0.5 bg-transparent" />
                          {(q.options || []).length > 1 && <button onClick={() => removeOpt(i, k)} className="p-1 text-slate-300 hover:text-rose-500">{IC.x}</button>}
                        </div>
                      ))}
                      <button onClick={() => addOpt(i)} className="text-xs text-[#F15A24] font-bold flex items-center gap-1 mt-1">{IC.plus} เพิ่มตัวเลือก</button>
                    </div>
                  )}
                  {(q.question_type === "short_text" || q.question_type === "long_text") && (
                    <div className={`border border-dashed border-slate-200 rounded-lg px-3 text-xs text-slate-300 flex items-center bg-slate-50 ${q.question_type === "long_text" ? "h-16" : "h-9"}`}>ผู้ตอบพิมพ์ข้อความ…</div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 pl-7">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                    <input type="checkbox" checked={q.required} onChange={(e) => updateQ(i, { required: e.target.checked })} className="accent-[#F15A24]" />
                    บังคับตอบ
                  </label>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveQ(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30">{IC.up}</button>
                    <button onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30">{IC.down}</button>
                    <button onClick={() => dupQ(i)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="ทำสำเนา">{IC.copy}</button>
                    <button onClick={() => removeQ(i)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="ลบ">{IC.trash}</button>
                  </div>
                </div>
              </div>
            ) : (
              // ── PREVIEW (คลิกเพื่อแก้) ──
              <div key={i} onClick={() => setActiveIdx(i)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition">
                <h4 className="text-sm font-bold text-slate-800">{i + 1}. {q.question_text || <span className="text-slate-300 font-normal">(ยังไม่มีข้อความ)</span>} {q.required && <span className="text-rose-500">*</span>}</h4>
                <div className="mt-2">
                  {isScale(q.question_type) && (
                    <div className="flex gap-1.5">{Array.from({ length: ((q.options || {}).max || 5) }).map((_, n) => <span key={n} className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-lg text-[10px] text-slate-400">{n + 1}</span>)}</div>
                  )}
                  {hasOptions(q.question_type) && (
                    <div className="space-y-1">{(q.options || []).map((o, k) => (
                      <div key={k} className="flex items-center gap-2 text-xs text-slate-500"><span className={`w-3 h-3 border border-slate-300 ${q.question_type === "radio" ? "rounded-full" : "rounded"}`} />{o}</div>
                    ))}</div>
                  )}
                  {(q.question_type === "short_text" || q.question_type === "long_text") && (
                    <div className="border-b border-dashed border-slate-200 w-1/2 h-5" />
                  )}
                </div>
              </div>
            )
          ))}

          {/* add question */}
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 mb-2 text-center">เพิ่มคำถาม</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Q_TYPES.map((t) => (
                <button key={t.key} onClick={() => addQuestion(t.key)}
                  className="flex items-center gap-1.5 justify-center text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl py-2.5 hover:border-[#F15A24] hover:text-[#F15A24] hover:bg-orange-50/50 transition">
                  {IC.plus} {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : tab === "responses" ? (
        <ResponsesPanel survey={survey} questions={questions} flash={flash} />
      ) : (
        <ShareTab survey={survey} baseUrl={baseUrl} flash={flash} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Share Tab — 1 ลิงก์ + 1 QR ต่อฟอร์ม
// ═══════════════════════════════════════════
function ShareTab({ survey, baseUrl, flash }) {
  const link = `${baseUrl}/survey/${survey.id}`
  const qrSmall = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`
  const qrBig = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(link)}&download=1`
  function copyLink() {
    navigator.clipboard?.writeText(link).then(() => flash("คัดลอกลิงก์แล้ว")).catch(() => flash("คัดลอกไม่สำเร็จ", false))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-bold text-slate-700 mb-4">ลิงก์แบบประเมิน</p>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* QR */}
        <div className="w-40 h-40 bg-white border border-slate-200 rounded-2xl p-2 shrink-0">
          <img alt="QR" className="w-full h-full" src={qrSmall} />
        </div>
        <div className="flex-1 min-w-0 w-full">
          <code className="block text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2.5 break-all">{link}</code>
          <div className="flex gap-2 mt-3">
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-[#F15A24] hover:text-[#F15A24]">{IC.copy} คัดลอกลิงก์</button>
            <a href={qrBig} download={`qr_survey_${survey.id}.png`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-[#F15A24] hover:text-[#F15A24]">{IC.qr} ดาวน์โหลด QR</a>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">แชร์ลิงก์นี้หรือให้ผู้ร่วมงานสแกน QR เพื่อตอบแบบประเมิน</p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Responses Panel — สรุปคำตอบต่อคำถาม + ดาวน์โหลด CSV
// ═══════════════════════════════════════════
function ResponsesPanel({ survey, questions, flash }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSurveyResponses(survey.id)
      .then(setResponses)
      .catch((e) => flash("โหลดคำตอบไม่สำเร็จ: " + e.message, false))
      .finally(() => setLoading(false))
  }, [survey.id])

  // ค่าเฉลี่ยรวม (เฉพาะคำตอบที่เป็นตัวเลข = linear_scale)
  const overall = useMemo(() => {
    let sum = 0, n = 0
    responses.forEach((r) => Object.values(r.answers || {}).forEach((v) => { if (typeof v === "number") { sum += v; n++ } }))
    return n > 0 ? sum / n : 0
  }, [responses])

  function exportCsv() {
    if (!responses.length) { flash("ยังไม่มีคำตอบ", false); return }
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const header = ["ลำดับ", "เวลาส่ง", ...questions.map((q, i) => `ข้อ ${i + 1}: ${q.question_text}`)]
    const lines = [header.map(esc).join(",")]
    responses.forEach((r, idx) => {
      const row = [idx + 1, r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : ""]
      questions.forEach((q) => {
        const a = (r.answers || {})[q.id]
        row.push(Array.isArray(a) ? a.join(" | ") : (a ?? ""))
      })
      lines.push(row.map(esc).join(","))
    })
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    a.href = url; a.download = `คำตอบ_${survey.title}_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return <div className="p-12 text-center text-slate-400">กำลังโหลดคำตอบ…</div>

  return (
    <div className="space-y-4">
      {/* หัวสรุป */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
        <div className="flex gap-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">จำนวนคำตอบ</p>
            <p className="text-2xl font-extrabold text-slate-800">{responses.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">คะแนนเฉลี่ยรวม</p>
            <p className="text-2xl font-extrabold text-[#F15A24]">{overall.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 5</span></p>
          </div>
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition">{IC.copy} ดาวน์โหลด CSV</button>
      </div>

      {responses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-sm text-slate-400">ยังไม่มีผู้ตอบแบบประเมินนี้</div>
      ) : questions.map((q, i) => {
        const answered = responses.map((r) => (r.answers || {})[q.id]).filter((v) => v !== undefined && v !== null && v !== "")
        return (
          <div key={q.id || i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-800">{i + 1}. {q.question_text}</h4>
            {/* text = ลิสต์ */}
            {(q.question_type === "short_text" || q.question_type === "long_text") ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto bg-slate-50 rounded-lg p-3 border border-slate-100">
                {answered.length === 0 ? <p className="text-xs text-slate-400">ไม่มีการเขียนตอบ</p>
                  : answered.map((a, k) => <p key={k} className="text-xs text-slate-700 py-1.5 border-b border-slate-200 last:border-0">{a}</p>)}
              </div>
            ) : isScale(q.question_type) ? (
              (() => {
                const max = (q.options || {}).max || 5
                const dist = {}; for (let s = 1; s <= max; s++) dist[s] = 0
                let sum = 0, n = 0
                answered.forEach((v) => { if (typeof v === "number") { dist[v] = (dist[v] || 0) + 1; sum += v; n++ } })
                const avg = n > 0 ? (sum / n).toFixed(1) : "0.0"
                return (
                  <>
                    <div className="text-xs"><span className="bg-orange-50 text-[#F15A24] px-2.5 py-1 rounded-lg font-bold">เฉลี่ย {avg} / {max}</span></div>
                    <div className="space-y-1.5">
                      {Array.from({ length: max }).map((_, idx) => { const s = max - idx; const c = dist[s] || 0; const pct = n ? (c / n) * 100 : 0
                        return (
                          <div key={s} className="flex items-center gap-2 text-xs">
                            <span className="w-6 font-bold text-slate-500">{s}</span>
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#F15A24]" style={{ width: `${pct}%` }} /></div>
                            <span className="w-10 text-right text-slate-500 font-bold">{c}</span>
                          </div>
                        ) })}
                    </div>
                  </>
                )
              })()
            ) : (
              (() => {
                const dist = {}; (q.options || []).forEach((o) => dist[o] = 0)
                let total = 0
                answered.forEach((v) => { (Array.isArray(v) ? v : [v]).forEach((x) => { dist[x] = (dist[x] || 0) + 1; total++ }) })
                return (
                  <div className="space-y-2">
                    {(q.options || []).map((o, k) => { const c = dist[o] || 0; const pct = total ? (c / total) * 100 : 0
                      return (
                        <div key={k} className="text-xs space-y-1">
                          <div className="flex justify-between text-slate-600 font-bold"><span>{o}</span><span>{c} ({pct.toFixed(0)}%)</span></div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#F15A24]" style={{ width: `${pct}%` }} /></div>
                        </div>
                      ) })}
                  </div>
                )
              })()
            )}
          </div>
        )
      })}
    </div>
  )
}