import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getSession, isAdminUser, signOut, fetchMyRegistrations } from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"

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
  if (r.status === "confirmed") return "confirmed"
  // ต้องจ่ายเงิน = วิชามีราคา (price > 0) — ตรงกับที่แอดมินตั้งต่อวิชา
  const needPay = (r.price || 0) > 0
  // held = กันที่นั่งอยู่
  if (r.status === "held") {
    if (needPay) {
      if (r.payment_status === "submitted" || r.payment_status === "pending") return "pending_review"
      if (r.payment_status === "rejected") return "rejected"
      return "pending_payment"
    }
    return "held" // ฟรี/competition รออนุมัติ
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

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) { navigate("/login"); return }
      if (await isAdminUser()) { navigate("/admin/dashboard"); return }
      try { setRegs(await fetchMyRegistrations()) }
      catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })
  }, [navigate])

  async function handleLogout() { await signOut(); navigate("/login") }

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
            <div className="flex items-center gap-3">
              <LangToggle />
              <button onClick={() => navigate("/")} className="text-sm text-[#F15A24] font-bold hover:underline">{t("myreg.addMore")}</button>
              <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600">{t("common.logout")}</button>
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
                <div key={reg.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className={`h-1 w-full ${cfg.dot}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-base sm:text-lg text-gray-800 mb-1 leading-snug flex items-center gap-2 flex-wrap">
                          {reg.course_title}
                          {reg.is_team_member && <span className="text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full">👥 เพื่อนสมัครให้</span>}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
                          <span>{t("myreg.regId")}: <span className="font-mono font-bold text-gray-600">{reg.id.slice(0, 8)}</span></span>
                          <span>{t("myreg.registeredOn")} {fmtDate(reg.created_at)}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border w-fit ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.icon} {t(cfg.key)}
                            {d === "waitlist" && reg.waitlist_pos ? ` — คิวที่ ${reg.waitlist_pos}` : ""}
                          </span>
                          {d === "waitlist" && <span className="text-[11px] text-gray-400 pl-1">*เมื่อมีที่ว่าง ระบบจะเรียกคิวอัตโนมัติ</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {d === "pending_payment" && (
                          <button onClick={() => navigate(`/pay/${reg.id}`)}
                            className="px-4 py-2 rounded-xl bg-[#ec9213] hover:bg-[#d6810b] text-white font-bold text-sm shadow-sm transition">
                            {t("myreg.payNow")}
                          </button>
                        )}
                        {d === "confirmed" && (reg.my_qr_token || reg.qr_token) && (
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
    </div>
  )
}

// Modal แสดง QR เช็คอิน (encode qr_token ให้เครื่องสแกนของแอดมินอ่าน)
function CheckinModal({ reg, t, onClose }) {
  const [qrUrl, setQrUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function gen() {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js")
        // qrcodejs วาด DOM — ใช้ qrserver API เป็น fallback ที่ง่ายกว่า
      } catch {}
      // ใช้ image API สร้าง QR (ไม่ต้องพึ่ง DOM lib)
      if (!cancelled) {
        const token = reg.my_qr_token || reg.qr_token
        setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(token)}`)
      }
    }
    gen()
    return () => { cancelled = true }
  }, [reg])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:rounded-2xl shadow-2xl sm:max-w-sm overflow-hidden rounded-t-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white text-center">
          <h3 className="font-extrabold text-xl tracking-wide">{t("myreg.checkinTitle")}</h3>
          <p className="text-blue-200 text-xs mt-1">{t("myreg.checkinSub")}</p>
        </div>
        <div className="p-6 bg-gray-50 flex flex-col items-center">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4">
            {qrUrl ? <img src={qrUrl} alt="QR check-in" className="w-48 h-48" /> : <div className="w-48 h-48 flex items-center justify-center text-gray-300">…</div>}
          </div>
          {/* รหัสสั้นสำหรับกรอกมือ (กรณีสแกนไม่ได้) */}
          {(() => {
            const token = reg.my_qr_token || reg.qr_token || ""
            const shortCode = token.slice(0, 6).toUpperCase()
            return shortCode ? (
              <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 mb-2 text-center">
                <p className="text-[11px] text-gray-400 mb-0.5">รหัสเช็คอิน (กรณีสแกน QR ไม่ได้)</p>
                <p className="font-mono text-2xl font-extrabold text-gray-800 tracking-[0.3em]">{shortCode}</p>
              </div>
            ) : null
          })()}
          <p className="text-sm font-bold text-[#F15A24] text-center pt-3 border-t border-gray-200 w-full">📚 {reg.course_title}</p>
        </div>
        <div className="p-4 bg-white">
          <button onClick={onClose} className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition text-sm">
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