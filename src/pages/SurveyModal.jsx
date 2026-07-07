import { useState } from "react"
import { saveSurvey } from "../lib/supabase.js"

// รายการตัวเลือก
export const PAST_ACTIVITIES = [
  "ไม่เคย",
  "ค่าย Game Academy",
  "ค่าย Animation Academy 2D",
  "ค่าย Animation Academy 3D",
  "ค่าย DII",
  "ค่าย Robot conquer",
  "ค่าย Micro:bit",
  "ค่าย Generative AI for Web Development",
  "ค่าย Gifted School 2023 - 2024",
  "โครงการ Alpha Academy ของโรงเรียน อบรมร่วมกับโรงเรียน",
  "กิจกรรม Open House",
]

export const PR_CHANNELS = [
  "Facebook CAMT CMU",
  "เว็บไซต์ www.camt.cmu.ac.th",
  "คุณครูที่โรงเรียนแนะนำ",
  "ผู้ปกครองแนะนำ",
  "เพื่อนแนะนำ",
  "มีเจ้าหน้าที่ไป Road Show ที่โรงเรียน",
  "จาก @LINE CAMTCMU",
  "จาก IG",
  "จาก Twitter",
]

const PDPA_TEXT = [
  "1. การสมัครเรียนในโครงการ ไม่ได้เป็นการรับประกันการรับเข้าศึกษาต่อในวิทยาลัยศิลปะ สื่อ และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ ผู้สมัครเข้าศึกษาต่อจะต้องมีคุณสมบัติเป็นไปตามประกาศของทางมหาวิทยาลัยเชียงใหม่เท่านั้น",
  "2. ผู้เรียนจะต้องมีเวลาเรียนในโครงการ เกิน 80% ถึงจะได้รับใบประกาศนียบัตรจากโครงการ",
  "3. วิทยาลัยศิลปะ สื่อ และเทคโนโลยี ขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อกำหนดและเงื่อนไข โดยไม่ต้องแจ้งให้ทราบล่วงหน้า",
]
const PDPA_CONSENT_TEXT = "ข้าพเจ้ายินยอมให้หน่วยงาน/สถานศึกษา เก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคลของข้าพเจ้า เช่น ชื่อ-สกุล หมายเลขบัตรประจำตัวประชาชน ชื่อผู้ปกครอง และข้อมูลที่เกี่ยวข้อง เพื่อวัตถุประสงค์ในการวิเคราะห์ข้อมูลด้านการศึกษาต่อ การแนะแนว การพัฒนาหลักสูตร และการจัดทำสถิติหรือรายงานเชิงวิชาการ โดยหน่วยงานจะดำเนินการตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) และจะเก็บรักษาข้อมูลอย่างเหมาะสม ปลอดภัย และใช้ข้อมูลเท่าที่จำเป็นตามวัตถุประสงค์ที่กำหนด"

