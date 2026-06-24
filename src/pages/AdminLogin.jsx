import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { signIn, signOut, getSession, isAdminUser } from "../lib/supabase.js"

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSession().then(async (s) => {
      if (s && (await isAdminUser())) navigate("/admin/panel")
    })
  }, [navigate])

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      // login สำเร็จยังไม่พอ — ต้องเป็นแอดมินจริงในตาราง admins
      const ok = await isAdminUser()
      if (!ok) {
        await signOut()
        setError("บัญชีนี้ไม่มีสิทธิ์แอดมิน")
        return
      }
      navigate("/admin/panel")
    } catch (e) {
      setError("เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={st.page}>
      <div style={st.box}>
        <h1 style={st.title}>เข้าสู่ระบบแอดมิน</h1>
        <p style={st.sub}>สำหรับเจ้าหน้าที่จัดการระบบ</p>
        <label>อีเมล</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 16 }} />
        <label>รหัสผ่าน</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()} style={{ marginBottom: 16 }} />
        {error && <div style={st.err}>{error}</div>}
        <button style={st.btn} onClick={handleLogin} disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </div>
    </div>
  )
}

const st = {
  page: { maxWidth: 420, margin: "0 auto", padding: "80px 20px" },
  box: { background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 32 },
  title: { fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 6 },
  sub: { fontSize: 14, color: "var(--muted)", textAlign: "center", marginBottom: 24 },
  err: { background: "#fff5f5", border: "1px solid #ffc9c9", color: "var(--red)", padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 12 },
  btn: { background: "var(--orange)", color: "#fff", border: "none", padding: "12px 0", borderRadius: 8, fontSize: 16, fontWeight: 700, width: "100%" },
}