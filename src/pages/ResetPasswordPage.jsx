import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase, updatePassword } from "../lib/supabase.js"

function EyeIcon({ off }) {
  return off ? (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
  ) : (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)   // token พร้อม (session recovery)
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  // Supabase อ่าน token จาก URL อัตโนมัติ → สร้าง session ชั่วคราว (event PASSWORD_RECOVERY)
  useEffect(() => {
    // เช็ค session ปัจจุบัน (ถ้ามาจากลิงก์รีเซ็ต จะมี session)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true)
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  async function handleSubmit() {
    setError("")
    if (pw.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
    if (pw !== confirm) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน")
    setSaving(true)
    try {
      await updatePassword(pw)
      setDone(true)
      setTimeout(() => navigate("/login"), 2500)
    } catch (e) {
      setError("ตั้งรหัสใหม่ไม่สำเร็จ: " + (e.message || "") + " — ลิงก์อาจหมดอายุ ลองขอลิงก์ใหม่")
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 p-6 text-white">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 className="text-xl font-extrabold">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-white/80 text-sm mt-0.5">กรอกรหัสผ่านใหม่ของคุณด้านล่าง</p>
        </div>

        <div className="p-6">
          {done ? (
            <div className="text-center py-6">
              <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <h3 className="font-bold text-lg text-slate-800 mb-1">เปลี่ยนรหัสผ่านสำเร็จ</h3>
              <p className="text-slate-500 text-sm">กำลังพาไปหน้าเข้าสู่ระบบ…</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-8">
              <div className="mx-auto w-10 h-10 border-3 border-slate-200 border-t-[#F15A24] rounded-full animate-spin mb-4" />
              <p className="text-slate-500 text-sm">กำลังตรวจสอบลิงก์…</p>
              <p className="text-slate-400 text-xs mt-2">หากค้างนาน ลิงก์อาจหมดอายุ — <button onClick={() => navigate("/login")} className="text-[#F15A24] font-bold underline">ขอลิงก์ใหม่</button></p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* รหัสใหม่ */}
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">รหัสผ่านใหม่</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon off={showPw} />
                  </button>
                </div>
              </div>
              {/* ยืนยันรหัส */}
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">ยืนยันรหัสผ่านใหม่</label>
                <input type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm" />
              </div>

              {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

              <button onClick={handleSubmit} disabled={saving}
                className="w-full bg-gradient-to-r from-[#F15A24] to-amber-500 hover:from-[#c44215] hover:to-amber-600 text-white font-bold py-3.5 rounded-xl shadow-md shadow-orange-500/20 transition active:scale-[0.98] disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "ตั้งรหัสผ่านใหม่"}
              </button>
              <button onClick={() => navigate("/login")} className="w-full text-slate-500 text-sm font-medium hover:text-slate-700 transition">
                กลับหน้าเข้าสู่ระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}