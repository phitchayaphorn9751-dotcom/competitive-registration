import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getSession, isAdminUser, fetchMyRegistrations, fetchCourse, fetchRegistrationMembers, subscribeMyRegistrations } from "../lib/supabase.js"
import { useLang } from "../lib/i18n.jsx"

// ───── ไอคอน SVG inline (ไม่ต้องพึ่ง lib ภายนอก) สไตล์ lucide ─────
const Ico = {
  barcode: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14"/></svg>),
  card:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>),
  upload:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>),
  rotate:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>),
  qr:      (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/></svg>),
}

// map สถานะ → สี/dot (ดีไซน์ CAMT: badge rounded-lg + dot สี — แทน emoji เดิม)
const STATUS_CFG = {
  confirmed:       { key: "myreg.st.confirmed",       icon: "✅", bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", dot: "bg-emerald-500" },
  pending_review:  { key: "myreg.st.pending_review",  icon: "⏳", bg: "bg-sky-50",     text: "text-sky-600",     border: "border-sky-100",     dot: "bg-sky-500", pulse: true },
  pending_payment: { key: "myreg.st.pending_payment", icon: "⚠️", bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-100",   dot: "bg-amber-500", pulse: true },
  held:            { key: "myreg.st.held",            icon: "🕓", bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-100",  dot: "bg-orange-500" },
  waitlist:        { key: "myreg.st.waitlist",        icon: "📋", bg: "bg-slate-100",  text: "text-slate-500",   border: "border-slate-200",   dot: "bg-slate-400" },
  cancelled:       { key: "myreg.st.cancelled",       icon: "🚫", bg: "bg-rose-50",    text: "text-rose-500",    border: "border-rose-100",    dot: "bg-rose-400" },
  rejected:        { key: "myreg.st.rejected",        icon: "❌", bg: "bg-rose-50",    text: "text-rose-600",    border: "border-rose-100",    dot: "bg-rose-500" },
  expired:         { key: "myreg.st.expired",         icon: "🕐", bg: "bg-slate-50",   text: "text-slate-400",   border: "border-slate-100",   dot: "bg-slate-300" },
}

// สีหมวดหมู่ — กระจายสีตามชื่อหมวด (หมวดเดียวกันได้สีเดิมเสมอ)
const CATEGORY_PALETTE = [
  { bg: "bg-orange-100",  text: "text-orange-700",  border: "border-orange-200" },
  { bg: "bg-blue-100",   text: "text-blue-700",    border: "border-blue-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-purple-100", text: "text-purple-700",  border: "border-purple-200" },
  { bg: "bg-pink-100",   text: "text-pink-700",    border: "border-pink-200" },
  { bg: "bg-cyan-100",   text: "text-cyan-700",    border: "border-cyan-200" },
  { bg: "bg-amber-100",  text: "text-amber-700",   border: "border-amber-200" },
  { bg: "bg-indigo-100", text: "text-indigo-700",  border: "border-indigo-200" },
  { bg: "bg-teal-100",   text: "text-teal-700",    border: "border-teal-200" },
  { bg: "bg-rose-100",   text: "text-rose-700",    border: "border-rose-200" },
]
function categoryCfg(name) {
  if (!name) return CATEGORY_PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]
}

// แปลงสถานะดิบ (รวม payment) → key เดียวสำหรับแสดงผล
function displayStatus(r) {
  if (r.status === "waitlist") return "waitlist"
  if (r.status === "cancelled") return "cancelled"
  if (r.status === "expired") return "expired"
  if (r.status === "confirmed" || r.status === "approved") return "confirmed"
  if (r.status === "submitted") {
    // ประเภท 2 (ฟรี+แนบงาน): ถ้าอนุมัติครบโควตาแล้ว submitted ที่เหลือ = คิวสำรอง
    if (r.type2_waitlisted) return "waitlist"
    return "pending_review"  // ยังไม่ครบโควตา = รอพิจารณา
  }
  if (r.status === "rejected" || r.status === "slip_rejected") return "rejected"
  // ต้องจ่ายเงิน = วิชามีราคา (price > 0)
  const needPay = (r.price || 0) > 0
  if (r.status === "held" || r.status === "pending_payment" || r.status === "slip_uploaded") {
    if (needPay) {
      // เลย deadline แล้ว → หมดเวลา
      if (r.payment_deadline && new Date(r.payment_deadline).getTime() < Date.now()
          && r.payment_status !== "submitted" && r.payment_status !== "pending" && r.status !== "slip_uploaded") {
        return "expired"
      }
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

  // อัปเดตสถานะแบบ realtime (อนุมัติ/ตีกลับ user เห็นทันที ไม่ต้องรีเฟรช)
  useEffect(() => {
    const ch = subscribeMyRegistrations(() => {
      fetchMyRegistrations().then(setRegs).catch(() => {})
    })
    return () => { ch.unsubscribe() }
  }, [])


  const counts = regs.reduce((acc, r) => { const d = displayStatus(r); acc[d] = (acc[d] || 0) + 1; return acc }, {})
  const activeCount = regs.filter((r) => ["confirmed", "pending_payment", "pending_review", "held", "waitlist"].includes(displayStatus(r))).length

  const tabs = [
    { key: "all", label: t("myreg.tabAll"), count: regs.length },
    { key: "active", label: t("myreg.tabActive"), count: activeCount },
    { key: "confirmed", label: t("myreg.tabApproved"), count: counts["confirmed"] || 0 },
    { key: "pending_payment", label: t("myreg.tabPending"), count: counts["pending_payment"] || 0 },
    { key: "waitlist", label: t("myreg.tabWaitlist"), count: counts["waitlist"] || 0 },
    { key: "cancelled", label: t("myreg.tabCancelled"), count: counts["cancelled"] || 0 },
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <Ico.qr className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">{t("myreg.title")}</h1>
                <p className="text-slate-400 text-xs mt-0.5">My Registration</p>
              </div>
            </div>
          </div>

          {/* Filter tabs — มือถือ: เลื่อนแนวนอนลื่น / desktop: ขึ้นบรรทัดใหม่พอดีจอ */}
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
            <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: "none" }}>
              {tabs.map((tab) => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`snap-start flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium whitespace-nowrap transition-all ${
                    filter === tab.key ? "bg-[#F15A24] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 active:scale-95"}`}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === tab.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-5 sm:mt-6">
        {error && <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl p-4 mb-6 text-sm">{error}</div>}

        {regs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
              <Ico.qr className="w-7 h-7" />
            </div>
            <p className="text-slate-700 font-bold text-lg">{t("myreg.empty")}</p>
            <p className="text-slate-400 text-sm mt-1">{t("myreg.emptySub")}</p>
            <button onClick={() => navigate("/")} className="mt-5 px-6 py-2.5 bg-[#F15A24] text-white rounded-xl font-bold text-sm hover:bg-[#C44215] transition shadow-md shadow-orange-500/20">
              {t("myreg.viewCourses")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Ico.qr className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-700">{t("myreg.noneInTab")}</p>
            <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนตัวกรอง</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((reg) => {
              const d = displayStatus(reg)
              const cfg = STATUS_CFG[d] || STATUS_CFG.held
              const isPaid = (reg.price || 0) > 0
              const hasAction = d === "pending_payment" || (d === "rejected" && (reg.price || 0) > 0) || d === "expired" || (d === "confirmed" && (reg.participant_code || reg.my_qr_token || reg.qr_token))
              return (
                <div key={reg.id} onClick={() => setDetailReg(reg)}
                  className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-orange-200 transition-all duration-300 cursor-pointer flex flex-col">
                  <div className="p-4 sm:p-5 flex flex-col flex-1">
                    {/* แถวบน: ซ้าย=วันที่+ชื่อวิชา / ขวา=สถานะ */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {/* ───── ฝั่งซ้าย: วันที่ → ชื่อวิชา ───── */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {t("myreg.registeredOn")} {fmtDate(reg.created_at)}
                        </span>
                        <h3 className="font-semibold text-slate-800 text-sm sm:text-[15px] leading-snug flex items-start gap-2 flex-wrap">
                          <span className="flex-1 min-w-0">{reg.course_title}</span>
                          {reg.is_team_member && <span className="text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full shrink-0">👥 เพื่อนสมัครให้</span>}
                        </h3>
                      </div>

                      {/* ───── ฝั่งขวา: สถานะ (dot + pill) ───── */}
                      <div className="flex-shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
                          {t(cfg.key)}
                          {d === "waitlist" && reg.waitlist_pos ? ` — คิวที่ ${reg.waitlist_pos}` : ""}
                        </span>
                      </div>
                    </div>

                    {/* แถวกลาง: หมวดหมู่ + ทีม (ซ้าย) / ราคา (ขวา) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {reg.course_type && (() => { const cc = categoryCfg(reg.course_type); return (
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${cc.bg} ${cc.text}`}>{reg.course_type}</span>
                        ) })()}
                        {reg.theme_name && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            👥 ทีม: <span className="font-bold text-slate-600">{reg.theme_name}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block -mb-0.5">ราคา</span>
                        {isPaid
                          ? <span className="text-base sm:text-lg font-extrabold text-[#F15A24] leading-none whitespace-nowrap">{Number(reg.price).toLocaleString()}<span className="text-[10px] font-bold text-slate-400 ml-1">บาท</span></span>
                          : <span className="text-sm font-extrabold text-[#F15A24] whitespace-nowrap">ฟรี</span>}
                      </div>
                    </div>

                    {/* หมายเหตุสถานะ */}
                    {d === "waitlist" && <p className="text-[11px] text-slate-400 mt-2">*จำนวนเต็มแล้ว — เมื่อมีที่ว่างระบบจะเรียกคิวอัตโนมัติ</p>}
                    {d === "rejected" && reg.reject_reason && <p className="text-[11px] text-rose-400 mt-2">เหตุผล: {reg.reject_reason}</p>}

                    {/* ปุ่ม action — แถวล่างสุด ดันชิดท้ายการ์ดเสมอ กดง่ายบนมือถือ */}
                    {hasAction && (
                      <div className="flex flex-wrap gap-2 mt-3.5" onClick={(e) => e.stopPropagation()}>
                        {d === "pending_payment" && (
                          <button onClick={() => navigate(`/pay/${reg.id}`)}
                            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2">
                            <Ico.card className="w-4 h-4" />
                            {t("myreg.payNow")}
                          </button>
                        )}
                        {/* ข้อ 2.2: ถูกตีกลับ → ส่งใหม่ด้วยใบเดิม */}
                        {d === "rejected" && (reg.price || 0) > 0 && (
                          <button onClick={() => navigate(`/pay/${reg.id}`)}
                            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-[#F15A24] hover:bg-orange-600 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2">
                            <Ico.upload className="w-4 h-4" />
                            ส่งสลิปใหม่
                          </button>
                        )}
                        {/* หมดเวลาชำระ → สมัครใหม่ (คอร์สเดิม) */}
                        {d === "expired" && (
                          <button onClick={() => navigate(`/register/${reg.course_id}`)}
                            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-rose-500/20 transition flex items-center justify-center gap-2">
                            <Ico.rotate className="w-4 h-4" />
                            สมัครใหม่
                          </button>
                        )}
                        {d === "confirmed" && (reg.participant_code || reg.my_qr_token || reg.qr_token) && (
                          <button onClick={() => setBarcodeReg(reg)}
                            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-slate-900/10 transition flex items-center justify-center gap-2 group/btn">
                            <Ico.barcode className="w-4 h-4 group-hover/btn:scale-110 transition-transform" style={{ color: "#fb923c" }} />
                            {t("myreg.showBarcode")}
                          </button>
                        )}
                      </div>
                    )}
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[94dvh] sm:max-h-[92dvh] flex flex-col">
        {/* Header ส้ม */}
        <div className="bg-gradient-to-br from-[#F15A24] to-[#d04810] px-5 sm:px-6 py-4 text-white flex justify-between items-start shrink-0">
          <div className="pr-4 min-w-0">
            <p className="text-xs text-orange-200 mb-0.5 font-bold tracking-widest uppercase">{reg.course_type || "วิชา"}</p>
            <h3 className="font-extrabold text-lg sm:text-xl leading-tight">{reg.course_title}</h3>
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold px-3 py-1 rounded-full bg-white/20 backdrop-blur">
              {cfg.icon} {t(cfg.key)}{d === "waitlist" && reg.waitlist_pos ? ` — คิวที่ ${reg.waitlist_pos}` : ""}
            </span>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="text-white/80 hover:text-white text-2xl leading-none shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">×</button>
        </div>

        {/* 2 ฝั่ง */}
        <div className="overflow-y-auto flex-1 flex flex-col md:flex-row">
          {/* ───── ซ้าย: ข้อมูลวิชา (ดีไซน์เหมือนหน้า Home) ───── */}
          <div className="md:w-1/2 md:border-r border-gray-100 bg-[#fffbf8] p-5 space-y-4">
            {/* รูป carousel */}
            {images.length > 0 && (
              <div className="relative h-44 sm:h-48 rounded-2xl overflow-hidden bg-gray-200">
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

            {/* บาร์โค้ด (เฉพาะยืนยันแล้ว) — รหัสในแถบส้ม + บาร์โค้ดใต้รหัส (จุดเดียว) */}
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
            {(reg.theme_name || members.length > 0) && (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 my-2">
                {reg.theme_name && (
                  <p className="text-sm mb-2.5"><span className="text-xs font-bold text-purple-500">🎯 ชื่อทีม/ธีม:</span> <span className="font-bold text-gray-700">{reg.theme_name}</span></p>
                )}
                {members.length > 0 && (
                  <p className="text-xs font-bold text-purple-500 mb-2">👥 {reg.count_mode === "team" ? "สมาชิกในทีม" : "ผู้สมัคร"} ({members.length} คน)</p>
                )}
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
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition">
                            <Ico.barcode className="w-3.5 h-3.5" style={{ color: "#fb923c" }} /> ดูบาร์โค้ดของ {m.full_name?.split(" ")[0] || "สมาชิก"}
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
            <button onClick={() => setShowBarcode(true)} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2"><Ico.barcode className="w-4 h-4" style={{ color: "#fb923c" }} /> ดูบาร์โค้ด</button>
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
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes camt-scan{0%,100%{top:0%;opacity:.85}50%{top:100%;opacity:.85}}`}</style>
      <div className="bg-white w-full sm:rounded-[28px] shadow-2xl sm:max-w-sm overflow-hidden rounded-t-[28px]">
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-5 text-white text-center relative">
          <button onClick={onClose} aria-label="ปิด" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-lg leading-none">×</button>
          <div className="mx-auto w-11 h-11 bg-white/15 rounded-full flex items-center justify-center mb-2">
            <Ico.qr className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-bold text-lg">{member.full_name}</h3>
          <p className="text-amber-100 text-xs mt-0.5 truncate">📚 {courseTitle}</p>
        </div>
        <div className="p-6 relative bg-slate-50">
          <div className="absolute -left-3 top-0 -translate-y-1/2 w-6 h-6 bg-slate-950/60 rounded-full" />
          <div className="absolute -right-3 top-0 -translate-y-1/2 w-6 h-6 bg-slate-950/60 rounded-full" />
          <div className="border-t-2 border-dashed border-slate-200 pt-5 flex flex-col items-center">
            {/* รหัส + บาร์โค้ด เป็นจุดเดียวต่อกัน */}
            <div className="w-full bg-[#F15A24] text-white rounded-xl px-4 py-3 mb-4 text-center shadow-sm">
              <p className="text-[11px] text-orange-100 mb-0.5">รหัสนักเรียน (เช็คอิน)</p>
              <p className="font-mono text-3xl font-extrabold tracking-wider">{code}</p>
            </div>
            {barcodeUrl && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-3 w-full flex justify-center relative overflow-hidden">
                <div className="absolute left-0 right-0 h-1.5 bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,1)]" style={{ animation: "camt-scan 2s linear infinite" }} />
                <img src={barcodeUrl} alt="barcode" className="h-24 w-auto max-w-full object-contain" />
              </div>
            )}
            <p className="text-[11px] text-slate-400 text-center">สแกนบาร์โค้ด หรือแจ้งรหัสนักเรียนเพื่อเช็คอิน</p>
          </div>
        </div>
        <div className="px-6 pb-6 bg-slate-50 flex gap-2">
          <button onClick={saveImage} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2"><Ico.barcode className="w-4 h-4" style={{ color: "#fb923c" }} />💾 บันทึกภาพ</button>
          <button onClick={onClose} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-semibold text-sm hover:bg-slate-100 transition">ปิด</button>
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
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes camt-scan{0%,100%{top:0%;opacity:.85}50%{top:100%;opacity:.85}}`}</style>
      <div className="bg-white w-full sm:rounded-[28px] shadow-2xl sm:max-w-sm overflow-hidden rounded-t-[28px]">
        {/* Header ส้ม E-Ticket */}
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-6 text-white text-center relative">
          <button onClick={onClose} aria-label="ปิด" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-lg leading-none">×</button>
          <div className="mx-auto w-12 h-12 bg-white/15 rounded-full flex items-center justify-center mb-2">
            <Ico.qr className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-bold text-lg">{t("myreg.checkinTitle")}</h3>
          <p className="text-xs text-amber-100">{t("myreg.checkinSub")}</p>
        </div>

        {/* Ticket info area + dot cuts */}
        <div className="p-6 relative bg-slate-50">
          <div className="absolute -left-3 top-0 -translate-y-1/2 w-6 h-6 bg-slate-950/60 rounded-full" />
          <div className="absolute -right-3 top-0 -translate-y-1/2 w-6 h-6 bg-slate-950/60 rounded-full" />

          <div className="border-t-2 border-dashed border-slate-200 pt-5 flex flex-col items-center">
            {/* รหัสนักเรียน — เด่นสุด ใช้เช็คอินได้เลย / บาร์โค้ดอยู่ใต้รหัส (จุดเดียว) */}
            {code && (
              <div className="w-full bg-[#F15A24] text-white rounded-xl px-4 py-3 mb-4 text-center shadow-sm">
                <p className="text-[11px] text-orange-100 mb-0.5">รหัสนักเรียน (แจ้งเจ้าหน้าที่เพื่อเช็คอิน)</p>
                <p className="font-mono text-3xl font-extrabold tracking-wider">{code}</p>
              </div>
            )}
            {qrUrl && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-3 w-full flex justify-center relative overflow-hidden">
                <div className="absolute left-0 right-0 h-1.5 bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,1)]" style={{ animation: "camt-scan 2s linear infinite" }} />
                <img src={qrUrl} alt="barcode" className="h-24 w-auto max-w-full object-contain" />
              </div>
            )}
            <p className="text-[11px] text-slate-400 text-center mb-3">สแกนบาร์โค้ด หรือแจ้งรหัสนักเรียนให้เจ้าหน้าที่</p>
            <p className="text-sm font-bold text-[#F15A24] text-center pt-3 border-t border-slate-200 w-full">📚 {reg.course_title}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 bg-slate-50 flex gap-2">
          {code && <button onClick={saveImage} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold transition text-sm flex items-center justify-center gap-2"><Ico.barcode className="w-4 h-4" style={{ color: "#fb923c" }} />💾 บันทึกภาพ</button>}
          <button onClick={onClose} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-semibold hover:bg-slate-100 transition text-sm">
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