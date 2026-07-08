import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  signIn, signUp, signInWithGoogle, getSession,
  isAdminUser, fetchSettings, resetPassword, fetchMyProfile, claimPendingProfile,
  fetchOpenEvent, fetchEventSettings,
} from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"
import { useDialog } from "../lib/dialog.jsx"

function EyeIcon({ off }) {
  return off ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [mode, setMode] = useState("login") // login | signup
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [info, setInfo] = useState("")
  const [settings, setSettings] = useState({ line_id: "", phone: "" })
  const [showResetModal, setShowResetModal] = useState(false)
  const [siteTitle, setSiteTitle] = useState("")
  const [heroSub, setHeroSub] = useState("")

  useEffect(() => {
    getSession().then((s) => { if (s) routeAfterAuth(navigate) })
    fetchSettings().then(setSettings).catch(() => {})
  }, [navigate])

  // โหลดชื่องาน + ข้อความ hero จากหน้าตั้งค่า (ตามงานที่เปิดรับสมัคร)
  useEffect(() => {
    (async () => {
      try {
        const ev = await fetchOpenEvent()
        if (ev?.id) {
          const es = await fetchEventSettings(ev.id)
          setSiteTitle(es.site_title || "")
          setHeroSub(es.hero_subtitle || "")
        }
      } catch (_) { /* เงียบไว้ ใช้ค่า fallback */ }
    })()
  }, [])

  async function handleSubmit(e) {
    e?.preventDefault?.()
    setLoading(true); setErrorMsg(""); setInfo("")
    try {
      if (mode === "signup") {
        const res = await signUp(email.trim(), password)
        if (!res.session) {
          setInfo(t("login.signupOk")); setMode("login"); return
        }
        navigate("/profile"); return
      }
      await signIn(email.trim(), password)
      await routeAfterAuth(navigate)
    } catch (error) {
      setErrorMsg(translateAuthError(error.message, mode, t))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    if (loading) return
    setLoading(true); setErrorMsg("")
    try { await signInWithGoogle() }
    catch { setErrorMsg("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่"); setLoading(false) }
  }

  const isSignup = mode === "signup"

  return (
    <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-white">
      {/* ── Left panel (desktop) — brand + ชื่องานจาก setting ── */}
      <div className="hidden md:flex md:w-5/12 lg:w-1/2 bg-gradient-to-br from-[#F15A24] to-amber-500 relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[40rem] h-[40rem] bg-black/10 rounded-full blur-3xl transform translate-x-1/3 translate-y-1/3" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`, backgroundSize: "32px 32px" }} />
        </div>
        <div className="relative z-10 flex items-center justify-end">
          <LangToggle />
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center text-white">
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            {siteTitle || "CAMT SUMMER COURSE 2026"}
          </h1>
          <p className="text-lg text-orange-100/90 font-medium max-w-md leading-relaxed">{heroSub || t("login.heroSub")}</p>
        </div>
        <div className="relative z-10 text-orange-100 text-sm font-medium">
          &copy; {new Date().getFullYear()} College of Arts, Media and Technology
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-12 relative bg-slate-50 overflow-y-auto">
        {/* Mobile: lang toggle */}
        <div className="md:hidden flex justify-end items-center mb-6">
          <LangToggle />
        </div>

        <div className="w-full max-w-[420px] mx-auto bg-white p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60">
          <div className="mb-8 text-center md:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {isSignup ? t("login.signupTitle") : t("login.title")}
            </h2>
            <p className="text-slate-500 mt-2 text-sm">
              {isSignup ? t("login.signupSubtitle") : t("login.subtitle")}
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3.5 mb-6 text-sm animate-fade-in">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
              <span className="font-medium leading-relaxed">{errorMsg}</span>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl px-4 py-3.5 mb-6 text-sm animate-fade-in">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <span className="font-medium leading-relaxed">{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("login.email")}</label>
              <input
                type="email" required autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg("") }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50 outline-none transition-all text-sm text-slate-900 placeholder-slate-400"
                placeholder="Ex. student@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-bold text-slate-700">{t("login.password")}</label>
                {!isSignup && (
                  <button type="button" onClick={() => setShowResetModal(true)}
                    className="text-xs text-[#F15A24] hover:text-[#c44215] font-semibold transition-colors">
                    {t("login.forgot")}
                  </button>
                )}
              </div>
              <div className="relative group">
                <input
                  type={showPassword ? "text" : "password"} required value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg("") }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50 outline-none transition-all text-sm text-slate-900 placeholder-slate-400 pr-12"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-[#F15A24] transition-colors p-1">
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="mt-4 w-full bg-[#F15A24] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#c44215] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow-md shadow-orange-500/20 disabled:opacity-70 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Spinner /><span>{t("login.processing")}</span>
                </>
              ) : (isSignup ? t("login.submitSignup") : t("login.submit"))}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">{t("login.orWith")}</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <button type="button" onClick={handleGoogleLogin} disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-3 border ${loading ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] hover:shadow-sm"}`}>
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            <span>Google</span>
          </button>

          <p className="mt-8 text-center text-slate-500 text-sm">
            {t("login.noAccount")}{" "}
            <Link to="/signup" className="text-[#F15A24] font-bold hover:text-[#c44215] hover:underline transition-colors">
              {t("login.signupNew")}
            </Link>
          </p>
        </div>
      </div>

      {showResetModal && <ResetModal onClose={() => setShowResetModal(false)} t={t} />}
    </div>
  )
}