function Check({ checked, onChange, label }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer py-1.5 group">
      <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${checked ? "bg-[#F15A24] border-[#F15A24]" : "border-slate-300 group-hover:border-orange-300"}`}>
        {checked && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className="hidden" />
      <span className="text-sm text-slate-700 leading-relaxed">{label}</span>
    </label>
  )
}

// โหมด: gate (บังคับตอบก่อนสมัคร) / readonly (ดูในโปรไฟล์ แก้ไม่ได้)
export default function SurveyModal({ mode = "gate", initial = null, onDone, onClose }) {
  const readonly = mode === "readonly"
  const [consent, setConsent] = useState(initial?.pdpa_consent ?? null) // true/false/null
  const [acts, setActs] = useState(new Set(Array.isArray(initial?.past_activities) ? initial.past_activities : []))
  const [actsOther, setActsOther] = useState(initial?.past_activities_other || "")
  const [prs, setPrs] = useState(new Set(Array.isArray(initial?.pr_channels) ? initial.pr_channels : []))
  const [prsOther, setPrsOther] = useState(initial?.pr_channels_other || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function toggle(set, setter, val) {
    if (readonly) return
    const next = new Set(set)
    next.has(val) ? next.delete(val) : next.add(val)
    setter(next)
  }

  async function submit() {
    if (readonly) return onClose?.()
    if (consent === null) return setError("กรุณาเลือกยินยอม/ไม่ยินยอมในข้อตกลง")
    if (consent === false) return setError("ต้องยินยอมข้อตกลง PDPA ก่อนจึงจะสมัครได้")
    if (acts.size === 0 && !actsOther.trim()) return setError("กรุณาตอบข้อ 'เคยร่วมกิจกรรม'")
    setSaving(true); setError("")
    try {
      await saveSurvey({
        pdpa_consent: consent,
        past_activities: [...acts],
        past_activities_other: actsOther.trim() || null,
        pr_channels: [...prs],
        pr_channels_other: prsOther.trim() || null,
      })
      onDone?.()
    } catch (e) {
      if (e.message?.includes("ALREADY_DONE")) { onDone?.() }
      else setError("บันทึกไม่สำเร็จ: " + e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 sm:px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-white text-base sm:text-lg">แบบสอบถามก่อนสมัคร</h3>
            <p className="text-white/80 text-xs mt-0.5">{readonly ? "ข้อมูลนี้ตอบไว้แล้ว (แก้ไขไม่ได้)" : "ตอบครั้งเดียว ใช้ตลอดการสมัคร"}</p>
          </div>
          {readonly && <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>}
        </div>

        {/* Body */}
        <div className={`overflow-y-auto px-5 sm:px-6 py-5 space-y-6 ${readonly ? "opacity-75" : ""}`}>
          {/* PDPA */}
          <section>
            <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
              <span className="w-6 h-6 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-xs font-black">1</span>
              ข้อตกลงและความยินยอม (PDPA)
            </h4>
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs text-slate-600 leading-relaxed">
              {PDPA_TEXT.map((t, i) => <p key={i}>{t}</p>)}
              <p className="pt-1 border-t border-slate-200 mt-2">{PDPA_CONSENT_TEXT}</p>
            </div>
            <div className="flex gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${consent === true ? "border-[#F15A24]" : "border-slate-300"}`}>
                  {consent === true && <span className="w-2.5 h-2.5 rounded-full bg-[#F15A24]" />}
                </span>
                <input type="radio" checked={consent === true} onChange={() => !readonly && setConsent(true)} className="hidden" />
                <span className="text-sm font-medium text-slate-700">ยินยอมในข้อตกลง</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${consent === false ? "border-rose-500" : "border-slate-300"}`}>
                  {consent === false && <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />}
                </span>
                <input type="radio" checked={consent === false} onChange={() => !readonly && setConsent(false)} className="hidden" />
                <span className="text-sm font-medium text-slate-700">ไม่ยินยอม</span>
              </label>
            </div>
          </section>

          {/* เคยร่วมกิจกรรม */}
          <section>
            <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
              <span className="w-6 h-6 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-xs font-black">2</span>
              ท่านเคยร่วมโครงการที่วิทยาลัยฯ จัดกิจกรรมใดบ้าง
            </h4>
            <div className="pl-1">
              {PAST_ACTIVITIES.map((a) => (
                <Check key={a} checked={acts.has(a)} onChange={() => toggle(acts, setActs, a)} label={a} />
              ))}
              <div className="mt-2">
                <label className="text-xs font-bold text-slate-500">อื่น ๆ โปรดระบุ</label>
                <input value={actsOther} onChange={(e) => !readonly && setActsOther(e.target.value)} readOnly={readonly}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] read-only:bg-slate-50" />
              </div>
            </div>
          </section>

          {/* ประชาสัมพันธ์ */}
          <section>
            <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
              <span className="w-6 h-6 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-xs font-black">3</span>
              ท่านรับทราบข้อมูลการประชาสัมพันธ์จากช่องทางไหน
            </h4>
            <div className="pl-1">
              {PR_CHANNELS.map((a) => (
                <Check key={a} checked={prs.has(a)} onChange={() => toggle(prs, setPrs, a)} label={a} />
              ))}
              <div className="mt-2">
                <label className="text-xs font-bold text-slate-500">อื่น ๆ</label>
                <input value={prsOther} onChange={(e) => !readonly && setPrsOther(e.target.value)} readOnly={readonly}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] read-only:bg-slate-50" />
              </div>
            </div>
          </section>

          {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        {!readonly && (
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-white shrink-0">
            <button onClick={submit} disabled={saving}
              className="w-full bg-gradient-to-r from-[#F15A24] to-amber-500 hover:from-[#c44215] hover:to-amber-600 text-white font-bold py-3 rounded-xl shadow-md transition active:scale-[0.98] disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึกและสมัครต่อ"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}