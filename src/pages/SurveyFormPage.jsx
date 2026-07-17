import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { getSurveyForm, submitSurveyResponse } from "../lib/supabase.js"

const BRAND = "#F15A24"

// get_survey_form อาจคืนได้หลายรูป — normalize ให้เหลือ { meta, questions }
function normalize(raw) {
  const data = Array.isArray(raw) ? raw[0] : raw
  if (!data) return null
  const meta = data.survey || data
  const questions = data.questions || data.survey_questions || meta.questions || meta.survey_questions || []
  return {
    title: meta.title || "แบบประเมิน",
    description: meta.description || "",
    is_open: meta.is_open !== false, // default เปิด ถ้าไม่ได้ระบุ
    questions: [...questions]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((q) => ({ ...q, options: q.options || [] })),
  }
}

export default function SurveyFormPage() {
  const { surveyId, courseId } = useParams()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(null)
  const [answers, setAnswers] = useState({})   // { [questionId]: value }
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    getSurveyForm(surveyId, courseId || null)
      .then((raw) => setForm(normalize(raw)))
      .catch((e) => setLoadErr(e.message || "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false))
  }, [surveyId, courseId])

  const setA = (qid, val) => { setAnswers((p) => ({ ...p, [qid]: val })); setErr(null) }
  const toggleCheck = (qid, opt) => setAnswers((p) => {
    const cur = Array.isArray(p[qid]) ? p[qid] : []
    return { ...p, [qid]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] }
  })

  function isBlank(q) {
    const v = answers[q.id]
    if (q.question_type === "checkbox") return !Array.isArray(v) || v.length === 0
    return v === undefined || v === null || v === ""
  }

  async function submit() {
    for (const q of form.questions) {
      if (q.required && isBlank(q)) { setErr(`กรุณาตอบข้อ "${q.question_text}"`); return }
    }
    setSubmitting(true); setErr(null)
    try {
      await submitSurveyResponse(surveyId, courseId || null, answers, name.trim())
      setDone(true)
    } catch (e) { setErr("ส่งไม่สำเร็จ: " + (e.message || "")) }
    finally { setSubmitting(false) }
  }

  // ── สถานะหน้า ──
  if (loading) return <Center>กำลังโหลด…</Center>
  if (loadErr) return <Center>⚠️ {loadErr}</Center>
  if (!form) return <Center>ไม่พบแบบประเมินนี้</Center>
  if (!form.is_open && !done) return <Center>แบบประเมินนี้ปิดรับแล้ว 🙏</Center>
  if (done) return (
    <Center>
      <div className="text-5xl mb-3">✅</div>
      <div className="text-lg font-extrabold text-slate-800 mb-1">ส่งแบบประเมินเรียบร้อย</div>
      <div className="text-sm text-slate-500">ขอบคุณสำหรับความคิดเห็นของคุณ</div>
    </Center>
  )

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-xl mx-auto space-y-3">
        {/* หัวฟอร์ม */}
        <div className="bg-white rounded-2xl shadow-sm border-t-4 overflow-hidden" style={{ borderTopColor: BRAND }}>
          <div className="p-5">
            <h1 className="text-xl font-extrabold text-slate-800">{form.title}</h1>
            {form.description && <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">{form.description}</p>}
          </div>
        </div>

        {/* ชื่อผู้ตอบ (ไม่บังคับ) */}
        <Card>
          <label className="text-sm font-bold text-slate-700 block mb-1.5">ชื่อผู้ตอบ <span className="text-slate-300 font-normal">(ไม่บังคับ)</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อของคุณ"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition" />
        </Card>

        {/* คำถาม */}
        {form.questions.map((q, i) => (
          <Card key={q.id}>
            <div className="flex gap-1.5 mb-3">
              <span className="text-sm font-bold text-slate-800">{i + 1}. {q.question_text}</span>
              {q.required && <span className="text-rose-500 font-bold">*</span>}
            </div>

            {q.question_type === "rating" && (
              <div className="flex gap-1.5 text-3xl">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setA(q.id, n)}
                    className={`transition ${Number(answers[q.id]) >= n ? "text-amber-400" : "text-slate-200 hover:text-amber-200"}`}>★</button>
                ))}
              </div>
            )}

            {q.question_type === "scale" && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setA(q.id, n)}
                    className={`w-11 h-11 rounded-xl border-2 text-sm font-bold transition ${Number(answers[q.id]) === n ? "border-[#F15A24] bg-orange-50 text-[#F15A24]" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>{n}</button>
                ))}
              </div>
            )}

            {q.question_type === "linear_scale" && (() => {
              const cfg = (q.options && !Array.isArray(q.options)) ? q.options : {}
              const min = Number(cfg.min ?? 1), max = Number(cfg.max ?? 5)
              const nums = Array.from({ length: Math.max(1, max - min + 1) }, (_, i) => min + i)
              return (
                <div className="space-y-2">
                  {(cfg.minLabel || cfg.maxLabel) && (
                    <div className="flex justify-between text-[11px] text-slate-400 font-bold">
                      <span>{cfg.minLabel || ""}</span><span>{cfg.maxLabel || ""}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {nums.map((n) => (
                      <button key={n} type="button" onClick={() => setA(q.id, n)}
                        className={`w-11 h-11 rounded-xl border-2 text-sm font-bold transition ${Number(answers[q.id]) === n ? "border-[#F15A24] bg-orange-50 text-[#F15A24]" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>{n}</button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {q.question_type === "dropdown" && (
              <select value={answers[q.id] || ""} onChange={(e) => setA(q.id, e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition">
                <option value="">— เลือก —</option>
                {(Array.isArray(q.options) ? q.options : []).map((o, k) => <option key={k} value={o}>{o}</option>)}
              </select>
            )}

            {q.question_type === "radio" && (
              <div className="space-y-2">
                {(Array.isArray(q.options) ? q.options : []).map((o, k) => (
                  <button key={k} type="button" onClick={() => setA(q.id, o)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border-2 transition ${answers[q.id] === o ? "border-[#F15A24] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${answers[q.id] === o ? "border-[#F15A24]" : "border-slate-300"}`}>
                      {answers[q.id] === o && <span className="w-2 h-2 rounded-full bg-[#F15A24]" />}
                    </span>
                    <span className="text-sm text-slate-700">{o}</span>
                  </button>
                ))}
              </div>
            )}

            {q.question_type === "checkbox" && (
              <div className="space-y-2">
                {q.options.map((o, k) => {
                  const on = Array.isArray(answers[q.id]) && answers[q.id].includes(o)
                  return (
                    <button key={k} type="button" onClick={() => toggleCheck(q.id, o)}
                      className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border-2 transition ${on ? "border-[#F15A24] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${on ? "border-[#F15A24] bg-[#F15A24]" : "border-slate-300"}`}>
                        {on && <span className="text-white text-[10px] font-black leading-none">✓</span>}
                      </span>
                      <span className="text-sm text-slate-700">{o}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {q.question_type === "short_text" && (
              <input value={answers[q.id] || ""} onChange={(e) => setA(q.id, e.target.value)} placeholder="พิมพ์คำตอบ…"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition" />
            )}

            {q.question_type === "long_text" && (
              <textarea value={answers[q.id] || ""} onChange={(e) => setA(q.id, e.target.value)} placeholder="พิมพ์คำตอบ…" rows={4}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none transition resize-none" />
            )}
          </Card>
        ))}

        {err && <div className="bg-rose-50 border border-rose-200 text-rose-600 text-sm font-semibold rounded-xl px-4 py-3">{err}</div>}

        <button onClick={submit} disabled={submitting}
          className="w-full text-white py-3.5 rounded-2xl text-sm font-extrabold shadow-sm transition active:scale-95 disabled:opacity-50" style={{ background: BRAND }}>
          {submitting ? "กำลังส่ง…" : "ส่งแบบประเมิน"}
        </button>
        <div className="h-6" />
      </div>
    </div>
  )
}

function Card({ children }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">{children}</div>
}
function Center({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center text-slate-500">{children}</div>
    </div>
  )
}
