import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  signIn, signUp, signInWithGoogle, getSession,
  isAdminUser, fetchSettings, resetPassword, fetchMyProfile,
} from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"
import { useDialog } from "../lib/dialog.jsx"

// โลโก้: วางไฟล์ที่ public/camt_logo.png แล้วจะแสดงอัตโนมัติ ถ้าไม่มีจะใช้ ◆
const LOGO_SRC = "/camt_logo.png"

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

  useEffect(() => {
    getSession().then((s) => { if (s) routeAfterAuth(navigate) })
    fetchSettings().then(setSettings).catch(() => {})
  }, [navigate])

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
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:py-14">
      <div className="w-full max-w-[440px] mx-auto">
        <div className="w-full bg-white p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-gray-100/60 relative">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {isSignup ? t("login.signupTitle") : t("login.title")}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">
              {isSignup ? t("login.signupSubtitle") : t("login.subtitle")}
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 rounded-2xl px-4 py-3.5 mb-6 text-sm animate-fade-in">
              <span className="text-base shrink-0 mt-0.5">⚠️</span>
              <span className="font-medium leading-relaxed">{errorMsg}</span>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-3 bg-green-50 border border-green-100 text-green-700 rounded-2xl px-4 py-3.5 mb-6 text-sm animate-fade-in">
              <span className="text-base shrink-0 mt-0.5">✅</span>
              <span className="font-medium leading-relaxed">{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">{t("login.email")}</label>
              <input
                type="email" required autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg("") }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50 outline-none transition-all text-sm text-gray-900 placeholder-gray-400"
                placeholder="Ex. student@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-bold text-gray-700">{t("login.password")}</label>
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
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50 outline-none transition-all text-sm text-gray-900 placeholder-gray-400 pr-12"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-[#F15A24] transition-colors p-1">
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
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">{t("login.orWith")}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <button type="button" onClick={handleGoogleLogin} disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-3 border ${loading ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] hover:shadow-sm"}`}>
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            <span>Google</span>
          </button>
        </div>

        <div className="mt-8 text-center relative z-10">
          <p className="text-gray-500 text-sm">
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
    catch (e) { toast("เกิดข้อผิดพลาด: " + e.message, "error") }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-[#F15A24] to-[#d04616] p-6 text-white">
          <h3 className="text-xl font-extrabold flex items-center gap-2"><span>🔑</span> {t("login.resetTitle").replace("🔑 ", "")}</h3>
          <p className="text-orange-100 text-sm mt-1.5 font-medium">{t("login.resetSub")}</p>
        </div>
        <div className="p-7">
          {resetSent ? (
            <div className="text-center py-5">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 rounded-full mb-4">
                <span className="text-3xl text-green-500">✓</span>
              </div>
              <h4 className="font-bold text-gray-900 text-lg mb-1">ส่งอีเมลเรียบร้อย!</h4>
              <p className="text-gray-500 text-sm mb-6">กรุณาตรวจสอบ Inbox หรือโฟลเดอร์ Junk Mail ของคุณ</p>
              <button onClick={onClose} className="w-full py-3.5 bg-gray-100 text-gray-800 rounded-xl font-bold hover:bg-gray-200 transition text-sm active:scale-[0.98]">
                {t("login.resetClose")}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">{t("login.resetEmailLabel")}</label>
                <input type="email" placeholder="Ex. student@example.com"
                  className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-orange-50 focus:border-[#F15A24] bg-gray-50 focus:bg-white transition"
                  value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReset()} autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition text-sm active:scale-[0.98]">
                  {t("common.cancel")}
                </button>
                <button onClick={handleReset} disabled={sending}
                  className="flex-1 py-3.5 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#d04616] hover:shadow-lg transition text-sm active:scale-[0.98] shadow-md">
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

function Logo({ className }) {
  const [err, setErr] = useState(false)
  if (LOGO_SRC && !err) {
    return <img src={LOGO_SRC} alt="CAMT" onError={() => setErr(true)}
      className={`${className} rounded-2xl bg-white p-2 shadow-2xl object-contain`} />
  }
  return <div className={`${className} rounded-2xl bg-white flex items-center justify-center shadow-2xl text-[#F15A24] text-3xl`}>◆</div>
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
  // ข้อ 2: ถ้ามีข้อมูลโปรไฟล์ครบแล้ว → เข้าหน้า home เลย / ยังไม่ครบ → ไปกรอกโปรไฟล์
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