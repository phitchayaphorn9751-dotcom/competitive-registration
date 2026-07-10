import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getSession, isAdminUser, fetchMyProfile, saveProfile, searchSchools, fetchAllSchools, searchThaiAddress } from "../lib/supabase.js"
import { useLang } from "../lib/i18n.jsx"

const TITLES = ["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว", "นาง"]
const PARENT_TITLES = ["นาย", "นางสาว", "นาง"]
const GRADE_GROUPS = ["ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย", "ปวช.", "ปวส.", "อื่นๆ"]
const SUB_GRADES = {
  "ประถมศึกษา": ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"],
  "มัธยมศึกษาตอนต้น": ["ม.1", "ม.2", "ม.3"],
  "มัธยมศึกษาตอนปลาย": ["ม.4", "ม.5", "ม.6"],
  "ปวช.": ["ปี 1", "ปี 2", "ปี 3"],
  "ปวส.": ["ปี 1", "ปี 2"],
}

const BLANK = {
  nationality: "thai", national_id: "", passport_no: "", title: "",
  first_name: "", last_name: "", nickname: "", age: "", grade_level: "",
  school: "", phone: "", line_id: "",
  parent_title: "", parent_full_name: "", parent_relationship: "", parent_phone: "",
  address: "", subdistrict: "", district: "", province: "", zipcode: "",
  pdpa_consent: null, past_activities: [], past_activities_other: "", pr_channels: [], pr_channels_other: "",
}

// ตัวเลือกแบบสอบถาม (section 4)
const PAST_ACTIVITIES = [
  "ไม่เคย", "ค่าย Game Academy", "ค่าย Animation Academy 2D", "ค่าย Animation Academy 3D",
  "ค่าย DII", "ค่าย Robot conquer", "ค่าย Micro:bit", "ค่าย Generative AI for Web Development",
  "ค่าย Gifted School 2023 - 2024", "โครงการ Alpha Academy ของโรงเรียน อบรมร่วมกับโรงเรียน", "กิจกรรม Open House",
]
const PR_CHANNELS = [
  "Facebook CAMT CMU", "เว็บไซต์ www.camt.cmu.ac.th", "คุณครูที่โรงเรียนแนะนำ", "ผู้ปกครองแนะนำ",
  "เพื่อนแนะนำ", "มีเจ้าหน้าที่ไป Road Show ที่โรงเรียน", "จาก @LINE CAMTCMU", "จาก IG", "จาก Twitter",
]
const PDPA_CONSENT_TEXT = "ข้าพเจ้ายินยอมให้หน่วยงาน/สถานศึกษา เก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคลของข้าพเจ้า เพื่อวัตถุประสงค์ในการวิเคราะห์ข้อมูลด้านการศึกษาต่อ การแนะแนว การพัฒนาหลักสูตร และการจัดทำสถิติหรือรายงานเชิงวิชาการ ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)"

function checkThaiID(id) {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id.charAt(i)) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === parseInt(id.charAt(12))
}
function normalizeSchool(s) {
  return s.toLowerCase().replace(/โรงเรียน|ร\.ร\.|รร\./g, "").trim()
}

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้าอื่น ─────
const Ico = {
  user:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>),
  check:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>),
  search:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  warn:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>),
  pencil:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>),
  arrowLeft:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
}

// ── Tailwind class presets (โทน slate/ส้ม) ──
const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100 outline-none transition-all placeholder-slate-300"
const readonlyCls = "w-full px-3 py-2.5 border border-slate-100 rounded-xl text-sm text-slate-700 bg-slate-50 outline-none"
const selectCls = inputCls

