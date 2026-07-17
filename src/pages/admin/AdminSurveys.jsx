import { useState, useEffect, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchSurveys, createSurvey, updateSurvey, deleteSurvey,
  fetchSurveyQuestions, saveSurveyQuestions, duplicateSurvey,
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
  { key: "rating", label: "ให้ดาว (1-5)", icon: "star" },
  { key: "scale", label: "สเกล 1-5", icon: "scale" },
  { key: "radio", label: "เลือก 1 ข้อ", icon: "radio" },
  { key: "checkbox", label: "เลือกหลายข้อ", icon: "check" },
  { key: "short_text", label: "ข้อความสั้น", icon: "text" },
  { key: "long_text", label: "ข้อความยาว", icon: "para" },
]
const Q_LABEL = Object.fromEntries(Q_TYPES.map((t) => [t.key, t.label]))
const hasOptions = (t) => t === "radio" || t === "checkbox"

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

export default function AdminSurveys() {
  const { event } = useOutletContext()
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // survey ที่กำลังแก้ (builder) | null = list
  const [toast, setToast] = useState(null)
  const [showCreate, setShowCreate] = useState(false)   // modal สร้างใหม่
  const [creating, setCreating] = useState(false)

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    if (!event?.id) { setLoading(false); return }
    fetchSurveys(event.id)
      .then(setSurveys)
      .catch((e) => flash("โหลดไม่สำเร็จ: " + e.message, false))
      .finally(() => setLoading(false))
  }, [event?.id])

  async function reload() {
    try { setSurveys(await fetchSurveys(event.id)) } catch { /* ignore */ }
  }

  function onCreate() { setShowCreate(true) }

  async function doCreate({ title, pattern, fromId }) {
    setCreating(true)
    try {
      let s
      if (fromId) {
        // เริ่มจากฟอร์มเดิม (ทำสำเนา) แล้วปรับชื่อ/แพทเทิร์น
        s = await duplicateSurvey(fromId)
        await updateSurvey(s.id, { title: title.trim(), pattern: pattern || null })
        s = { ...s, title: title.trim(), pattern: pattern || null }
      } else {
        s = await createSurvey(event.id, { title: title.trim(), pattern: pattern || null })
      }
      setShowCreate(false)
      await reload()
      setEditing(s)   // เปิด builder ทันที
    } catch (e) { flash("สร้างไม่สำเร็จ: " + e.message, false) }
    finally { setCreating(false) }
  }

  async function onDuplicate(s) {
    try { const c = await duplicateSurvey(s.id); await reload(); flash("ทำสำเนาแล้ว"); setEditing(c) }
    catch (e) { flash("ทำสำเนาไม่สำเร็จ: " + e.message, false) }
  }

  async function onDelete(s) {
    if (!confirm(`ลบ "${s.title}"?\nคำถามและคำตอบทั้งหมดจะหายไป`)) return
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
    return <SurveyBuilder survey={editing}
      onBack={() => { setEditing(null); reload() }} flash={flash} />
  }

  // ── โหมด list ──
  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-4xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg ${toast.ok ? "bg-emerald-500" : "bg-rose-500"}`}>{toast.msg}</div>
      )}
      {showCreate && (
        <CreateModal surveys={surveys} creating={creating} onClose={() => setShowCreate(false)} onCreate={doCreate} />
      )}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">แบบประเมิน</h1>
          <p className="text-xs text-slate-400 mt-0.5">สร้างแบบประเมินความพึงพอใจ · เจนลิงก์/QR แต่ละกิจกรรม</p>
        </div>
        <button onClick={onCreate} className="inline-flex items-center gap-1.5 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition active:scale-95" style={{ background: BRAND }}>
          {IC.plus} สร้างแบบประเมิน
        </button>
      </div>

      {surveys.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <p className="text-slate-400 text-sm mb-3">ยังไม่มีแบบประเมิน</p>
          <button onClick={onCreate} className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-bold" style={{ background: BRAND }}>{IC.plus} สร้างแบบแรก</button>
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((s) => {
            const patternLabel = PATTERN_LABEL[s.pattern]
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-800 truncate">{s.title}</h3>
                      {patternLabel && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 text-[#F15A24] border border-orange-100">{patternLabel}</span>}
                      <button onClick={() => onToggleOpen(s)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${s.is_open ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                        {s.is_open ? "เปิดรับ" : "ปิดรับ"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{s.question_count} คำถาม · {s.response_count} คำตอบ</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(s)} title="แก้ไข/ลิงก์" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#F15A24]">{IC.edit}</button>
                    <button onClick={() => onDuplicate(s)} title="ทำสำเนา (ใช้เป็นเทมเพลต)" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#F15A24]">{IC.copy}</button>
                    <button onClick={() => onDelete(s)} title="ลบ" className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500">{IC.trash}</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Create Modal — เลือกหมวด + ตั้งชื่อ (แทน prompt)
// ═══════════════════════════════════════════
function CreateModal({ surveys, creating, onClose, onCreate }) {
  const [pattern, setPattern] = useState("")
  const [title, setTitle] = useState("")
  const [fromId, setFromId] = useState("")   // เริ่มจากฟอร์มเดิม (ทำสำเนา)

  // ตั้งชื่ออัตโนมัติตามแพทเทิร์น (แก้ทีหลังได้)
  function pickPattern(key) {
    setPattern(key)
    const label = PATTERN_LABEL[key]
    if (label && !title.trim()) setTitle(`ประเมิน${label}`)
  }

  const canCreate = title.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100" style={{ background: BRAND }}>
          <h3 className="font-bold text-white">สร้างแบบประเมินใหม่</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">{IC.x}</button>
        </div>
        <div className="p-5 space-y-4">
          {/* เลือกแพทเทิร์น */}
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

          {/* ชื่อ */}
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">ชื่อแบบประเมิน</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              placeholder="เช่น ประเมิน Workshop"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition"
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) onCreate({ title, pattern, fromId }) }} />
          </div>

          {/* เริ่มจากฟอร์มเดิม (ทำสำเนาเป็นเทมเพลต) */}
          {surveys.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1.5">เริ่มจากฟอร์มเดิม <span className="text-slate-300 font-normal">(ไม่บังคับ · ก็อปคำถามมาแก้ต่อ)</span></label>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none">
                <option value="">— เริ่มจากฟอร์มเปล่า —</option>
                {surveys.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.question_count} คำถาม)</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition">ยกเลิก</button>
          <button onClick={() => onCreate({ title, pattern, fromId })} disabled={!canCreate || creating}
            className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-40" style={{ background: BRAND }}>
            {IC.plus} {creating ? "กำลังสร้าง…" : "สร้างและทำคำถาม"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Survey Builder — สร้างคำถาม (Google Form style)
// ═══════════════════════════════════════════
function SurveyBuilder({ survey, onBack, flash }) {
  const [title, setTitle] = useState(survey.title || "")
  const [pattern, setPattern] = useState(survey.pattern || "")
  const [desc, setDesc] = useState(survey.description || "")
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState("build")   // build | share

  useEffect(() => {
    fetchSurveyQuestions(survey.id)
      .then((qs) => setQuestions(qs.map((q) => ({ ...q, options: q.options || [] }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [survey.id])

  function addQuestion(type = "rating") {
    setQuestions((qs) => [...qs, { question_text: "", question_type: type, options: hasOptions(type) ? ["ตัวเลือก 1"] : [], required: false, _new: true }])
  }
  function updateQ(i, patch) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q)) }
  function removeQ(i) { setQuestions((qs) => qs.filter((_, j) => j !== i)) }
  function dupQ(i) { setQuestions((qs) => { const c = { ...qs[i], _new: true }; return [...qs.slice(0, i + 1), c, ...qs.slice(i + 1)] }) }
  function moveQ(i, dir) {
    setQuestions((qs) => {
      const j = i + dir
      if (j < 0 || j >= qs.length) return qs
      const c = [...qs]; [c[i], c[j]] = [c[j], c[i]]; return c
    })
  }
  function changeType(i, type) {
    updateQ(i, { question_type: type, options: hasOptions(type) ? (questions[i].options?.length ? questions[i].options : ["ตัวเลือก 1"]) : [] })
  }
  // options
  function addOpt(i) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: [...(q.options || []), `ตัวเลือก ${(q.options?.length || 0) + 1}`] } : q)) }
  function updateOpt(i, k, val) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? val : o) } : q)) }
  function removeOpt(i, k) { setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k) } : q)) }

  async function saveMeta() {
    await updateSurvey(survey.id, { title: title.trim() || "แบบประเมิน", pattern: pattern || null, description: desc })
  }
  async function onSave() {
    // validate
    for (const q of questions) {
      if (!q.question_text.trim()) { flash("มีคำถามที่ยังไม่ได้พิมพ์ข้อความ", false); return }
      if (hasOptions(q.question_type) && (!q.options || q.options.length === 0)) { flash("คำถามเลือกตอบต้องมีตัวเลือก", false); return }
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
        {/* tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
          <button onClick={() => setTab("build")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${tab === "build" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500"}`}>สร้างคำถาม</button>
          <button onClick={() => setTab("share")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${tab === "share" ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500"}`}>ลิงก์ / QR</button>
        </div>
      </div>

      {tab === "build" ? (
        <>
          {/* meta */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 border-t-4" style={{ borderTopColor: BRAND }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อแบบประเมิน"
              className="w-full text-lg font-bold text-slate-800 border-0 border-b-2 border-slate-100 focus:border-[#F15A24] outline-none pb-1 bg-transparent" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" rows={2}
              className="w-full text-sm text-slate-600 border-0 border-b border-slate-100 focus:border-[#F15A24] outline-none resize-none bg-transparent" />
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">แพทเทิร์น</label>
              <select value={pattern} onChange={(e) => setPattern(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none">
                <option value="">— เลือกแพทเทิร์น —</option>
                {PATTERNS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
          </div>

          {/* questions */}
          {questions.map((q, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-slate-300 mt-2.5 w-5 text-center shrink-0">{i + 1}</span>
                <input value={q.question_text} onChange={(e) => updateQ(i, { question_text: e.target.value })} placeholder="พิมพ์คำถาม…"
                  className="flex-1 text-sm font-medium text-slate-800 border-0 border-b border-slate-100 focus:border-[#F15A24] outline-none pb-1 bg-transparent" />
                <select value={q.question_type} onChange={(e) => changeType(i, e.target.value)}
                  className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:border-[#F15A24] outline-none shrink-0">
                  {Q_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>

              {/* preview / options ตามชนิด */}
              <div className="pl-7">
                {q.question_type === "rating" && (
                  <div className="flex gap-1 text-2xl text-slate-200">{[1,2,3,4,5].map((n) => <span key={n}>★</span>)}</div>
                )}
                {q.question_type === "scale" && (
                  <div className="flex gap-1.5">{[1,2,3,4,5].map((n) => <span key={n} className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg text-xs text-slate-400">{n}</span>)}</div>
                )}
                {(q.question_type === "short_text" || q.question_type === "long_text") && (
                  <div className={`border border-slate-200 rounded-lg px-3 text-xs text-slate-300 flex items-center bg-slate-50 ${q.question_type === "long_text" ? "h-16" : "h-9"}`}>ผู้ตอบพิมพ์ข้อความ…</div>
                )}
                {hasOptions(q.question_type) && (
                  <div className="space-y-1.5">
                    {q.options.map((o, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className={`w-4 h-4 border-2 border-slate-300 shrink-0 ${q.question_type === "radio" ? "rounded-full" : "rounded"}`} />
                        <input value={o} onChange={(e) => updateOpt(i, k, e.target.value)}
                          className="flex-1 text-sm text-slate-700 border-0 border-b border-slate-100 focus:border-[#F15A24] outline-none pb-0.5 bg-transparent" />
                        {q.options.length > 1 && <button onClick={() => removeOpt(i, k)} className="p-1 text-slate-300 hover:text-rose-500">{IC.x}</button>}
                      </div>
                    ))}
                    <button onClick={() => addOpt(i)} className="text-xs text-[#F15A24] font-bold flex items-center gap-1 mt-1">{IC.plus} เพิ่มตัวเลือก</button>
                  </div>
                )}
              </div>

              {/* footer */}
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
      ) : (
        /* ── TAB: ลิงก์/QR ── */
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