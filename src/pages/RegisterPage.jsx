import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  fetchCourse, fetchMyProfile, getSession, fetchMyRegistrationStatus,
  holdSeat, finalizeRegistration, setPaymentDeadline, fetchRegistrationDeadline, addParticipant, addAdvisor, uploadSlip, attachSlip, savePortfolioUrl,
  checkDuplicateRegistration, assignParticipantCode, assignCodesForRegistration, saveRegistrationTheme, assignSession,
  registerExternal,
  fetchAllSchools, searchSchools,
} from "../lib/supabase.js"
import SurveyModal from "./SurveyModal.jsx"
import { useLang } from "../lib/i18n.jsx"
import { catColor } from "../lib/categoryColors.js"

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้าอื่น ─────
const Ico = {
  user:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>),
  users:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  cap:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  tag:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>),
  clip:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>),
  arrowLeft:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
  warn:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>),
  info:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>),
  plus:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5v14"/></svg>),
  x:       (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>),
  card:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>),
  clock:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>),
  copy:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>),
  receipt: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>),
  check:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>),
  upload:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>),
  rotate:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>),
  list:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>),
}

export default function RegisterPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()

  const [course, setCourse] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showSurvey, setShowSurvey] = useState(false)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // สมาชิกเพิ่มเติม (กรณี team) — คนแรกคือเจ้าของ profile
  const [extraMembers, setExtraMembers] = useState([])
  const [advisor, setAdvisor] = useState({ full_name: "", phone: "", email: "" })
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [themeName, setThemeName] = useState("")        // ชื่อธีม (ข้อ 2.4)
  const [selectedSession, setSelectedSession] = useState("")  // รอบที่เลือก (ถ้าคอร์สมีรอบ)
  const [ownerNationalId, setOwnerNationalId] = useState("")  // เลขบัตรเจ้าของ (ถ้า profile ไม่มี)

  // โรงเรียน autocomplete สำหรับสมาชิก
  const [allSchools, setAllSchools] = useState([])
  const [schoolDD, setSchoolDD] = useState({ idx: -1, options: [] })  // idx = สมาชิกที่เปิด dropdown
  useEffect(() => { fetchAllSchools().then(setAllSchools).catch(() => {}) }, [])
  const normalizeSchool = (s) => (s || "").toLowerCase().replace(/โรงเรียน|ร\.ร\.|รร\./g, "").trim()
  async function onMemberSchoolInput(i, val) {
    updateMember(i, "school", val)
    if (val.trim().length === 0) { setSchoolDD({ idx: -1, options: [] }); return }
    const norm = normalizeSchool(val)
    let list = allSchools.filter((s) => normalizeSchool(s).includes(norm)).slice(0, 8)
    if (list.length === 0 && allSchools.length === 0) {
      try { list = await searchSchools(val) } catch { list = [] }
    }
    setSchoolDD({ idx: i, options: list })
  }
  function pickMemberSchool(i, name) { updateMember(i, "school", name); setSchoolDD({ idx: -1, options: [] }) }

  // ผลลัพธ์หลังกันที่นั่ง
  const [result, setResult] = useState(null) // { regId, requiresPayment, isWaitlist }
  // โหมดสมัครผ่านลิงก์นอก
  const [extOpened, setExtOpened] = useState(false)   // user กดเปิดลิงก์แล้วหรือยัง
  const [extSubmitting, setExtSubmitting] = useState(false)
  const [extDone, setExtDone] = useState(false)       // กด "ฉันสมัครแล้ว" สำเร็จ

  useEffect(() => {
    async function load() {
      try {
        const s = await getSession()
        if (!s) { navigate("/login"); return }
        setEmail(s.user.email || "")
        const [c, p] = await Promise.all([fetchCourse(courseId), fetchMyProfile()])
        setCourse(c)
        setProfile(p)
        setOwnerNationalId(p?.national_id || "")
        // team: เตรียมช่องสมาชิกเพิ่มตามจำนวนขั้นต่ำ (คนแรกคือเจ้าของ profile)
        if (c.count_mode === "team") {
          const minM = c.min_members || c.team_size || 1
          const startExtra = Math.max(0, minM - 1)
          setExtraMembers(Array.from({ length: startExtra }, () => ({ full_name: "", school: "", phone: "", email: "", national_id: "" })))
        }
      } catch (e) {
        setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId, navigate])

  function updateMember(idx, field, value) {
    setExtraMembers((prev) => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next
    })
  }
  // ขอบเขตจำนวนคนต่อทีม
  const minTeam = course?.count_mode === "team" ? (course.min_members || course.team_size || 1) : 1
  const maxTeam = course?.count_mode === "team" ? (course.max_members || course.team_size || 1) : 1
  const teamCount = extraMembers.length + 1 // +1 = เจ้าของ profile
  function addMember() {
    if (teamCount >= maxTeam) return
    setExtraMembers((prev) => [...prev, { full_name: "", school: "", phone: "", email: "", national_id: "" }])
  }
  function removeMember(idx) {
    if (teamCount <= minTeam) return
    setExtraMembers((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleConfirm() {
    setError(null)
    if (!profile?.first_name) {
      return setError("กรุณากรอกประวัติให้ครบก่อนสมัคร")
    }
    // gate: ต้องตอบแบบสอบถามก่อนสมัครคอร์สแรก
    if (!profile?.survey_done) {
      setShowSurvey(true)
      return
    }
    for (const m of extraMembers) {
      if (!m.full_name.trim()) return setError(t("reg.needName"))
    }
    if (course.count_mode === "team" && (teamCount < minTeam || teamCount > maxTeam)) {
      return setError(`ทีมต้องมี ${minTeam}-${maxTeam} คน (ตอนนี้ ${teamCount} คน)`)
    }
    if (course.count_mode === "team" && !themeName.trim()) {
      return setError("กรุณากรอกชื่อทีม / ชื่อธีมผลงาน")
    }
    const isCompetition = course.course_types?.requires_approval
    if (isCompetition && !advisor.full_name.trim()) {
      return setError(t("reg.needAdvisor"))
    }
    if (course.require_portfolio && !portfolioUrl.trim()) {
      return setError("กรุณาแนบลิงก์ผลงานก่อนสมัคร")
    }
    // เช็ครอบ (ถ้าคอร์สมีรอบ ต้องเลือก + รอบต้องยังว่าง)
    const hasSessions = Array.isArray(course.sessions) && course.sessions.length > 0
    if (hasSessions) {
      if (!selectedSession) return setError("กรุณาเลือกรอบที่ต้องการสมัคร")
      const sess = course.sessions.find((s) => s.id === selectedSession)
      if (!sess) return setError("รอบที่เลือกไม่ถูกต้อง")
      if ((sess.taken || 0) + teamCount > (sess.capacity || 0)) {
        return setError(`รอบ "${sess.label}" เหลือที่ไม่พอ (เหลือ ${Math.max(0, (sess.capacity || 0) - (sess.taken || 0))} ที่)`)
      }
    }

    setSubmitting(true)
    try {
      // ── ข้อ 5: เช็คสมัครซ้ำ (ถ้า RPC ยังไม่มี ข้ามไป ไม่บล็อกการสมัคร) ──
      const allNationalIds = [ownerNationalId, ...extraMembers.map((m) => m.national_id)].map((x) => (x || "").trim()).filter(Boolean)
      try {
        const dup = await checkDuplicateRegistration(courseId, email.trim(), allNationalIds)
        if (dup?.duplicate) {
          setSubmitting(false)
          if (dup.reason === "EMAIL_ALREADY_REGISTERED") return setError("คุณสมัครคอร์สนี้ไปแล้ว (สมัครซ้ำไม่ได้)")
          if (dup.reason === "MEMBER_ALREADY_REGISTERED") return setError("มีสมาชิกในธีมที่เลขบัตรเคยสมัครคอร์สนี้แล้ว (สมัครซ้ำไม่ได้)")
          return setError("ไม่สามารถสมัครซ้ำได้")
        }
      } catch (_) { /* RPC ยังไม่มี — ข้ามการเช็คซ้ำ */ }

      const fresh = await fetchCourse(courseId)
      const unlimited = fresh.seat_mode === "unlimited" || (fresh.capacity || 0) === 0
      // นับที่นั่งเป็น "จำนวนคน" — ทีมกี่คนกินที่นั่งเท่านั้น (teamCount)
      const willWaitlist = !unlimited && (fresh.seats_taken || 0) + teamCount > (fresh.capacity || 0)

      // ── ขั้นตอนหลัก (ต้องสำเร็จ) ──
      // กันที่นั่งตามจำนวนสมาชิกจริง (ทีม 3 คน = กัน 3 ที่นั่ง)
      const regId = await holdSeat(courseId, email.trim(), teamCount)

      // ถ้าคอร์สมีรอบ — บันทึกรอบที่เลือก + เพิ่ม taken ของรอบนั้น (fail ไม่ล้มการสมัคร)
      if (hasSessions && selectedSession) {
        try { await assignSession(courseId, regId, selectedSession, teamCount) } catch (_) {}
      }

      // ผู้สมัครคนแรก = เจ้าของ profile
      const ownerPid = await addParticipant(regId, {
        full_name: `${profile.title || ""} ${profile.first_name} ${profile.last_name}`.trim(),
        school: profile.school || "",
        grade_level: profile.grade_level || "",
        phone: profile.phone || "",
        email: email,
        national_id: ownerNationalId.trim(),
        extra_info: {},
      })
      // สมาชิกเพิ่มเติม
      for (const m of extraMembers) {
        if (!m.full_name.trim()) continue
        await addParticipant(regId, {
          full_name: m.full_name.trim(), school: m.school, grade_level: "",
          phone: m.phone, email: (m.email || "").trim().toLowerCase(),
          national_id: (m.national_id || "").trim(), extra_info: {},
        })
      }
      // ครูที่ปรึกษา (ถ้ามี)
      if (advisor.full_name.trim()) {
        try { await addAdvisor(regId, { full_name: advisor.full_name.trim(), phone: advisor.phone, email: (advisor.email || "").trim() }) } catch (_) {}
      }
      // ลิงก์ผลงาน (ถ้าวิชากำหนด) — fail ไม่ล้มการสมัคร
      const hasPortfolio = course.require_portfolio && portfolioUrl.trim()
      if (hasPortfolio) {
        try { await savePortfolioUrl(regId, portfolioUrl.trim()) }
        catch (e) { console.error("savePortfolioUrl failed:", e.message) }
      }
      // ชื่อธีม (บันทึกก่อน finalize) — fail ไม่ล้มการสมัคร
      if (themeName.trim()) {
        try { await saveRegistrationTheme(regId, themeName.trim()) }
        catch (e) { console.error("saveRegistrationTheme failed:", e.message) }
      }

      // ── ปรับสถานะ (สำคัญ — ต้องสำเร็จเพื่อให้ใบขึ้นรายการ) ──
      let finalStatus = null
      if (!willWaitlist) {
        try {
          finalStatus = await finalizeRegistration(regId, !!hasPortfolio)
        } catch (_) { /* ถ้า RPC ยังไม่มี ใบจะค้างที่ held แต่ยังขึ้นรายการ */ }
      }

      // ── เช็ค status จริงจาก DB (hold_seat อาจตั้ง waitlist ถ้าเต็ม แม้ JS เดาว่าไม่เต็ม) ──
      // ป้องกันกรณี seats_taken ที่ fetch มาไม่ตรงกับตอน hold จริง → พาไปหน้าจ่ายเงินผิด
      let actualWaitlist = willWaitlist
      try {
        const realStatus = finalStatus || (await fetchMyRegistrationStatus(regId))
        if (realStatus === "waitlist") actualWaitlist = true
      } catch (_) { /* อ่านไม่ได้ ใช้ค่าที่เดาไว้ */ }

      const requiresPayment = (course.price || 0) > 0

      // ── RPC เสริม (fail ได้ ไม่กระทบการสมัคร) ──
      try { if (ownerPid) await assignParticipantCode(ownerPid) } catch (_) {}
      try { await assignCodesForRegistration(regId) } catch (_) {}
      try { if (requiresPayment && !actualWaitlist) await setPaymentDeadline(regId) } catch (_) {}

      setResult({ regId, requiresPayment, isWaitlist: actualWaitlist, status: finalStatus, hasPortfolio: !!hasPortfolio })
    } catch (e) {
      setError(translateError(e.message))
    } finally {
      setSubmitting(false)
    }
  }

  // กด "ฉันสมัครแล้ว" (โหมดลิงก์นอก) → สร้าง record รอพิจารณา
  async function handleExternalConfirm() {
    setError(null); setExtSubmitting(true)
    try {
      const res = await registerExternal(courseId)
      setExtDone(true)
    } catch (e) {
      const m = e.message || ""
      if (m.includes("NOT_LOGGED_IN")) setError("กรุณาเข้าสู่ระบบก่อน")
      else if (m.includes("NOT_EXTERNAL_COURSE")) setError("คอร์สนี้ไม่ใช่คอร์สสมัครผ่านลิงก์นอก")
      else setError("เกิดข้อผิดพลาด: " + m)
    } finally { setExtSubmitting(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error && !course) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-rose-600 font-bold">{error}</p>
        <Link to="/" className="text-[#F15A24] font-bold">{t("reg.backToCourses")}</Link>
      </div>
    )
  }

  // ── หน้าผลลัพธ์หลังกันที่นั่ง ──
  if (result) {
    if (result.isWaitlist) return <ResultScreen iconKey="list" color="slate" title={t("reg.waitlistTitle")} msg={t("reg.waitlistMsg")} t={t} navigate={navigate} />
    if (result.requiresPayment) return <PaymentScreen course={course} regId={result.regId} t={t} navigate={navigate} />
    // ฟรี + แนบผลงาน → รอแอดมินอนุมัติ
    if (result.hasPortfolio || result.status === "submitted")
      return <ResultScreen iconKey="clock" color="orange" title="ส่งใบสมัครแล้ว รอการอนุมัติ" msg="ใบสมัครของคุณถูกส่งให้แอดมินพิจารณาผลงานแล้ว เมื่อได้รับอนุมัติจะกันที่นั่งให้ — ติดตามสถานะได้ที่ 'ใบสมัครของฉัน'" t={t} navigate={navigate} />
    // ฟรี + ไม่แนบผลงาน → ยืนยัน/กันที่นั่งเลย
    return <ResultScreen iconKey="check" color="emerald" title={t("reg.successFreeTitle")} msg={t("reg.successFreeMsg")} t={t} navigate={navigate} />
  }

  // ── โหมดสมัครผ่านลิงก์นอก ──
  const isExternalCourse = !!(course.external_url && course.external_url.trim())
  if (isExternalCourse) {
    if (extDone) {
      return <ResultScreen iconKey="clock" color="orange" title="บันทึกการสมัครแล้ว รอพิจารณา"
        msg="ระบบบันทึกว่าคุณสมัครคอร์สนี้แล้ว สถานะ 'รอพิจารณา' — เมื่อเจ้าหน้าที่ตรวจสอบรายชื่อจากระบบที่คุณสมัครแล้ว จะเปลี่ยนเป็น 'ยืนยันแล้ว' · ติดตามได้ที่ 'ใบสมัครของฉัน'"
        t={t} navigate={navigate} />
    }
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5">
          <Link to="/" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-[#F15A24] hover:bg-orange-50 transition shadow-sm" aria-label="ย้อนกลับ">
            <Ico.arrowLeft className="w-5 h-5" />
          </Link>
        </div>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60">
            <div className="flex items-center gap-2 mb-2">
              {course.course_types?.label && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-violet-100 text-violet-700">{course.course_types.label}</span>
              )}
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-violet-100 text-violet-700">สมัครผ่านลิงก์</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">{course.title}</h1>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 mb-4">วิธีสมัครคอร์สนี้</h3>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">1</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">เปิดลิงก์แล้วกรอกใบสมัคร</p>
                  <p className="text-xs text-slate-400 mt-0.5">คอร์สนี้รับสมัครผ่านระบบภายนอก — กดปุ่มด้านล่างเพื่อเปิด (แท็บใหม่)</p>
                  <button type="button" onClick={() => {
                    let url = (course.external_url || "").trim()
                    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url
                    window.open(url, "_blank", "noopener,noreferrer")
                    setExtOpened(true)
                  }}
                    className="inline-flex items-center gap-2 mt-2.5 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm shadow-violet-500/20">
                    <Ico.upload className="w-4 h-4" /> เปิดลิงก์สมัคร
                  </button>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">2</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">กลับมากดยืนยันที่นี่</p>
                  <p className="text-xs text-slate-400 mt-0.5">เมื่อกรอกใบสมัครในลิงก์เสร็จแล้ว กลับมากด "ฉันสมัครเรียบร้อยแล้ว" เพื่อบันทึกในระบบ (สถานะรอพิจารณา)</p>
                </div>
              </li>
            </ol>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3.5 text-sm">
              <Ico.warn className="w-4 h-4 shrink-0 mt-0.5" /><span className="font-medium">{error}</span>
            </div>
          )}

          {!extOpened && (
            <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
              <Ico.info className="w-4 h-4 shrink-0" /> กรุณาเปิดลิงก์และกรอกใบสมัครก่อน แล้วจึงกดยืนยัน
            </div>
          )}

          <button onClick={handleExternalConfirm} disabled={extSubmitting || !extOpened}
            className="w-full bg-[#F15A24] hover:bg-[#c44215] disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm flex items-center justify-center gap-2">
            {extSubmitting ? "กำลังบันทึก…" : <><Ico.check className="w-4 h-4" /> ฉันสมัครเรียบร้อยแล้ว</>}
          </button>
        </div>
      </div>
    )
  }

  const isCompetition = course.course_types?.requires_approval
  const isPaid = (course.price || 0) > 0
  const fullName = `${profile?.title || ""} ${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5">
        <Link to="/" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-[#F15A24] hover:bg-orange-50 transition shadow-sm" aria-label="ย้อนกลับ">
          <Ico.arrowLeft className="w-5 h-5" />
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* หัวข้อคอร์ส */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60">
          <div className="flex items-center gap-2 mb-2">
            {course.course_types?.label && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${catColor(course.course_types).bg} ${catColor(course.course_types).text}`}>{course.course_types.label}</span>
            )}
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-[#F15A24]"}`}>
              {isPaid ? `฿${course.price?.toLocaleString()}` : t("common.free")}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{course.title}</h1>
          <h2 className="text-lg font-bold text-slate-700 mt-4">{t("reg.title")}</h2>
        </div>

        {/* เลือกรอบ (ถ้าคอร์สมีรอบ) */}
        {Array.isArray(course.sessions) && course.sessions.length > 0 && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.clock className="w-4 h-4" /></span>
              เลือกรอบที่ต้องการ <span className="text-rose-500">*</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {course.sessions.map((s) => {
                const taken = s.taken || 0
                const cap = s.capacity || 0
                const left = Math.max(0, cap - taken)
                const full = left <= 0
                const active = selectedSession === s.id
                return (
                  <button key={s.id} type="button" disabled={full}
                    onClick={() => setSelectedSession(s.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition ${
                      full ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                      : active ? "border-[#F15A24] bg-orange-50 shadow-sm"
                      : "border-slate-200 hover:border-orange-300 hover:bg-orange-50/40"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold text-sm ${active ? "text-[#F15A24]" : "text-slate-800"}`}>{s.label || "รอบ"}</span>
                      {full ? (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">เต็ม</span>
                      ) : active ? (
                        <span className="w-5 h-5 rounded-full bg-[#F15A24] text-white flex items-center justify-center"><Ico.check className="w-3 h-3" /></span>
                      ) : null}
                    </div>
                    {s.time && <div className="text-xs text-slate-500 mb-1.5">🕐 {s.time}</div>}
                    <div className={`text-xs font-medium ${full ? "text-rose-500" : "text-emerald-600"}`}>
                      {full ? "เต็มแล้ว" : `เหลือ ${left}/${cap} ที่`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ผู้สมัคร (จาก profile) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.user className="w-4 h-4" /></span>
              {t("reg.applicant")}
            </h3>
            <Link to="/profile" className="text-xs text-[#F15A24] font-bold underline">{t("reg.editProfile")}</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="ชื่อ-นามสกุล" value={fullName || "-"} />
            <InfoRow label="โรงเรียน" value={profile?.school || "-"} />
            <InfoRow label="ระดับชั้น" value={profile?.grade_level || "-"} />
            <InfoRow label="เบอร์โทร" value={profile?.phone || "-"} />
          </div>
        </div>

        {/* สมาชิกในทีม (ถ้า team) */}
        {course.count_mode === "team" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.users className="w-4 h-4" /></span>
                {t("reg.teamMembers")}
              </h3>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {teamCount} / {minTeam === maxTeam ? maxTeam : `${minTeam}-${maxTeam}`} คน
              </span>
            </div>

            {/* คนที่ 1 = เจ้าของ profile (อ่านอย่างเดียว) */}
            <div className="flex items-center gap-2 mb-4 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
              <span className="w-6 h-6 bg-[#F15A24] text-white rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0">1</span>
              <div className="text-sm">
                <span className="font-bold text-slate-800">{profile?.first_name} {profile?.last_name}</span>
                <span className="text-slate-400 text-xs ml-2">(คุณ — หัวหน้าธีม)</span>
              </div>
            </div>

            {/* สมาชิกเพิ่มเติม */}
            <div className="space-y-4">
              {extraMembers.map((m, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center text-[11px] font-bold">{i + 2}</span>
                    <span className="text-xs font-bold text-slate-500">สมาชิกคนที่ {i + 2}</span>
                    {teamCount > minTeam && (
                      <button type="button" onClick={() => removeMember(i)} className="ml-auto inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-bold"><Ico.x className="w-3 h-3" /> ลบ</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className={inputCls} placeholder="ชื่อ-สกุล *" value={m.full_name} onChange={(e) => updateMember(i, "full_name", e.target.value)} />
                    <input className={inputCls} placeholder="เลขบัตรประชาชน 13 หลัก" value={m.national_id || ""} onChange={(e) => updateMember(i, "national_id", e.target.value.replace(/[^0-9]/g, "").slice(0, 13))} />
                    <input className={inputCls} type="email" placeholder="Gmail ของน้องคนนี้" value={m.email || ""} onChange={(e) => updateMember(i, "email", e.target.value)} />
                    <div className="relative">
                      <input className={inputCls} placeholder="โรงเรียน (พิมพ์เพื่อค้นหา)" value={m.school}
                        onChange={(e) => onMemberSchoolInput(i, e.target.value)}
                        onBlur={() => setTimeout(() => setSchoolDD((p) => p.idx === i ? { idx: -1, options: [] } : p), 200)} />
                      {schoolDD.idx === i && schoolDD.options.length > 0 && (
                        <ul className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
                          {schoolDD.options.map((s, si) => (
                            <li key={si} onClick={() => pickMemberSchool(i, s)} className="px-4 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 text-slate-700">{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <input className={inputCls} placeholder="เบอร์โทร" value={m.phone} onChange={(e) => updateMember(i, "phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">💡 ใส่ Gmail ของน้องเพื่อให้น้อง login เข้ามาดูงานนี้และ QR เช็คอินของตัวเองได้</p>
                </div>
              ))}
            </div>

            {/* ปุ่มเพิ่มสมาชิก */}
            {teamCount < maxTeam && (
              <button type="button" onClick={addMember}
                className="w-full mt-4 py-3 border-2 border-dashed border-[#F15A24]/30 text-[#F15A24] rounded-xl font-bold text-sm hover:bg-orange-50 transition flex items-center justify-center gap-2">
                <Ico.plus className="w-4 h-4" /> เพิ่มสมาชิก (สูงสุด {maxTeam} คน)
              </button>
            )}
          </div>
        )}

        {/* ครูที่ปรึกษา (competition) */}
        {isCompetition && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 pb-3 border-b border-slate-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.cap className="w-4 h-4" /></span>
              {t("reg.advisor")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={inputCls} placeholder={t("reg.advisorName") + " *"} value={advisor.full_name} onChange={(e) => setAdvisor({ ...advisor, full_name: e.target.value })} />
              <input className={inputCls} placeholder={t("reg.advisorPhone")} value={advisor.phone} onChange={(e) => setAdvisor({ ...advisor, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} />
              <input className={inputCls} type="email" placeholder="อีเมลที่ปรึกษา" value={advisor.email} onChange={(e) => setAdvisor({ ...advisor, email: e.target.value })} />
            </div>
          </div>
        )}

        {/* ชื่อทีม/ธีม (คอร์สแบบทีม — บังคับกรอกแม้สมัครคนเดียว) */}
        {course.count_mode === "team" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 pb-3 border-b border-slate-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.tag className="w-4 h-4" /></span>
              ชื่อธีม / ชื่อผลงาน <span className="text-rose-500">*</span>
            </h3>
            <input className={inputCls} placeholder="เช่น Team Rocket / ชื่อผลงาน *" value={themeName} onChange={(e) => setThemeName(e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1"><Ico.warn className="w-3 h-3 shrink-0" /> จำเป็นต้องกรอก — ใส่ชื่อทีมหรือชื่อธีมผลงานของคุณ</p>
          </div>
        )}

        {/* แนบลิงก์ผลงาน (ถ้าวิชากำหนด) */}
        {course.require_portfolio && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-base font-bold text-slate-800 pb-3 border-b border-slate-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center"><Ico.clip className="w-4 h-4" /></span>
              {course.portfolio_label || "แนบลิงก์ผลงาน"}
            </h3>
            <textarea rows="3" className={inputCls + " resize-none"}
              placeholder="วางลิงก์ผลงานที่นี่ บรรทัดละ 1 ลิงก์ เช่น&#10;https://drive.google.com/...&#10;https://youtube.com/..."
              value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Ico.warn className="w-3 h-3 shrink-0" /> ใส่ได้หลายลิงก์ · ตรวจสอบให้แน่ใจว่าเปิดสิทธิ์ให้เข้าดูได้</p>
          </div>
        )}

        {!isPaid && (
          <div className="bg-orange-50 border border-orange-100 text-[#F15A24] rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
            <Ico.info className="w-4 h-4 shrink-0" /> {t("reg.free")}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3.5 text-sm">
            <Ico.warn className="w-4 h-4 shrink-0 mt-0.5" /><span className="font-medium">{error}</span>
          </div>
        )}

        <button onClick={handleConfirm} disabled={submitting}
          className="w-full bg-[#F15A24] hover:bg-[#c44215] disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm">
          {submitting ? t("reg.holding") : t("reg.confirm")}
        </button>
      </div>

      {/* แบบสอบถามครั้งเดียวก่อนสมัคร (gate) */}
      {showSurvey && (
        <SurveyModal mode="gate"
          onDone={() => {
            setShowSurvey(false)
            setProfile((p) => ({ ...p, survey_done: true }))
            handleConfirm()  // สมัครต่อทันทีหลังตอบ
          }}
          onClose={() => setShowSurvey(false)} />
      )}
    </div>
  )
}

// ── หน้าจ่ายเงิน (workshop) — timer + อัปสลิป ตาม doc 24 ──
export function PaymentScreen({ course, regId, t, navigate, deadline, isRejected = false }) {
  const DEADLINE_MIN = 30
  const [timeLeft, setTimeLeft] = useState("")
  const [expired, setExpired] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState(null)
  const [deadlineMs, setDeadlineMs] = useState(deadline ? new Date(deadline).getTime() : null)

  // ถ้าไม่มี deadline ส่งมา → ดึงจาก DB (รีเฟรชไม่รีเซ็ต)
  // กรณีถูกตีกลับ (isRejected) → ไม่จับเวลาเลย ตาม reference
  useEffect(() => {
    if (isRejected) return
    let cancelled = false
    if (!deadlineMs) {
      fetchRegistrationDeadline(regId).then((d) => {
        if (cancelled) return
        if (d) setDeadlineMs(new Date(d).getTime())
        else setDeadlineMs(Date.now() + DEADLINE_MIN * 60 * 1000) // fallback
      })
    }
    return () => { cancelled = true }
  }, [regId, deadlineMs, isRejected])

  useEffect(() => {
    if (isRejected || !deadlineMs) return
    const tick = () => {
      const diff = deadlineMs - Date.now()
      if (diff <= 0) { setExpired(true); setTimeLeft("00:00"); return false }
      const m = Math.floor(diff / 1000 / 60), s = Math.floor((diff / 1000) % 60)
      setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`)
      return true
    }
    tick()
    const iv = setInterval(() => { if (!tick()) clearInterval(iv) }, 1000)
    return () => clearInterval(iv)
  }, [deadlineMs, isRejected])

  const account = course.bank_account || "-"

  function onFile(e) {
    const f = e.target.files[0]; if (!f) return
    if (f.size > 5 * 1024 * 1024) { setErr("ไฟล์ใหญ่เกิน 5MB"); return }
    setFile(f); setErr(null)
    const r = new FileReader(); r.onload = (ev) => setPreview(ev.target.result); r.readAsDataURL(f)
  }
  async function submit() {
    if (!file) { setErr(t("pay.tapSelect")); return }
    setUploading(true); setErr(null)
    try {
      // กัน hang นานเกินไป — timeout 45 วิ
      const withTimeout = (p, ms) => Promise.race([
        p, new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms)),
      ])
      const url = await withTimeout(uploadSlip(file, regId), 45000)
      await withTimeout(attachSlip(regId, url, course.price || 0), 20000)
      setDone(true)
    } catch (e) {
      if (e.message === "TIMEOUT") {
        setErr("⏳ การส่งใช้เวลานานผิดปกติ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง")
      } else if (e.message?.includes("INVALID_STATE")) {
        setExpired(true)
        setErr("⚠️ ใบสมัครนี้ไม่อยู่ในสถานะที่ชำระเงินได้ (อาจเป็นคิวสำรอง หรือหมดเวลาแล้ว) — กรุณาตรวจสอบที่ 'ใบสมัครของฉัน' หรือสมัครใหม่")
      } else if (e.message?.includes("expired")) {
        setExpired(true)
        setErr("⏰ ใบสมัครนี้หมดเวลาชำระเงินแล้ว ที่นั่งถูกปล่อยให้คิวถัดไป กรุณาสมัครใหม่อีกครั้ง")
      } else {
        setErr("เกิดข้อผิดพลาด: " + e.message)
      }
    }
    finally { setUploading(false) }
  }

  if (done) return <ResultScreen iconKey="check" color="emerald" title={t("pay.successTitle")} msg={t("pay.successWait")} t={t} navigate={navigate} />

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden flex flex-col lg:flex-row">
          {/* Left: info */}
          <div className="lg:w-5/12 bg-gradient-to-br from-[#F15A24] via-[#e8501f] to-amber-500 text-white p-5 sm:p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full" />
            <div className="relative">
              <p className="text-orange-200 text-xs font-bold uppercase tracking-widest mb-1">{isRejected ? "ส่งหลักฐานใหม่" : t("pay.title")}</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-6 flex items-center gap-2">
                {isRejected ? <><Ico.upload className="w-7 h-7" /> อัปโหลดสลิปใหม่</> : <><Ico.card className="w-7 h-7" /> {t("pay.title")}</>}
              </h2>
              {isRejected ? (
                <div className="rounded-2xl p-4 mb-6 border-2 bg-black/20 border-white/20 text-center">
                  <p className="text-xs text-orange-200 mb-1 font-medium">สถานะ</p>
                  <p className="text-lg font-bold text-yellow-300">สลิปถูกตีกลับ — ส่งใหม่ได้เลย</p>
                  <p className="text-[11px] text-orange-200 mt-1">ไม่มีการจับเวลา</p>
                </div>
              ) : (
                <div className={`rounded-2xl p-4 mb-6 border-2 text-center ${expired ? "bg-rose-500/20 border-rose-400/50" : "bg-black/20 border-white/20"}`}>
                  <p className="text-xs text-orange-200 mb-1 font-medium flex items-center justify-center gap-1">{expired ? t("pay.expired") : <><Ico.clock className="w-3.5 h-3.5" /> {t("pay.deadline")}</>}</p>
                  <p className={`text-4xl font-mono font-extrabold tracking-widest ${expired ? "text-rose-300" : "text-yellow-300"}`}>{timeLeft || "..."}</p>
                </div>
              )}
              <div className="bg-white/10 rounded-xl p-3.5">
                <p className="text-orange-200 text-xs mb-0.5">{t("pay.amount")}</p>
                <p className="text-2xl font-extrabold">{course.price?.toLocaleString()} <span className="text-lg font-normal text-orange-200">{t("pay.baht")}</span></p>
              </div>
            </div>
            <div className="relative mt-6 bg-rose-500/25 border border-rose-400/40 rounded-xl p-3 text-xs flex items-start gap-2"><Ico.warn className="w-4 h-4 shrink-0 mt-0.5" /> {t("pay.warn")}</div>
          </div>

          {/* Right: bank + upload */}
          <div className="lg:w-7/12 p-5 sm:p-8 flex flex-col">
            <h3 className="text-base font-extrabold text-slate-800 mb-3">{t("pay.bankInfo")}</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-3">
              {course.bank_name && (
                <div>
                  <p className="text-slate-500 text-xs">ธนาคาร</p>
                  <p className="font-bold text-slate-800">{course.bank_name}</p>
                </div>
              )}
              <div>
                <p className="text-slate-500 text-xs">{t("pay.accountNo")}</p>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-2xl font-extrabold text-slate-800 tracking-wider">{account}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(account); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="inline-flex items-center gap-1 bg-white border border-slate-200 text-[#F15A24] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-50 transition shadow-sm">
                    {copied ? t("pay.copied") : <><Ico.copy className="w-3.5 h-3.5" /> {t("pay.copy")}</>}
                  </button>
                </div>
              </div>
              {course.bank_holder && (
                <div>
                  <p className="text-slate-500 text-xs">ชื่อบัญชี</p>
                  <p className="font-bold text-slate-800">{course.bank_holder}</p>
                </div>
              )}
            </div>

            <h3 className="text-base font-extrabold text-slate-800 mb-3">{t("pay.uploadSlip")}</h3>
            <label className={`block cursor-pointer border-2 border-dashed rounded-2xl transition-all ${expired ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50" : preview ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-[#F15A24] hover:bg-orange-50"}`}>
              <input type="file" accept="image/*" onChange={onFile} disabled={expired} className="hidden" />
              {preview ? (
                <div className="p-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                  <img src={preview} alt="slip" className="w-20 h-20 object-cover rounded-xl border border-emerald-200 shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-700 text-sm flex items-center gap-1"><Ico.check className="w-4 h-4" /> {t("pay.selected")}</p>
                    <p className="text-[#F15A24] text-xs mt-1 font-medium">{t("pay.tapChange")}</p>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2"><Ico.receipt className="w-6 h-6" /></div>
                  <p className="font-bold text-slate-600 text-sm">{t("pay.tapSelect")}</p>
                  <p className="text-slate-400 text-xs mt-1">{t("pay.fileTypes")}</p>
                </div>
              )}
            </label>

            {err && <p className="text-rose-500 text-sm mt-3">{err}</p>}

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button onClick={() => navigate("/")} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition">{t("pay.backHome")}</button>
              {expired ? (
                <button onClick={() => navigate(`/register/${course.id}`)} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-rose-500 hover:bg-rose-600 transition shadow-md flex items-center justify-center gap-2"><Ico.rotate className="w-4 h-4" /> สมัครใหม่</button>
              ) : (
                <button onClick={submit} disabled={!file || uploading}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all ${!file || uploading ? "bg-slate-300 cursor-not-allowed" : "bg-[#ec9213] hover:bg-[#d6810b] active:scale-[0.98]"}`}>
                  {uploading ? t("pay.sending") : t("pay.submit")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultScreen({ iconKey, color, title, msg, t, navigate }) {
  const bg = color === "emerald" ? "bg-emerald-100 text-emerald-600" : color === "orange" ? "bg-orange-100 text-[#F15A24]" : "bg-slate-100 text-slate-500"
  const Icon = iconKey === "check" ? Ico.check : iconKey === "clock" ? Ico.clock : Ico.list
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
        <div className={`mx-auto w-20 h-20 ${bg} rounded-full flex items-center justify-center mb-5`}>
          <Icon className="w-9 h-9" />
        </div>
        <h3 className="text-2xl font-extrabold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm mb-6">{msg}</p>
        <button onClick={() => navigate("/")} className="w-full bg-[#F15A24] hover:bg-[#c44215] text-white py-3.5 rounded-xl font-bold shadow-md shadow-orange-500/20 transition text-sm">
          {t("pay.backHome")}
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  )
}

const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100 outline-none transition-all placeholder-slate-300"

function translateError(msg) {
  if (!msg) return "เกิดข้อผิดพลาด"
  if (msg.includes("COURSE_FULL") || msg.includes("full")) return "ที่นั่งเต็มแล้ว"
  if (msg.includes("CLOSED") || msg.includes("not open")) return "คอร์สนี้ปิดรับสมัครแล้ว"
  return "เกิดข้อผิดพลาด: " + msg
}