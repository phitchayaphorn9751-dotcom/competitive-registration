import { useEffect, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { getSession, fetchMyRegistrations, fetchCourse, setPaymentDeadline } from "../lib/supabase.js"
import { useLang } from "../lib/i18n.jsx"
import { PaymentScreen } from "./RegisterPage.jsx"

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้าอื่น ─────
const Ico = {
  arrowLeft: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
}

// หน้าชำระเงินของใบสมัครเดิม (ไม่สร้างใบใหม่) — เปิดจากปุ่ม "ชำระเงิน" ในหน้ารายการสมัคร
export default function PayPage() {
  const { regId } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const [course, setCourse] = useState(null)
  const [deadline, setDeadline] = useState(null)
  const [isRejected, setIsRejected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const s = await getSession()
        if (!s) { navigate("/login"); return }
        const regs = await fetchMyRegistrations()
        const reg = regs.find((r) => r.id === regId)
        if (!reg) { setError("ไม่พบใบสมัครนี้ หรือคุณไม่มีสิทธิ์เข้าถึง"); return }
        if ((reg.price || 0) <= 0) { setError("วิชานี้ไม่ต้องชำระเงิน"); return }
        // ถ้าถูกตีกลับ → ไม่จับเวลา (ส่งสลิปใหม่ได้ไม่จำกัดเวลา) ตาม reference
        const rejected = reg.status === "slip_rejected" || !!reg.reject_reason
        setIsRejected(rejected)
        if (rejected) {
          setDeadline(null)  // ไม่แสดง timer
        } else {
          let dl = reg.payment_deadline
          if (!dl) dl = await setPaymentDeadline(regId)
          setDeadline(dl)
        }
        // โหลดข้อมูลคอร์ส (เลขบัญชี/ธนาคาร/ราคา)
        const c = await fetchCourse(reg.course_id)
        setCourse(c)
      } catch (e) {
        setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [regId, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-rose-600 font-bold text-center">{error}</p>
        <Link to="/my-registration" className="inline-flex items-center gap-1.5 text-[#F15A24] font-bold"><Ico.arrowLeft className="w-4 h-4" /> กลับไปรายการสมัคร</Link>
      </div>
    )
  }

  return <PaymentScreen course={course} regId={regId} t={t} navigate={navigate} deadline={deadline} isRejected={isRejected} />
}