function ResetModal({ onClose, t }) {
  const { toast } = useDialog()
  const [resetEmail, setResetEmail] = useState("")
  const [resetSent, setResetSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleReset() {
    if (!resetEmail) { toast(t("login.resetEmailLabel"), "error"); return }
    setSending(true)
    try { await resetPassword(resetEmail); setResetSent(true) }
    catch (e) {
      const msg = (e.message || "").toLowerCase()
      if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429") || msg.includes("security purposes")) {
        toast("ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่ (ประมาณ 1 นาที) แล้วลองใหม่", "error")
      } else if (msg.includes("not found") || msg.includes("invalid")) {
        toast("ไม่พบอีเมลนี้ในระบบ กรุณาตรวจสอบอีกครั้ง", "error")
      } else {
        toast("ส่งอีเมลไม่สำเร็จ: " + e.message, "error")
      }
    }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-6 text-white">
          <h3 className="text-xl font-extrabold flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>
            {t("login.resetTitle").replace("🔑 ", "")}
          </h3>
          <p className="text-orange-100 text-sm mt-1.5 font-medium">{t("login.resetSub")}</p>
        </div>
        <div className="p-7">
          {resetSent ? (
            <div className="text-center py-5">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 rounded-full mb-4">
                <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <h4 className="font-bold text-slate-900 text-lg mb-1">ส่งอีเมลเรียบร้อย!</h4>
              <p className="text-slate-500 text-sm mb-6">กรุณาตรวจสอบ Inbox หรือโฟลเดอร์ Junk Mail ของคุณ</p>
              <button onClick={onClose} className="w-full py-3.5 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition text-sm active:scale-[0.98]">
                {t("login.resetClose")}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">{t("login.resetEmailLabel")}</label>
                <input type="email" placeholder="Ex. student@example.com"
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-orange-50 focus:border-[#F15A24] bg-slate-50 focus:bg-white transition"
                  value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReset()} autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition text-sm active:scale-[0.98]">
                  {t("common.cancel")}
                </button>
                <button onClick={handleReset} disabled={sending}
                  className="flex-1 py-3.5 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#c44215] hover:shadow-lg transition text-sm active:scale-[0.98] shadow-md">
                  {sending ? t("login.resetSending") : t("login.resetSend")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// หลัง login: admin → panel, อีเมลอื่น → หน้าลงทะเบียน
export async function routeAfterAuth(navigate) {
  if (await isAdminUser()) { navigate("/admin/dashboard"); return }
  // เฟส 1: เช็คว่ามีโปรไฟล์ที่ admin import ไว้ล่วงหน้าไหม (ผูกด้วย email) → ดึงมาผูก
  try { await claimPendingProfile() } catch (_) {}
  try {
    const p = await fetchMyProfile()
    if (p && p.is_complete) { navigate("/"); return }
  } catch (_) {}
  navigate("/profile")
}

function translateAuthError(msg, mode, t) {
  if (!msg) return "เกิดข้อผิดพลาด"
  if (msg.includes("Invalid login")) return t("login.errInvalid")
  if (msg.includes("already registered") || msg.includes("already been registered")) return t("login.errExists")
  if (msg.includes("Password should be")) return t("login.errPwShort")
  if (msg.includes("valid email")) return t("login.errEmail")
  return (mode === "signup" ? "สมัครไม่สำเร็จ: " : "เข้าสู่ระบบไม่สำเร็จ: ") + msg
}