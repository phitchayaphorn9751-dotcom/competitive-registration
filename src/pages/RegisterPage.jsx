import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  fetchCourse, fetchMyProfile, getSession,
  holdSeat, finalizeRegistration, setPaymentDeadline, fetchRegistrationDeadline, addParticipant, addAdvisor, uploadSlip, attachSlip, savePortfolioUrl,
  checkDuplicateRegistration, assignParticipantCode, assignCodesForRegistration, saveRegistrationTheme,
  fetchAllSchools, searchSchools,
} from "../lib/supabase.js"
import { useLang } from "../lib/i18n.jsx"

export default function RegisterPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()

  const [course, setCourse] = useState(null)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // สมาชิกเพิ่มเติม (กรณี team) — คนแรกคือเจ้าของ profile
  const [extraMembers, setExtraMembers] = useState([])
  const [advisor, setAdvisor] = useState({ full_name: "", phone: "", email: "" })
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [themeName, setThemeName] = useState("")        // ชื่อธีม (ข้อ 2.4)
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

    setSubmitting(true)
    try {
      // ── ข้อ 5: เช็คสมัครซ้ำ (ถ้า RPC ยังไม่มี ข้ามไป ไม่บล็อกการสมัคร) ──
      const allNationalIds = [ownerNationalId, ...extraMembers.map((m) => m.national_id)].map((x) => (x || "").trim()).filter(Boolean)
      try {
        const dup = await checkDuplicateRegistration(courseId, email.trim(), allNationalIds)
        if (dup?.duplicate) {
          setSubmitting(false)
          if (dup.reason === "EMAIL_ALREADY_REGISTERED") return setError("คุณสมัครคอร์สนี้ไปแล้ว (สมัครซ้ำไม่ได้)")
          if (dup.reason === "MEMBER_ALREADY_REGISTERED") return setError("มีสมาชิกในทีมที่เลขบัตรเคยสมัครคอร์สนี้แล้ว (สมัครซ้ำไม่ได้)")
          return setError("ไม่สามารถสมัครซ้ำได้")
        }
      } catch (_) { /* RPC ยังไม่มี — ข้ามการเช็คซ้ำ */ }

      const fresh = await fetchCourse(courseId)
      const unlimited = fresh.seat_mode === "unlimited" || (fresh.capacity || 0) === 0
      const willWaitlist = !unlimited && (fresh.seats_taken || 0) + 1 > (fresh.capacity || 0)

      // ── ขั้นตอนหลัก (ต้องสำเร็จ) ──
      const regId = await holdSeat(courseId, email.trim(), 1)

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

      const requiresPayment = (course.price || 0) > 0

      // ── RPC เสริม (fail ได้ ไม่กระทบการสมัคร) ──
      try { if (ownerPid) await assignParticipantCode(ownerPid) } catch (_) {}
      try { await assignCodesForRegistration(regId) } catch (_) {}
      try { if (requiresPayment && !willWaitlist) await setPaymentDeadline(regId) } catch (_) {}

      setResult({ regId, requiresPayment, isWaitlist: willWaitlist, status: finalStatus, hasPortfolio: !!hasPortfolio })
    } catch (e) {
      setError(translateError(e.message))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error && !course) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-600 font-bold">{error}</p>
        <Link to="/" className="text-[#F15A24] font-bold">{t("reg.backToCourses")}</Link>
      </div>
    )
  }

  // ── หน้าผลลัพธ์หลังกันที่นั่ง ──
  if (result) {
    if (result.isWaitlist) return <ResultScreen icon="📋" color="gray" title={t("reg.waitlistTitle")} msg={t("reg.waitlistMsg")} t={t} navigate={navigate} />
    if (result.requiresPayment) return <PaymentScreen course={course} regId={result.regId} t={t} navigate={navigate} />
    // ฟรี + แนบผลงาน → รอแอดมินอนุมัติ
    if (result.hasPortfolio || result.status === "submitted")
      return <ResultScreen icon="⏳" color="orange" title="ส่งใบสมัครแล้ว รอการอนุมัติ" msg="ใบสมัครของคุณถูกส่งให้แอดมินพิจารณาผลงานแล้ว เมื่อได้รับอนุมัติจะกันที่นั่งให้ — ติดตามสถานะได้ที่ 'ใบสมัครของฉัน'" t={t} navigate={navigate} />
    // ฟรี + ไม่แนบผลงาน → ยืนยัน/กันที่นั่งเลย
    return <ResultScreen icon="✅" color="green" title={t("reg.successFreeTitle")} msg={t("reg.successFreeMsg")} t={t} navigate={navigate} />
  }

  const isCompetition = course.course_types?.requires_approval
  const isPaid = (course.price || 0) > 0
  const fullName = `${profile?.title || ""} ${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#F15A24] hover:underline">
          ← {t("reg.backToCourses")}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* หัวข้อคอร์ส */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60">
          <div className="flex items-center gap-2 mb-2">
            {course.course_types?.label && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200">{course.course_types.label}</span>
            )}
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isPaid ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
              {isPaid ? `฿${course.price?.toLocaleString()}` : t("common.free")}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">{course.title}</h1>
          <h2 className="text-lg font-bold text-gray-700 mt-4">{t("reg.title")}</h2>
        </div>

        {/* ผู้สมัคร (จาก profile) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs">👤</span>
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
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs">👥</span>
                {t("reg.teamMembers")}
              </h3>
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                {teamCount} / {minTeam === maxTeam ? maxTeam : `${minTeam}-${maxTeam}`} คน
              </span>
            </div>

            {/* คนที่ 1 = เจ้าของ profile (อ่านอย่างเดียว) */}
            <div className="flex items-center gap-2 mb-4 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
              <span className="w-6 h-6 bg-[#F15A24] text-white rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0">1</span>
              <div className="text-sm">
                <span className="font-bold text-gray-800">{profile?.first_name} {profile?.last_name}</span>
                <span className="text-gray-400 text-xs ml-2">(คุณ — หัวหน้าทีม)</span>
              </div>
            </div>

            {/* สมาชิกเพิ่มเติม */}
            <div className="space-y-4">
              {extraMembers.map((m, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 bg-gray-200 text-gray-600 rounded-lg flex items-center justify-center text-[11px] font-bold">{i + 2}</span>
                    <span className="text-xs font-bold text-gray-500">สมาชิกคนที่ {i + 2}</span>
                    {teamCount > minTeam && (
                      <button type="button" onClick={() => removeMember(i)} className="ml-auto text-xs text-red-500 hover:text-red-600 font-bold">✕ ลบ</button>
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
                        <ul className="absolute z-30 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
                          {schoolDD.options.map((s, si) => (
                            <li key={si} onClick={() => pickMemberSchool(i, s)} className="px-4 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b last:border-b-0 text-gray-700">{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <input className={inputCls} placeholder="เบอร์โทร" value={m.phone} onChange={(e) => updateMember(i, "phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">💡 ใส่ Gmail ของน้องเพื่อให้น้อง login เข้ามาดูงานนี้และ QR เช็คอินของตัวเองได้</p>
                </div>
              ))}
            </div>

            {/* ปุ่มเพิ่มสมาชิก */}
            {teamCount < maxTeam && (
              <button type="button" onClick={addMember}
                className="w-full mt-4 py-3 border-2 border-dashed border-[#F15A24]/30 text-[#F15A24] rounded-xl font-bold text-sm hover:bg-orange-50 transition flex items-center justify-center gap-2">
                ＋ เพิ่มสมาชิก (สูงสุด {maxTeam} คน)
              </button>
            )}
          </div>
        )}

        {/* ครูที่ปรึกษา (competition) */}
        {isCompetition && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h3 className="text-base font-bold text-gray-800 pb-3 border-b border-gray-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs">🧑‍🏫</span>
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
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h3 className="text-base font-bold text-gray-800 pb-3 border-b border-gray-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs">🏷️</span>
              ชื่อทีม / ชื่อธีมผลงาน <span className="text-red-500">*</span>
            </h3>
            <input className={inputCls} placeholder="เช่น Team Rocket / ชื่อผลงาน *" value={themeName} onChange={(e) => setThemeName(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1.5">⚠️ จำเป็นต้องกรอก — ใส่ชื่อทีมหรือชื่อธีมผลงานของคุณ</p>
          </div>
        )}

        {/* แนบลิงก์ผลงาน (ถ้าวิชากำหนด) */}
        {course.require_portfolio && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h3 className="text-base font-bold text-gray-800 pb-3 border-b border-gray-100 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-[#F15A24] text-white rounded-xl flex items-center justify-center text-xs">📎</span>
              {course.portfolio_label || "แนบลิงก์ผลงาน"}
            </h3>
            <textarea rows="3" className={inputCls + " resize-none"}
              placeholder="วางลิงก์ผลงานที่นี่ * (ใส่ได้หลายลิงก์ — บรรทัดละ 1 ลิงก์)&#10;เช่น&#10;https://drive.google.com/...&#10;https://youtube.com/..."
              value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
            <p className="text-xs text-gray-400 mt-2">⚠️ ใส่ได้หลายลิงก์ (ขึ้นบรรทัดใหม่) · ตรวจสอบให้แน่ใจว่าเปิดสิทธิ์ให้เข้าดูได้</p>
          </div>
        )}

        {!isPaid && (
          <div className="bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-4 py-3 text-sm">
            ℹ️ {t("reg.free")}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 rounded-2xl px-4 py-3.5 text-sm">
            <span className="shrink-0 mt-0.5">⚠️</span><span className="font-medium">{error}</span>
          </div>
        )}

        <button onClick={handleConfirm} disabled={submitting}
          className="w-full bg-[#F15A24] hover:bg-[#c44215] disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 text-sm">
          {submitting ? t("reg.holding") : t("reg.confirm")}
        </button>
      </div>
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
      } else if (e.message?.includes("INVALID_STATE") || e.message?.includes("expired")) {
        setExpired(true)
        setErr("⏰ ใบสมัครนี้หมดเวลาชำระเงินแล้ว ที่นั่งถูกปล่อยให้คิวถัดไป กรุณาสมัครใหม่อีกครั้ง")
      } else {
        setErr("เกิดข้อผิดพลาด: " + e.message)
      }
    }
    finally { setUploading(false) }
  }

  if (done) return <ResultScreen icon="✅" color="green" title={t("pay.successTitle")} msg={t("pay.successWait")} t={t} navigate={navigate} />

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden flex flex-col lg:flex-row">
          {/* Left: info */}
          <div className="lg:w-5/12 bg-gradient-to-br from-[#F15A24] via-[#e8501f] to-[#c9420f] text-white p-5 sm:p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full" />
            <div className="relative">
              <p className="text-orange-200 text-xs font-bold uppercase tracking-widest mb-1">{isRejected ? "ส่งหลักฐานใหม่" : t("pay.title")}</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-6">{isRejected ? "📤 อัปโหลดสลิปใหม่" : "💳 " + t("pay.title")}</h2>
              {isRejected ? (
                <div className="rounded-2xl p-4 mb-6 border-2 bg-black/20 border-white/20 text-center">
                  <p className="text-xs text-orange-200 mb-1 font-medium">สถานะ</p>
                  <p className="text-lg font-bold text-yellow-300">สลิปถูกตีกลับ — ส่งใหม่ได้เลย</p>
                  <p className="text-[11px] text-orange-200 mt-1">ไม่มีการจับเวลา</p>
                </div>
              ) : (
                <div className={`rounded-2xl p-4 mb-6 border-2 text-center ${expired ? "bg-red-500/20 border-red-400/50" : "bg-black/20 border-white/20"}`}>
                  <p className="text-xs text-orange-200 mb-1 font-medium">{expired ? t("pay.expired") : "⏱ " + t("pay.deadline")}</p>
                  <p className={`text-4xl font-mono font-extrabold tracking-widest ${expired ? "text-red-300" : "text-yellow-300"}`}>{timeLeft || "..."}</p>
                </div>
              )}
              <div className="bg-white/10 rounded-xl p-3.5">
                <p className="text-orange-200 text-xs mb-0.5">{t("pay.amount")}</p>
                <p className="text-2xl font-extrabold">{course.price?.toLocaleString()} <span className="text-lg font-normal text-orange-200">{t("pay.baht")}</span></p>
              </div>
            </div>
            <div className="relative mt-6 bg-red-500/25 border border-red-400/40 rounded-xl p-3 text-xs">⚠️ {t("pay.warn")}</div>
          </div>

          {/* Right: bank + upload */}
          <div className="lg:w-7/12 p-5 sm:p-8 flex flex-col">
            <h3 className="text-base font-extrabold text-gray-800 mb-3">{t("pay.bankInfo")}</h3>
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 mb-6 space-y-3">
              {course.bank_name && (
                <div>
                  <p className="text-gray-500 text-xs">ธนาคาร</p>
                  <p className="font-bold text-gray-800">{course.bank_name}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500 text-xs">{t("pay.accountNo")}</p>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-2xl font-extrabold text-gray-800 tracking-wider">{account}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(account); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="bg-white border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-50 transition shadow-sm">
                    {copied ? t("pay.copied") : "📋 " + t("pay.copy")}
                  </button>
                </div>
              </div>
              {course.bank_holder && (
                <div>
                  <p className="text-gray-500 text-xs">ชื่อบัญชี</p>
                  <p className="font-bold text-gray-800">{course.bank_holder}</p>
                </div>
              )}
              {course.line_qr_url && (
                <div className="pt-2 border-t border-purple-200">
                  <p className="text-gray-500 text-xs mb-2">หรือสแกน QR เข้ากลุ่มไลน์</p>
                  <img src={course.line_qr_url} alt="Line QR" className="h-28 w-auto rounded-lg border border-purple-200" />
                </div>
              )}
            </div>

            <h3 className="text-base font-extrabold text-gray-800 mb-3">{t("pay.uploadSlip")}</h3>
            <label className={`block cursor-pointer border-2 border-dashed rounded-2xl transition-all ${expired ? "opacity-50 cursor-not-allowed border-gray-200 bg-gray-50" : preview ? "border-green-300 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-[#F15A24] hover:bg-orange-50"}`}>
              <input type="file" accept="image/*" onChange={onFile} disabled={expired} className="hidden" />
              {preview ? (
                <div className="p-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                  <img src={preview} alt="slip" className="w-20 h-20 object-cover rounded-xl border border-green-200 shrink-0" />
                  <div>
                    <p className="font-bold text-green-700 text-sm">✅ {t("pay.selected")}</p>
                    <p className="text-[#F15A24] text-xs mt-1 font-medium">{t("pay.tapChange")}</p>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-3xl mb-2">🧾</p>
                  <p className="font-bold text-gray-600 text-sm">{t("pay.tapSelect")}</p>
                  <p className="text-gray-400 text-xs mt-1">{t("pay.fileTypes")}</p>
                </div>
              )}
            </label>

            {err && <p className="text-red-500 text-sm mt-3">{err}</p>}

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button onClick={() => navigate("/")} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition">{t("pay.backHome")}</button>
              {expired ? (
                <button onClick={() => navigate(`/register/${course.id}`)} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition shadow-md">🔄 สมัครใหม่</button>
              ) : (
                <button onClick={submit} disabled={!file || uploading}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all ${!file || uploading ? "bg-gray-300 cursor-not-allowed" : "bg-[#ec9213] hover:bg-[#d6810b] active:scale-[0.98]"}`}>
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

function ResultScreen({ icon, color, title, msg, t, navigate }) {
  const bg = color === "green" ? "bg-green-100" : color === "orange" ? "bg-orange-100" : "bg-gray-100"
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
        <div className={`mx-auto w-20 h-20 ${bg} rounded-full flex items-center justify-center mb-5`}>
          <span className="text-4xl">{icon}</span>
        </div>
        <h3 className="text-2xl font-extrabold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-500 text-sm mb-6">{msg}</p>
        <button onClick={() => navigate("/")} className="w-full bg-[#F15A24] hover:bg-[#c44215] text-white py-3.5 rounded-xl font-bold shadow-md transition text-sm">
          {t("pay.backHome")}
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
    </div>
  )
}

const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100 outline-none transition-all placeholder-gray-300"

function translateError(msg) {
  if (!msg) return "เกิดข้อผิดพลาด"
  if (msg.includes("COURSE_FULL") || msg.includes("full")) return "ที่นั่งเต็มแล้ว"
  if (msg.includes("CLOSED") || msg.includes("not open")) return "คอร์สนี้ปิดรับสมัครแล้ว"
  return "เกิดข้อผิดพลาด: " + msg
}