export default function ProfilePage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [f, setF] = useState(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState("")
  const [gradeGroup, setGradeGroup] = useState("")
  const [gradeDetail, setGradeDetail] = useState("")
  const [customGrade, setCustomGrade] = useState(false)
  const [showSurvey, setShowSurvey] = useState(false)
  const [rawProfile, setRawProfile] = useState(null)  // เก็บ field ดิบ (survey)
  const [schoolOptions, setSchoolOptions] = useState([])
  const [allSchools, setAllSchools] = useState([])
  const [showSchoolDD, setShowSchoolDD] = useState(false)
  const [schoolVerified, setSchoolVerified] = useState(false)
  const [customSchool, setCustomSchool] = useState(false)
  const [addrOptions, setAddrOptions] = useState([])
  const [showAddrDD, setShowAddrDD] = useState(false)
  const [addrVerified, setAddrVerified] = useState(false)
  const [activeSection, setActiveSection] = useState(1)

  useEffect(() => {
    fetchAllSchools().then(setAllSchools).catch(() => {})
  }, [])

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) { navigate("/login"); return }
      if (await isAdminUser()) { navigate("/admin/dashboard"); return }
      setEmail(s.user.email || "")
      try {
        const p = await fetchMyProfile()
        if (p) {
          setRawProfile(p)
          setF({ ...BLANK, ...cleanNulls(p) })
          const gl = p.grade_level || ""
          const grp = GRADE_GROUPS.find((g) => gl.startsWith(g) && g !== "อื่นๆ")
          if (grp) { setGradeGroup(grp); setGradeDetail(gl.slice(grp.length).trim()) }
          else if (gl) setCustomGrade(true)
          if (p.school) setSchoolVerified(true)
          if (p.province && p.district) setAddrVerified(true)
        }
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })
  }, [navigate])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))
  // กรองเฉพาะตัวเลข จำกัดความยาว
  function setNumeric(k, val, maxLen) {
    const n = val.replace(/[^0-9]/g, "").slice(0, maxLen)
    set(k, n)
  }

  function applyGrade(group, detail) {
    const combined = group === "อื่นๆ" ? f.grade_level : [group, detail].filter(Boolean).join(" ")
    set("grade_level", combined)
  }
  function onGradeGroup(val) {
    if (val === "อื่นๆ") { setCustomGrade(true); setGradeGroup(""); setGradeDetail(""); set("grade_level", ""); return }
    setCustomGrade(false); setGradeGroup(val); setGradeDetail(""); set("grade_level", val)
  }
  function onGradeDetail(val) { setGradeDetail(val); applyGrade(gradeGroup, val) }

  async function onSchoolInput(val) {
    set("school", val); setSchoolVerified(false)
    if (val.trim().length === 0) { setShowSchoolDD(false); return }
    const norm = normalizeSchool(val)
    // ค้นจากรายชื่อที่โหลดไว้ (เร็ว)
    let list = allSchools.filter((s) => normalizeSchool(s).includes(norm)).slice(0, 10)
    // ถ้ายังไม่มีข้อมูลในเครื่อง (allSchools ว่าง) → ค้นจาก DB โดยตรง
    if (list.length === 0 && allSchools.length === 0) {
      try { list = await searchSchools(val) } catch { list = [] }
    }
    setSchoolOptions(list); setShowSchoolDD(true)
  }
  function pickSchool(name) { set("school", name); setSchoolVerified(true); setCustomSchool(false); setShowSchoolDD(false) }
  function toggleCustomSchool() { setCustomSchool((p) => !p); set("school", ""); setSchoolVerified(false); setShowSchoolDD(false) }

  async function onSubdistrictInput(val) {
    setF((prev) => ({ ...prev, subdistrict: val, district: "", province: "", zipcode: "" }))
    setAddrVerified(false)
    if (val.trim().length >= 2) {
      try { const list = await searchThaiAddress(val); setAddrOptions(list); setShowAddrDD(true) }
      catch { setAddrOptions([]) }
    } else { setShowAddrDD(false) }
  }
  function pickAddress(a) {
    setF((prev) => ({ ...prev, subdistrict: a.subDistrict, district: a.district, province: a.province, zipcode: a.postalCode }))
    setAddrVerified(true); setShowAddrDD(false)
  }

  async function handleSave() {
    setError(null)
    if (!f.first_name.trim() || !f.last_name.trim()) return setError("กรุณากรอกชื่อ-นามสกุล")
    if (f.nationality === "thai") {
      if (f.national_id.length !== 13) return setError("เลขบัตรประชาชนต้องมีครบ 13 หลัก")
      if (!checkThaiID(f.national_id)) return setError("เลขบัตรประชาชนไม่ถูกต้อง (กรุณาตรวจสอบอีกครั้ง)")
    } else {
      if (!f.passport_no.trim() || f.passport_no.trim().length < 5) return setError("กรุณาระบุเลข Passport ให้ถูกต้อง")
    }
    if (f.phone.length !== 10) return setError("เบอร์โทรศัพท์ต้องมีครบ 10 หลัก")
    if (!f.phone.startsWith("0")) return setError("เบอร์โทรศัพท์ต้องขึ้นต้นด้วยเลข 0")
    if (f.school && !schoolVerified && !customSchool)
      return setError("กรุณาเลือกโรงเรียนจากรายการ หากไม่พบให้กด 'ไม่พบโรงเรียนของฉัน'")

    // แบบสอบถาม section 4 — บังคับตอบครั้งแรก (ถ้ายังไม่เคยตอบ)
    if (!rawProfile?.survey_done) {
      if (f.pdpa_consent === null || f.pdpa_consent === undefined)
        return setError("กรุณาเลือกยินยอม/ไม่ยินยอม ในแบบสอบถาม (ส่วนที่ 4)")
      if (f.pdpa_consent === false)
        return setError("ต้องยินยอมข้อตกลง PDPA ก่อนจึงจะลงทะเบียนได้")
      const acts = Array.isArray(f.past_activities) ? f.past_activities : []
      if (acts.length === 0 && !f.past_activities_other?.trim())
        return setError("กรุณาตอบข้อ 'เคยร่วมกิจกรรม' ในแบบสอบถาม (ส่วนที่ 4)")
    }

    setSaving(true)
    try { await saveProfile(f); navigate("/") }
    catch (e) { setError("บันทึกไม่สำเร็จ: " + e.message) }
    finally { setSaving(false) }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 font-semibold text-sm">{t("common.loading")}</span>
        </div>
      </div>
    )
  }

  const sectionCls = (n) => `bg-white rounded-3xl p-6 sm:p-8 transition-all duration-300 border ${
    activeSection === n
      ? "shadow-[0_8px_30px_rgb(0,0,0,0.06)] border-[#F15A24]/30 ring-1 ring-[#F15A24]/10"
      : "shadow-sm border-slate-100 hover:border-slate-200 cursor-pointer opacity-70 hover:opacity-100"
  }`

  return (
    <div className="min-h-screen bg-slate-50 pb-24 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-orange-100/40 to-transparent pointer-events-none" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Header card */}
        <div className="bg-white rounded-3xl p-8 sm:p-10 mb-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#F15A24] to-amber-500" />
          <div className="h-16 w-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[#F15A24] to-amber-500 flex items-center justify-center text-white shadow-sm shadow-orange-500/20">
            <Ico.user className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{t("profile.title")}</h2>
          <p className="text-slate-500 text-sm mt-2 font-medium">{t("profile.subtitle")}</p>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 mt-8">
            {[t("profile.step1"), t("profile.step3"), "แบบสอบถาม"].map((label, i) => (
              <div key={i} className="flex items-center gap-3 sm:gap-6">
                <div className={`flex flex-col sm:flex-row items-center gap-2 text-xs font-bold transition-all ${activeSection === i + 1 ? "text-[#F15A24]" : "text-slate-400"}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                    activeSection === i + 1 ? "bg-orange-50 text-[#F15A24] border-2 border-[#F15A24] shadow-sm"
                    : activeSection > i + 1 ? "bg-emerald-500 text-white border-2 border-emerald-500"
                    : "bg-slate-50 text-slate-400 border-2 border-slate-100"}`}>
                    {activeSection > i + 1 ? <Ico.check className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className="mt-1 sm:mt-0">{label}</span>
                </div>
                {i < 2 && <div className={`hidden sm:block w-8 sm:w-12 h-[2px] rounded-full transition-colors ${activeSection > i + 1 ? "bg-[#F15A24]" : "bg-slate-100"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* ══ Section 1 ══ */}
          <div className={sectionCls(1)} onClick={() => setActiveSection(1)}>
            <SectionHeader number="1" title={t("profile.personalInfo")} />

            <div className="mb-4">
              <Label>{t("profile.nationality")}</Label>
              <div className="flex gap-3">
                {[{ val: "thai", label: t("profile.thai") }, { val: "foreign", label: t("profile.foreign") }].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => set("nationality", val)}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                      f.nationality === val ? "border-[#F15A24] bg-orange-50 text-[#F15A24]" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>{f.nationality === "thai" ? t("profile.nationalId") : t("profile.passport")}</Label>
                {f.nationality === "thai" ? (
                  <input className={inputCls} value={f.national_id} inputMode="numeric"
                    onChange={(e) => setNumeric("national_id", e.target.value, 13)} placeholder={t("profile.idPlaceholder")} />
                ) : (
                  <input className={inputCls} value={f.passport_no} onChange={(e) => set("passport_no", e.target.value)} placeholder="Passport No." />
                )}
              </div>
              <div><Label>{t("profile.nickname")}</Label><input className={inputCls} value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>{t("profile.titleName")}</Label>
                <select className={selectCls} value={f.title} onChange={(e) => set("title", e.target.value)}>
                  <option value="">{t("profile.select")}</option>
                  {TITLES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
                </select>
              </div>
              <div><Label>{t("profile.firstName")} *</Label><input className={inputCls} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
              <div><Label>{t("profile.lastName")} *</Label><input className={inputCls} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <div className="sm:col-span-1">
                <Label>{t("profile.age")}</Label>
                <input className={inputCls} value={f.age} inputMode="numeric" onChange={(e) => setNumeric("age", e.target.value, 2)} placeholder="ปี" />
              </div>
              <div className="sm:col-span-3">
                <Label>{t("profile.grade")}</Label>
                <div className="flex gap-2">
                  <select className={`${selectCls} flex-1`} value={customGrade ? "อื่นๆ" : gradeGroup} onChange={(e) => onGradeGroup(e.target.value)}>
                    <option value="">{t("profile.selectGrade")}</option>
                    {GRADE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {!customGrade && SUB_GRADES[gradeGroup] && (
                    <select className={`${selectCls} flex-1`} value={gradeDetail} onChange={(e) => onGradeDetail(e.target.value)}>
                      <option value="">— ชั้นปี —</option>
                      {SUB_GRADES[gradeGroup].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
                {customGrade && (
                  <input className={`${inputCls} mt-2 border-orange-300 bg-orange-50`} placeholder="ระบุระดับชั้น…"
                    value={f.grade_level} onChange={(e) => set("grade_level", e.target.value)} />
                )}
              </div>
            </div>

            {/* โรงเรียน */}
            <div className="relative mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <Label>{t("profile.school")}</Label>
                <button type="button" onClick={toggleCustomSchool}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all ${customSchool ? "bg-orange-100 text-[#F15A24] border border-orange-300" : "text-slate-400 hover:text-[#F15A24] underline"}`}>
                  {customSchool ? (<><Ico.arrowLeft className="w-3 h-3" /> ค้นหาจากรายการ</>) : "ไม่พบโรงเรียนของฉัน"}
                </button>
              </div>
              {customSchool ? (
                <div>
                  <input className={`${inputCls} border-amber-300 bg-amber-50`} value={f.school}
                    placeholder="กรอกชื่อโรงเรียนภาษาไทยเต็ม เช่น โรงเรียนยุพราชวิทยาลัย"
                    onChange={(e) => set("school", e.target.value)} />
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Ico.pencil className="w-3 h-3" /> ข้อมูลนี้จะถูกบันทึกเป็นชื่อที่กรอกเอง (ไม่ผ่านการยืนยัน)</p>
                </div>
              ) : (
                <div className="relative">
                  <input className={inputCls} value={f.school} placeholder={t("profile.schoolPlaceholder")}
                    onChange={(e) => onSchoolInput(e.target.value)} onBlur={() => setTimeout(() => setShowSchoolDD(false), 200)} />
                  {schoolVerified && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold inline-flex items-center gap-0.5"><Ico.check className="w-3.5 h-3.5" /> ยืนยันแล้ว</span>}
                  {showSchoolDD && schoolOptions.length > 0 && (
                    <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
                      {schoolOptions.map((s, i) => (
                        <li key={i} onClick={() => pickSchool(s)} className="px-4 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 text-slate-700">{s}</li>
                      ))}
                    </ul>
                  )}
                  {f.school.length > 1 && !schoolVerified && showSchoolDD && schoolOptions.length === 0 && (
                    <div className="mt-1.5 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-xs text-orange-700 font-medium flex items-center gap-1"><Ico.search className="w-3 h-3 shrink-0" /> ไม่พบในรายการ — พิมพ์เป็นภาษาไทย หรือกด
                        <button type="button" onClick={toggleCustomSchool} className="underline font-bold ml-1 text-[#F15A24]">ไม่พบโรงเรียนของฉัน</button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("profile.phone")} *</Label>
                <input className={inputCls} value={f.phone} inputMode="numeric" onChange={(e) => setNumeric("phone", e.target.value, 10)} placeholder="08xxxxxxxx" />
              </div>
              <div><Label>{t("profile.lineId")}</Label><input className={inputCls} value={f.line_id} onChange={(e) => set("line_id", e.target.value)} /></div>
            </div>
          </div>

          {/* ══ Section 2: ที่อยู่ (เดิม Section 3 — ผู้ปกครองถูกนำออก) ══ */}
          <div className={sectionCls(2)} onClick={() => setActiveSection(2)}>
            <SectionHeader number="2" title={t("profile.addressInfo")} />
            <div className="mb-4">
              <Label>{t("profile.address")}</Label>
              <input className={inputCls} value={f.address} placeholder={t("profile.addressPlaceholder")} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 relative">
              <div className="relative">
                <Label>{t("profile.subdistrict")}</Label>
                <input className={inputCls} value={f.subdistrict} placeholder={t("profile.subdistrictPlaceholder")}
                  onChange={(e) => onSubdistrictInput(e.target.value)} onBlur={() => setTimeout(() => setShowAddrDD(false), 200)} />
                {showAddrDD && addrOptions.length > 0 && (
                  <ul className="absolute z-20 w-full sm:w-[200%] bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto mt-1 left-0">
                    {addrOptions.map((a, i) => (
                      <li key={i} onClick={() => pickAddress(a)} className="px-4 py-3 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 flex flex-col">
                        <span className="font-bold text-[#F15A24]">ต.{a.subDistrict} › อ.{a.district} › จ.{a.province}</span>
                        <span className="text-xs text-slate-400">รหัสไปรษณีย์: {a.postalCode}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {f.subdistrict.length > 0 && !addrVerified && !showAddrDD && (
                  <p className="text-xs text-slate-400 mt-1">กรอกอำเภอ/จังหวัด/รหัสไปรษณีย์ด้านล่างได้เลย</p>
                )}
              </div>
              <div>
                <Label>{t("profile.district")}</Label>
                <input className={addrVerified ? readonlyCls : inputCls} readOnly={addrVerified} value={f.district} onChange={(e) => set("district", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("profile.province")}</Label>
                <input className={addrVerified ? readonlyCls : inputCls} readOnly={addrVerified} value={f.province} onChange={(e) => set("province", e.target.value)} />
              </div>
              <div>
                <Label>{t("profile.zipcode")}</Label>
                <input className={addrVerified ? readonlyCls : inputCls} readOnly={addrVerified} value={f.zipcode} maxLength={5} onChange={(e) => set("zipcode", e.target.value)} />
              </div>
            </div>
          </div>

          {/* ══ Section 3: แบบสอบถาม (เดิม Section 4) — ตอบครั้งเดียว ══ */}
          <div className={sectionCls(3)} onClick={() => setActiveSection(3)}>
            <SectionHeader number="3" title="แบบสอบถาม" />
            {rawProfile?.survey_done && (
              <div className="mb-4 flex items-center gap-2 bg-slate-100 text-slate-500 rounded-xl px-3 py-2 text-xs">
                <Ico.check className="w-4 h-4" /> ตอบแบบสอบถามแล้ว — ส่วนนี้แก้ไขไม่ได้
              </div>
            )}

            {(() => {
              const locked = !!rawProfile?.survey_done
              const acts = Array.isArray(f.past_activities) ? f.past_activities : []
              const prs = Array.isArray(f.pr_channels) ? f.pr_channels : []
              const toggleAct = (a) => { if (locked) return; set("past_activities", acts.includes(a) ? acts.filter((x) => x !== a) : [...acts, a]) }
              const togglePr = (a) => { if (locked) return; set("pr_channels", prs.includes(a) ? prs.filter((x) => x !== a) : [...prs, a]) }
              const box = (checked, on) => (
                <span onClick={on} className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${locked ? "cursor-default" : "cursor-pointer"} ${checked ? "bg-[#F15A24] border-[#F15A24]" : "border-slate-300"}`}>
                  {checked && <Ico.check className="w-3 h-3 text-white" />}
                </span>
              )
              return (
                <div className={`space-y-6 ${locked ? "opacity-70" : ""}`}>
                  {/* PDPA */}
                  <div>
                    <p className="text-sm font-bold text-slate-700 mb-2">ข้อตกลงและความยินยอม (PDPA)</p>
                    <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed mb-3">{PDPA_CONSENT_TEXT}</div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${f.pdpa_consent === true ? "border-[#F15A24]" : "border-slate-300"}`}>
                          {f.pdpa_consent === true && <span className="w-2.5 h-2.5 rounded-full bg-[#F15A24]" />}
                        </span>
                        <input type="radio" checked={f.pdpa_consent === true} onChange={() => !locked && set("pdpa_consent", true)} className="hidden" />
                        <span className="text-sm font-medium text-slate-700">ยินยอม</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${f.pdpa_consent === false ? "border-rose-500" : "border-slate-300"}`}>
                          {f.pdpa_consent === false && <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />}
                        </span>
                        <input type="radio" checked={f.pdpa_consent === false} onChange={() => !locked && set("pdpa_consent", false)} className="hidden" />
                        <span className="text-sm font-medium text-slate-700">ไม่ยินยอม</span>
                      </label>
                    </div>
                  </div>

                  {/* เคยร่วมกิจกรรม */}
                  <div>
                    <p className="text-sm font-bold text-slate-700 mb-2">เคยร่วมโครงการที่วิทยาลัยฯ จัดกิจกรรมใดบ้าง</p>
                    <div className="space-y-1">
                      {PAST_ACTIVITIES.map((a) => (
                        <label key={a} className={`flex items-start gap-2.5 py-1 ${locked ? "" : "cursor-pointer"}`}>
                          {box(acts.includes(a), () => toggleAct(a))}
                          <span className="text-sm text-slate-700">{a}</span>
                        </label>
                      ))}
                      <div className="pt-1">
                        <Label>อื่น ๆ โปรดระบุ</Label>
                        <input className={locked ? readonlyCls : inputCls} readOnly={locked} value={f.past_activities_other} onChange={(e) => set("past_activities_other", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* ประชาสัมพันธ์ */}
                  <div>
                    <p className="text-sm font-bold text-slate-700 mb-2">รับทราบข้อมูลการประชาสัมพันธ์จากช่องทางไหน</p>
                    <div className="space-y-1">
                      {PR_CHANNELS.map((a) => (
                        <label key={a} className={`flex items-start gap-2.5 py-1 ${locked ? "" : "cursor-pointer"}`}>
                          {box(prs.includes(a), () => togglePr(a))}
                          <span className="text-sm text-slate-700">{a}</span>
                        </label>
                      ))}
                      <div className="pt-1">
                        <Label>อื่น ๆ</Label>
                        <input className={locked ? readonlyCls : inputCls} readOnly={locked} value={f.pr_channels_other} onChange={(e) => set("pr_channels_other", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3.5 text-sm">
              <Ico.warn className="w-4 h-4 shrink-0 mt-0.5" /><span className="font-medium">{error}</span>
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-[#F15A24] hover:bg-[#c44215] disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm">
            {saving ? t("profile.saving") : t("profile.saveAndContinue")}
          </button>
        </div>
      </div>

    </div>
  )
}

function Label({ children }) {
  return <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>
}
function SectionHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
      <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs font-black shrink-0">{number}</span>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
    </div>
  )
}
function cleanNulls(obj) {
  const out = {}
  for (const k in obj) out[k] = obj[k] == null ? "" : obj[k]
  return out
}