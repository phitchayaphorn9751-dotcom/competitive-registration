import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getSession, isAdminUser, fetchMyRegistrations, fetchCourse, fetchRegistrationMembers } from "../lib/supabase.js"
import { useLang } from "../lib/i18n.jsx"

// map สถานะ → สี/ไอคอน (อิงสถานะจริงในระบบเรา: held, confirmed, waitlist, cancelled + payment_status)
const STATUS_CFG = {
  confirmed:       { key: "myreg.st.confirmed",       icon: "✅", bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  dot: "bg-green-500" },
  pending_review:  { key: "myreg.st.pending_review",  icon: "⏳", bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-500" },
  pending_payment: { key: "myreg.st.pending_payment", icon: "⚠️", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
  held:            { key: "myreg.st.held",            icon: "🕓", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-400" },
  waitlist:        { key: "myreg.st.waitlist",        icon: "📋", bg: "bg-gray-100",  text: "text-gray-600",   border: "border-gray-200",   dot: "bg-gray-400" },
  cancelled:       { key: "myreg.st.cancelled",       icon: "🚫", bg: "bg-gray-50",   text: "text-gray-400",   border: "border-gray-100",   dot: "bg-gray-300" },
  rejected:        { key: "myreg.st.rejected",        icon: "❌", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500" },
}

// แปลงสถานะดิบ (รวม payment) → key เดียวสำหรับแสดงผล
function displayStatus(r) {
  if (r.status === "waitlist") return "waitlist"
  if (r.status === "cancelled") return "cancelled"
  if (r.status === "confirmed" || r.status === "approved") return "confirmed"
  if (r.status === "submitted") return "pending_review"  // ฟรี+แนบผลงาน รออนุมัติ
  if (r.status === "rejected" || r.status === "slip_rejected") return "rejected"
  // ต้องจ่ายเงิน = วิชามีราคา (price > 0)
  const needPay = (r.price || 0) > 0
  if (r.status === "held" || r.status === "pending_payment" || r.status === "slip_uploaded") {
    if (needPay) {
      if (r.payment_status === "submitted" || r.payment_status === "pending" || r.status === "slip_uploaded") return "pending_review"
      if (r.payment_status === "rejected") return "rejected"
      return "pending_payment"
    }
    return "confirmed"  // ฟรี ไม่แนบผลงาน = กันที่นั่งเลย
  }
  return r.status
}

export default function MyRegistrationPage() {
  const navigate = useNavigate()
  const { t, lang } = useLang()
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("all")
  const [barcodeReg, setBarcodeReg] = useState(null)
  const [detailReg, setDetailReg] = useState(null)

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) { navigate("/login"); return }
      if (await isAdminUser()) { navigate("/admin/dashboard"); return }
      try { setRegs(await fetchMyRegistrations()) }
      catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })
  }, [navigate])

  // refresh อัตโนมัติทุก 30 วินาที (อัปเดตสถานะการสมัคร เช่น อนุมัติ/ตีกลับ)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchMyRegistrations().then(setRegs).catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])


  const counts = regs.reduce((acc, r) => { const d = displayStatus(r); acc[d] = (acc[d] || 0) + 1; return acc }, {})
  const activeCount = regs.filter((r) => ["confirmed", "pending_payment", "pending_review", "held", "waitlist"].includes(displayStatus(r))).length

  const tabs = [
    { key: "all", label: t("myreg.tabAll"), count: regs.length },
    { key: "active", label: t("myreg.tabActive"), count: activeCount },
    { key: "confirmed", label: t("myreg.tabApproved"), count: counts["confirmed"] || 0 },
    { key: "pending_payment", label: t("myreg.tabPending"), count: counts["pending_payment"] || 0 },
    { key: "waitlist", label: t("myreg.tabWaitlist"), count: counts["waitlist"] || 0 },
  ]

  const filtered = regs.filter((r) => {
    const d = displayStatus(r)
    if (filter === "all") return true
    if (filter === "active") return ["confirmed", "pending_payment", "pending_review", "held", "waitlist"].includes(d)
    return d === filter
  })

  function fmtDate(s) {
    if (!s) return ""
    return new Date(s).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric" })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">{t("myreg.title")}</h1>
              <p className="text-gray-400 text-xs mt-0.5">My Registration</p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  filter === tab.key ? "bg-[#F15A24] text-white border-[#F15A24] shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${filter === tab.key ? "bg-white/30 text-white" : "bg-gray-100 text-gray-500"}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-6">
        {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 mb-6 text-sm">{error}</div>}

        {regs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <p className="text-5xl mb-4">📋</p>
            <p className="text-gray-700 font-bold text-lg">{t("myreg.empty")}</p>
            <p className="text-gray-400 text-sm mt-1">{t("myreg.emptySub")}</p>
            <button onClick={() => navigate("/")} className="mt-5 px-6 py-2.5 bg-[#F15A24] text-white rounded-xl font-bold text-sm hover:bg-[#C44215] transition shadow-md">
              {t("myreg.viewCourses")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold">{t("myreg.noneInTab")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((reg) => {
              const d = displayStatus(reg)
              const cfg = STATUS_CFG[d] || STATUS_CFG.held
              return (
                <div key={reg.id} onClick={() => setDetailReg(reg)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                  <div className={`h-1 w-full ${cfg.dot}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-base sm:text-lg text-gray-800 mb-1 leading-snug flex items-center gap-2 flex-wrap">
                          {reg.course_title}
                          {reg.is_team_member && <span className="text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full">👥 เพื่อนสมัครให้</span>}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
                          {reg.participant_code && <span className="font-mono font-bold text-[#F15A24] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">🪪 {reg.participant_code}</span>}
                          <span>{t("myreg.registeredOn")} {fmtDate(reg.created_at)}</span>
                          {reg.theme_name && <span>· ทีม: <span className="font-bold text-gray-600">{reg.theme_name}</span></span>}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border w-fit ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.icon} {t(cfg.key)}
                            {d === "waitlist" && reg.waitlist_pos ? ` — คิวที่ ${reg.waitlist_pos}` : ""}
                          </span>
                          {d === "waitlist" && <span className="text-[11px] text-gray-400 pl-1">*เมื่อมีที่ว่าง ระบบจะเรียกคิวอัตโนมัติ</span>}
                          {d === "rejected" && reg.reject_reason && <span className="text-[11px] text-red-400 pl-1">เหตุผล: {reg.reject_reason}</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {d === "pending_payment" && (
                          <button onClick={() => navigate(`/pay/${reg.id}`)}
                            className="px-4 py-2 rounded-xl bg-[#ec9213] hover:bg-[#d6810b] text-white font-bold text-sm shadow-sm transition">
                            {t("myreg.payNow")}
                          </button>
                        )}
                        {/* ข้อ 2.2: ถูกตีกลับ → ส่งใหม่ด้วยใบเดิม */}
                        {d === "rejected" && (reg.price || 0) > 0 && (
                          <button onClick={() => navigate(`/pay/${reg.id}`)}
                            className="px-4 py-2 rounded-xl bg-[#F15A24] hover:bg-orange-600 text-white font-bold text-sm shadow-sm transition">
                            ส่งสลิปใหม่
                          </button>
                        )}
                        {d === "confirmed" && (reg.participant_code || reg.my_qr_token || reg.qr_token) && (
                          <button onClick={() => setBarcodeReg(reg)}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition">
                            {t("myreg.showBarcode")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {barcodeReg && <CheckinModal reg={barcodeReg} t={t} onClose={() => setBarcodeReg(null)} />}
      {detailReg && <RegDetailModal reg={detailReg} t={t} navigate={navigate} onClose={() => setDetailReg(null)} />}
    </div>
  )
}

// Modal รายละเอียด 2 ฝั่ง: ซ้าย=ข้อมูลวิชา ขวา=ข้อมูลที่กรอกตอนสมัคร
function RegDetailModal({ reg, t, navigate, onClose }) {
  const d = displayStatus(reg)
  const cfg = STATUS_CFG[d] || STATUS_CFG.held
  const isPaid = (reg.price || 0) > 0
  const isConfirmed = d === "confirmed"
  const code = reg.participant_code || ""
  const barcodeUrl = code ? `https://barcodeapi.org/api/128/${encodeURIComponent(code)}` : null
  const [course, setCourse] = useState(null)
  const [members, setMembers] = useState([])
  const [imgIdx, setImgIdx] = useState(0)
  const [showBarcode, setShowBarcode] = useState(false)
  const [barcodeMember, setBarcodeMember] = useState(null)

  useEffect(() => {
    fetchCourse(reg.course_id).then(setCourse).catch(() => {})
    fetchRegistrationMembers(reg.id).then(setMembers).catch(() => {})
  }, [reg.course_id, reg.id])

  function fmtDate(s) { if (!s) return "-"; const dt = new Date(s); return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) }
  function fmtThaiDate(s) { if (!s) return "-"; try { return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) } catch { return s } }

  const images = course ? [course.image_url, ...(course.image_urls || [])].filter(Boolean) : []

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header ส้ม */}
        <div className="bg-gradient-to-br from-[#F15A24] to-[#d04810] px-6 py-4 text-white flex justify-between items-start shrink-0">
          <div className="pr-4">
            <p className="text-xs text-orange-200 mb-0.5 font-bold tracking-widest uppercase">{reg.course_type || "วิชา"}</p>
            <h3 className="font-extrabold text-xl leading-tight">{reg.course_title}</h3>
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold px-3 py-1 rounded-full bg-white/20 backdrop-blur">
              {cfg.icon} {t(cfg.key)}{d === "waitlist" && reg.waitlist_pos ? ` — คิวที่ ${reg.waitlist_pos}` : ""}
            </span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none shrink-0 w-8 h-8 flex items-center justify-center">×</button>
        </div>

        {/* 2 ฝั่ง */}
        <div className="overflow-y-auto flex-1 flex flex-col md:flex-row">
          {/* ───── ซ้าย: ข้อมูลวิชา (ดีไซน์เหมือนหน้า Home) ───── */}
          <div className="md:w-1/2 md:border-r border-gray-100 bg-[#fffbf8] p-5 space-y-4">
            {/* รูป carousel */}
            {images.length > 0 && (
              <div className="relative h-48 rounded-2xl overflow-hidden bg-gray-200">
                <img src={images[imgIdx]} className="w-full h-full object-cover" alt={reg.course_title} />
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">‹</button>
                    <button onClick={() => setImgIdx((imgIdx + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">›</button>
                    <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
                      {images.map((_, i) => <button key={i} onClick={() => setImgIdx(i)} className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />)}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* 3 การ์ดข้อมูล */}
            <div className="grid grid-cols-3 gap-2">
              {[["📅", "วันเริ่ม", fmtThaiDate(course?.start_date)], ["🏁", "วันสิ้นสุด", fmtThaiDate(course?.end_date)], ["⏱️", "ระยะเวลา", course?.duration || "-"]].map(([ic, lb, vl], i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                  <div className="text-2xl mb-1">{ic}</div>
                  <div className="text-[10px] text-gray-400">{lb}</div>
                  <div className="text-xs font-bold text-gray-800 mt-0.5 leading-tight">{vl}</div>
                </div>
              ))}
            </div>
            {course?.level && (
              <div className="flex justify-center">
                <span className="text-xs font-bold bg-orange-100 text-[#F15A24] px-3 py-1 rounded-full">📊 {course.level}</span>
              </div>
            )}
            {/* คำอธิบาย */}
            {course?.description && (
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                <h4 className="font-bold text-[#F15A24] text-sm mb-2 flex items-center gap-2">📝 คำอธิบายรายวิชา</h4>
                <p className="text-gray-700 text-sm leading-7 whitespace-pre-line">{course.description}</p>
              </div>
            )}
            {/* ค่าเรียนเด่น */}
            <div className="flex flex-col items-center py-4 border-t border-dashed border-orange-200">
              {isPaid ? (
                <>
                  <p className="text-gray-400 text-xs mb-1">ค่าลงทะเบียน</p>
                  <p className="text-3xl font-extrabold text-green-600">{Number(reg.price).toLocaleString()} บาท</p>
                </>
              ) : (
                <p className="text-xl font-extrabold text-green-600">✨ ไม่มีค่าลงทะเบียน</p>
              )}
            </div>
          </div>

          {/* ───── ขวา: ข้อมูลที่กรอกตอนสมัคร ───── */}
          <div className="md:w-1/2 p-5 space-y-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">📝 ข้อมูลการสมัคร</p>

            {/* บาร์โค้ด (เฉพาะยืนยันแล้ว) */}
            {isConfirmed && code && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-3 flex flex-col items-center">
                <div className="w-full bg-[#F15A24] text-white rounded-xl px-3 py-2 mb-2 text-center">
                  <p className="text-[10px] text-orange-100">รหัสนักเรียน (ใช้เช็คอิน)</p>
                  <p className="font-mono text-xl font-extrabold tracking-wider">{code}</p>
                </div>
                {barcodeUrl && <img src={barcodeUrl} alt="barcode" className="h-14 w-auto max-w-full object-contain" />}
              </div>
            )}

            <Row label="รูปแบบการสมัคร" value={reg.count_mode === "team" ? "👥 ทีม" : reg.count_mode === "pair" ? "👯 คู่" : "👤 เดี่ยว"} />
            <Row label="วันที่สมัคร" value={fmtDate(reg.created_at)} />

            {/* ชื่อทีม/ธีม + สมาชิก (แต่ละคนมีบาร์โค้ดของตัวเอง) */}
            {(reg.theme_name || members.length > 1) && (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 my-2">
                {reg.theme_name && (
                  <p className="text-sm mb-2.5"><span className="text-xs font-bold text-purple-500">🎯 ชื่อทีม/ธีม:</span> <span className="font-bold text-gray-700">{reg.theme_name}</span></p>
                )}
                <p className="text-xs font-bold text-purple-500 mb-2">👥 สมาชิกในทีม ({members.length} คน)</p>
                <div className="space-y-2">
                  {members.map((m, i) => (
                    <div key={m.id} className="bg-white rounded-xl border border-purple-100 p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="font-bold text-gray-700 text-sm flex-1 min-w-0 truncate">{m.full_name}</span>
                        {m.participant_code && <span className="font-mono text-[10px] text-[#F15A24] bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded shrink-0">{m.participant_code}</span>}
                      </div>
                      <div className="ml-7 space-y-0.5 mb-1.5">
                        {m.email && <p className="text-[11px] text-gray-500 truncate">✉️ {m.email}</p>}
                        {m.phone && <p className="text-[11px] text-gray-500">📞 {m.phone}</p>}
                      </div>
                      {isConfirmed && m.participant_code && (
                        <div className="ml-7">
                          <button onClick={() => setBarcodeMember(m)}
                            className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                            🪪 ดูบาร์โค้ดของ {m.full_name?.split(" ")[0] || "สมาชิก"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ครูที่ปรึกษา */}
            {reg.advisor_name && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 my-2">
                <p className="text-xs font-bold text-blue-500 mb-1">👨‍🏫 ครูที่ปรึกษา</p>
                <p className="text-sm text-gray-700 font-bold">{reg.advisor_name}</p>
                {reg.advisor_phone && <p className="text-xs text-gray-500">📞 {reg.advisor_phone}</p>}
                {reg.advisor_email && <p className="text-xs text-gray-500">✉️ {reg.advisor_email}</p>}
              </div>
            )}

            {/* ลิงก์ผลงาน */}
            {reg.require_portfolio && (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 my-2">
                <p className="text-xs font-bold text-[#F15A24] mb-1.5">📎 {reg.portfolio_label || "ผลงานที่แนบ"}</p>
                {reg.portfolio_url ? (
                  <div className="space-y-1.5">
                    {reg.portfolio_url.split(/[\n,]+/).map((link, i) => {
                      const url = link.trim(); if (!url) return null
                      const isLink = /^https?:\/\//i.test(url)
                      return isLink
                        ? <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-sm text-[#F15A24] font-bold break-all hover:underline">{i + 1}. {url}</a>
                        : <p key={i} className="text-sm text-gray-700 break-all">{i + 1}. {url}</p>
                    })}
                  </div>
                ) : <p className="text-xs text-gray-400">ยังไม่ได้แนบผลงาน</p>}
              </div>
            )}

            {d === "rejected" && reg.reject_reason && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 my-2">
                <p className="text-xs font-bold text-red-500 mb-1">เหตุผลที่ไม่ผ่าน</p>
                <p className="text-sm text-red-700">{reg.reject_reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-2 shrink-0">
          {d === "pending_payment" && (
            <button onClick={() => navigate(`/pay/${reg.id}`)} className="flex-1 bg-[#ec9213] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#d6810b] transition">ชำระเงิน</button>
          )}
          {d === "rejected" && isPaid && (
            <button onClick={() => navigate(`/pay/${reg.id}`)} className="flex-1 bg-[#F15A24] text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 transition">ส่งสลิปใหม่</button>
          )}
          {isConfirmed && code && (
            <button onClick={() => setShowBarcode(true)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition">🪪 ดูบาร์โค้ด</button>
          )}
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition">ปิด</button>
        </div>
      </div>
      {showBarcode && <CheckinModal reg={reg} t={t} onClose={() => setShowBarcode(false)} />}
      {barcodeMember && <MemberBarcodeModal member={barcodeMember} courseTitle={reg.course_title} onClose={() => setBarcodeMember(null)} />}
    </div>
  )
}
function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 text-xs shrink-0">{label}</span>
      <span className={`text-gray-800 font-bold text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

function MemberBarcodeModal({ member, courseTitle, onClose }) {
  const code = member.participant_code || ""
  const barcodeUrl = code ? `https://barcodeapi.org/api/128/${encodeURIComponent(code)}` : null

  async function saveImage() {
    try {
      // โหลดบาร์โค้ดเป็น blob แล้วบันทึก
      const res = await fetch(barcodeUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `barcode_${code}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // fallback: เปิดในแท็บใหม่ให้กดบันทึกเอง
      window.open(barcodeUrl, "_blank")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:rounded-2xl shadow-2xl sm:max-w-sm overflow-hidden rounded-t-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white text-center">
          <h3 className="font-extrabold text-lg">{member.full_name}</h3>
          <p className="text-blue-200 text-xs mt-0.5 truncate">📚 {courseTitle}</p>
        </div>
        <div className="p-6 bg-gray-50 flex flex-col items-center">
          <div className="w-full bg-[#F15A24] text-white rounded-xl px-4 py-3 mb-4 text-center shadow-sm">
            <p className="text-[11px] text-orange-100 mb-0.5">รหัสนักเรียน (เช็คอิน)</p>
            <p className="font-mono text-3xl font-extrabold tracking-wider">{code}</p>
          </div>
          {barcodeUrl && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-3 w-full flex justify-center">
              <img src={barcodeUrl} alt="barcode" className="h-24 w-auto max-w-full object-contain" />
            </div>
          )}
          <p className="text-[11px] text-gray-400 text-center">สแกนบาร์โค้ด หรือแจ้งรหัสนักเรียนเพื่อเช็คอิน</p>
        </div>
        <div className="p-4 bg-white flex gap-2">
          <button onClick={saveImage} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition">💾 บันทึกภาพ</button>
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition">ปิด</button>
        </div>
      </div>
    </div>
  )
}

function CheckinModal({ reg, t, onClose }) {
  const [qrUrl, setQrUrl] = useState(null)
  const code = reg.participant_code || ""

  useEffect(() => {
    // บาร์โค้ด encode รหัสนักเรียน (participant_code) — สแกนแล้วเช็คอินได้เลย
    if (code) setQrUrl(`https://barcodeapi.org/api/128/${encodeURIComponent(code)}`)
  }, [code])

  async function saveImage() {
    if (!qrUrl) return
    try {
      const res = await fetch(qrUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `barcode_${code}.png`; a.click()
      URL.revokeObjectURL(url)
    } catch { window.open(qrUrl, "_blank") }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:rounded-2xl shadow-2xl sm:max-w-sm overflow-hidden rounded-t-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white text-center">
          <h3 className="font-extrabold text-xl tracking-wide">{t("myreg.checkinTitle")}</h3>
          <p className="text-blue-200 text-xs mt-1">{t("myreg.checkinSub")}</p>
        </div>
        <div className="p-6 bg-gray-50 flex flex-col items-center">
          {/* รหัสนักเรียน — เด่นสุด ใช้เช็คอินได้เลย */}
          {code && (
            <div className="w-full bg-[#F15A24] text-white rounded-xl px-4 py-3 mb-4 text-center shadow-sm">
              <p className="text-[11px] text-orange-100 mb-0.5">รหัสนักเรียน (แจ้งเจ้าหน้าที่เพื่อเช็คอิน)</p>
              <p className="font-mono text-3xl font-extrabold tracking-wider">{code}</p>
            </div>
          )}
          {qrUrl && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-3 w-full flex justify-center">
              <img src={qrUrl} alt="barcode" className="h-24 w-auto max-w-full object-contain" />
            </div>
          )}
          <p className="text-[11px] text-gray-400 text-center mb-2">สแกนบาร์โค้ด หรือแจ้งรหัสนักเรียนให้เจ้าหน้าที่</p>
          <p className="text-sm font-bold text-[#F15A24] text-center pt-3 border-t border-gray-200 w-full">📚 {reg.course_title}</p>
        </div>
        <div className="p-4 bg-white flex gap-2">
          {code && <button onClick={saveImage} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition text-sm">💾 บันทึกภาพ</button>}
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition text-sm">
            {t("myreg.closeWindow")}
          </button>
        </div>
      </div>
    </div>
  )
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement("script")
    s.src = src; s.onload = resolve; s.onerror = reject
    document.body.appendChild(s)
  })
}