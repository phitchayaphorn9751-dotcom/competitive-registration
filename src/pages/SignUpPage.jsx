import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { signUp, getSession, fetchOpenEvent, fetchEventSettings } from "../lib/supabase.js"
import { useLang, LangToggle } from "../lib/i18n.jsx"
import { useDialog } from "../lib/dialog.jsx"
import { routeAfterAuth } from "./LoginPage.jsx"

function EyeIcon({ off }) {
  return off ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

export default function SignUpPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const { toast } = useDialog()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [siteTitle, setSiteTitle] = useState("")
  const [heroSub, setHeroSub] = useState("")

  useEffect(() => {
    getSession().then((s) => { if (s) routeAfterAuth(navigate) })
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
      } catch (_) { /* เงียบไว้ ถ้าโหลดไม่ได้ใช้ค่า fallback */ }
    })()
  }, [])

  function strengthOf(pw) {
    if (!pw) return null
    if (pw.length < 6) return { label: t("signup.strengthWeak"), color: "bg-rose-400", width: "25%", cls: "text-rose-500" }
    if (pw.length < 8) return { label: t("signup.strengthFair"), color: "bg-amber-400", width: "50%", cls: "text-amber-600" }
    if (pw.length < 12) return { label: t("signup.strengthGood"), color: "bg-sky-400", width: "75%", cls: "text-sky-500" }
    return { label: t("signup.strengthStrong"), color: "bg-emerald-500", width: "100%", cls: "text-emerald-600" }
  }
  const strength = strengthOf(password)

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (password !== confirm) return setError(t("signup.pwMismatch"))
    if (password.length < 6) return setError(t("signup.pwTooShort"))
    setError(""); setLoading(true)
    try {
      const res = await signUp(email.trim(), password)
      if (!res.session) {
        // ต้องยืนยันอีเมลก่อน
        toast(t("login.signupOk"), "info")
        navigate("/login")
        return
      }
      navigate("/profile")
    } catch (err) {
      if (err.message?.includes("already")) setError(t("signup.emailUsed"))
      else setError("เกิดข้อผิดพลาด: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputBase = "w-full px-4 py-3 rounded-xl border bg-slate-50/50 focus:bg-white outline-none transition-all text-sm text-slate-900 placeholder-slate-400"

  return (
    <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-white">
      {/* Left panel */}
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

      {/* Right form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-12 relative bg-slate-50 overflow-y-auto">
        <div className="md:hidden flex justify-end items-center mb-6">
          <LangToggle />
        </div>

        <div className="w-full max-w-[420px] mx-auto bg-white p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60">
          <div className="mb-8 text-center md:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t("signup.title")}</h2>
            <p className="text-slate-500 mt-2 text-sm">{t("signup.subtitle")}</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3.5 mb-6 text-sm animate-fade-in">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("login.email")}</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={`${inputBase} border-slate-200 focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50`}
                placeholder="Ex. student@example.com" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("login.password")}</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} border-slate-200 focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50 pr-12`}
                  placeholder={t("signup.pwPlaceholder")} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-[#F15A24] p-1">
                  <EyeIcon off={showPw} />
                </button>
              </div>
              {strength && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${strength.color}`} style={{ width: strength.width }} />
                  </div>
                  <div className={`text-xs mt-1.5 font-semibold ${strength.cls}`}>{t("signup.strength")}: {strength.label}</div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("signup.confirmPw")}</label>
              <div className="relative">
                <input type={showConfirm ? "text" : "password"} required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className={`${inputBase} pr-12 ${
                    confirm && password !== confirm ? "border-rose-300 bg-rose-50/50 focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                    : confirm && password === confirm ? "border-emerald-300 bg-emerald-50/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    : "border-slate-200 focus:border-[#F15A24] focus:ring-4 focus:ring-orange-50"}`}
                  placeholder={t("signup.confirmPwPlaceholder")} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-[#F15A24] p-1">
                  <EyeIcon off={showConfirm} />
                </button>
              </div>
              {confirm && (
                <div className={`text-xs mt-1.5 font-semibold ${password === confirm ? "text-emerald-600" : "text-rose-500"}`}>
                  {password === confirm ? t("signup.pwMatch") : t("signup.pwNoMatch")}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="mt-6 w-full bg-[#F15A24] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#c44215] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all shadow-md shadow-orange-500/20 disabled:opacity-70 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{t("login.processing")}</span>
                </>
              ) : t("signup.submit")}
            </button>
          </form>

          <p className="mt-8 text-center text-slate-500 text-sm">
            {t("signup.hasAccount")}{" "}
            <Link to="/login" className="text-[#F15A24] font-bold hover:underline">{t("signup.loginNow")}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}