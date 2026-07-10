import { useEffect, useState } from "react"
import { useParams, useNavigate, useOutletContext } from "react-router-dom"
import { fetchRegistration, confirmRegistration, releaseSeat, cancelRegistration, rejectRegistration, rejectPortfolio, promoteWaitlist, fetchCoursesAdmin, adminReassign, adminUpdatePaymentAmount, deleteRegistration, saveRegistrationTheme, adminUpdateParticipant, adminUpdateAdvisor, uploadSlip, attachSlip } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

const STATUS = {
  pending_payment: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "⚠️ รอชำระเงิน" },
  slip_uploaded:   { cls: "bg-blue-100 text-blue-700 border-blue-200", label: "⏳ รอตรวจสอบ" },
  submitted:       { cls: "bg-blue-100 text-blue-700 border-blue-200", label: "⏳ รอพิจารณา" },
  confirmed:       { cls: "bg-green-100 text-green-700 border-green-200", label: "✅ ยืนยันแล้ว" },
  approved:        { cls: "bg-green-100 text-green-700 border-green-200", label: "✅ อนุมัติแล้ว" },
  waitlist:        { cls: "bg-purple-100 text-purple-700 border-purple-200", label: "📋 คิวสำรอง" },
  slip_rejected:   { cls: "bg-red-100 text-red-700 border-red-200", label: "❌ สลิปไม่ผ่าน" },
  rejected:        { cls: "bg-red-100 text-red-700 border-red-200", label: "❌ ไม่ผ่าน" },
  expired:         { cls: "bg-rose-50 text-rose-500 border-rose-200", label: "⏰ หมดเวลา" },
  held:            { cls: "bg-orange-100 text-orange-700 border-orange-200", label: "🕓 กันที่นั่ง" },
}

export default function AdminVerifySlip() {
  const { id: registrationId } = useParams()
  const navigate = useNavigate()
  const { session } = useOutletContext()
  const { toast, confirm } = useDialog()
  const onBack = () => navigate("/admin/applicants")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [uploadingSlip, setUploadingSlip] = useState(false)

  useEffect(() => { load() }, [registrationId])
  async function load() {
    setLoading(true)
    try {
      const d = await fetchRegistration(registrationId)
      setData(d)
    }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function approve() {
    const ok = await confirm({ title: "อนุมัติการสมัคร?", message: "ระบบจะออก QR เช็คอินให้ผู้สมัคร", confirmText: "อนุมัติ", tone: "success" })
    if (!ok) return
    setBusy(true)
    try { await confirmRegistration(registrationId, session?.user?.id); toast("อนุมัติเรียบร้อย!", "success"); onBack() }
    catch (e) {
      const msg = e.message?.includes("COURSE_FULL")
        ? "❌ คอร์สเต็มแล้ว — อนุมัติเพิ่มไม่ได้ (ผู้สมัครที่เหลือเป็นคิวสำรอง)"
        : "ผิดพลาด: " + e.message
      toast(msg, "error")
    } finally { setBusy(false) }
  }
  async function doReject() {
    if (!rejectReason.trim()) return toast("กรุณาระบุเหตุผล", "error")
    setBusy(true)
    try { await rejectRegistration(registrationId, rejectReason.trim()); toast("ตีกลับเรียบร้อย (ผู้สมัครส่งสลิปใหม่ได้)", "success"); setRejectModal(false); onBack() }
    catch (e) { toast("ผิดพลาด: " + e.message, "error") } finally { setBusy(false) }
  }
  // ประเภท 3 (เสียเงิน): ให้สิทธิ์คิวสำรอง → รอชำระเงิน (ไม่จับเวลา)
  async function promoteAction() {
    const ok = await confirm({ title: "ให้สิทธิ์ชำระเงิน?", message: "ดึงจากคิวสำรอง → ผู้สมัครแนบสลิปได้ (ไม่จับเวลา)", confirmText: "ให้สิทธิ์", tone: "success" })
    if (!ok) return
    setBusy(true)
    try { await promoteWaitlist(registrationId); toast("ให้สิทธิ์เรียบร้อย — ผู้สมัครชำระเงินได้แล้ว", "success"); onBack() }
    catch (e) {
      const msg = e.message?.includes("COURSE_FULL") ? "❌ คอร์สเต็มแล้ว — คืนที่นั่งก่อนจึงให้สิทธิ์ได้" : "ผิดพลาด: " + e.message
      toast(msg, "error")
    } finally { setBusy(false) }
  }
  // ประเภท 2 (ฟรี+ผลงาน): ไม่ผ่าน → กลับคิวสำรอง ไม่มี popup
  async function rejectPortfolioAction() {
    const ok = await confirm({ title: "ผลงานไม่ผ่าน?", message: "ส่งกลับไปเป็นคิวสำรอง — อนุมัติกลับมาได้ภายหลัง", confirmText: "ไม่ผ่าน", tone: "danger" })
    if (!ok) return
    setBusy(true)
    try { await rejectPortfolio(registrationId); toast("ส่งกลับคิวสำรองแล้ว", "success"); onBack() }
    catch (e) { toast("ผิดพลาด: " + e.message, "error") } finally { setBusy(false) }
  }
  async function release() {
    const ok = await confirm({ title: "ยกเลิกใบสมัคร?", message: "คืนที่นั่ง + ยกเลิกใบสมัครนี้\nระบบจะดึง waitlist ขึ้นมาแทนถ้ามี", confirmText: "ยกเลิกใบสมัคร", tone: "danger" })
    if (!ok) return
    setBusy(true)
    try { await cancelRegistration(registrationId); toast("ยกเลิกใบสมัครเรียบร้อย", "success"); onBack() }
    catch (e) { toast("ผิดพลาด: " + e.message, "error") } finally { setBusy(false) }
  }

  async function doDelete() {
    const ok = await confirm({
      title: "🗑 ลบรายการสมัครนี้?",
      message: "ลบใบสมัคร + ผู้เข้าร่วม + สลิป ออกจากระบบถาวร กู้คืนไม่ได้\n(ระบบจะคืนที่นั่งให้คอร์สอัตโนมัติ)",
      confirmText: "ลบถาวร", tone: "danger",
    })
    if (!ok) return
    setBusy(true)
    try { await deleteRegistration(registrationId); toast("ลบรายการสมัครแล้ว", "success"); onBack() }
    catch (e) { toast("ลบไม่สำเร็จ: " + e.message, "error"); setBusy(false) }
  }

  // แอดมินอัปโหลดสลิปแทนผู้สมัคร → ใช้ uploadSlip + attachSlip (attach_slip เป็น security definer)
  // ตั้งสถานะเป็น slip_uploaded (รอตรวจสอบ) แล้วแอดมินกดอนุมัติต่อได้
  async function handleAdminUploadSlip(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast("ไฟล์ใหญ่เกิน 5MB", "error"); e.target.value = ""; return }
    const ok = await confirm({
      title: "อัปโหลดสลิปแทนผู้สมัคร?",
      message: `แนบสลิป "${file.name}" แทนผู้สมัคร\nสถานะจะเปลี่ยนเป็น "รอตรวจสอบ" เพื่อให้กดอนุมัติต่อ`,
      confirmText: "อัปโหลด", tone: "success",
    })
    if (!ok) { e.target.value = ""; return }
    setUploadingSlip(true)
    try {
      const url = await uploadSlip(file, registrationId)
      await attachSlip(registrationId, url, data.courses?.price || 0)
      toast("อัปโหลดสลิปแทนเรียบร้อย — สถานะรอตรวจสอบ", "success")
      await load()
    } catch (err) {
      const msg = err.message?.includes("INVALID_STATE")
        ? "อัปสลิปไม่ได้ — สถานะใบนี้ไม่รองรับ (ต้องเป็นรอชำระ/รอตรวจสอบ/ตีกลับ)"
        : "อัปโหลดไม่สำเร็จ: " + err.message
      toast(msg, "error")
    } finally { setUploadingSlip(false); e.target.value = "" }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /></div>
  }
  if (err || !data) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 mb-4">{err || "ไม่พบข้อมูล"}</p>
        <button onClick={onBack} className="text-[#F15A24] font-bold">← กลับรายการสมัคร</button>
      </div>
    )
  }

  const st = STATUS[data.status] || { cls: "bg-gray-100 text-gray-500", label: data.status }
  const payment = data.payments?.[0]
  const participants = data.participants || []
  const advisors = data.advisors || []
  const isPaid = (data.courses?.price || 0) > 0
  // ประเภท 2 = ฟรี + ต้องแนบผลงาน / ประเภท 1 = ฟรี + ไม่แนบผลงาน
  const isType2 = !isPaid && (data.courses?.require_portfolio === true)
  const isType1 = !isPaid && (data.courses?.require_portfolio !== true)
  const isFreePortfolioLike = isType1 || isType2  // ฟรีทั้งคู่ ใช้ปุ่มไม่ผ่าน=กลับคิวสำรอง

  const isPaidWaitlist = isPaid && data.status === "waitlist"
  const canApprove = isType1
    ? data.status === "waitlist"
    : isPaid
    ? ["slip_uploaded", "submitted", "approved", "pending_payment"].includes(data.status)
    : ["slip_uploaded", "submitted", "approved", "held", "pending_payment", "waitlist"].includes(data.status)
  const canPromote = isPaidWaitlist
  const canReject = isType1
    ? data.status === "waitlist"
    : isType2
    ? ["submitted", "confirmed", "approved"].includes(data.status)
    : ["slip_uploaded", "submitted", "approved", "confirmed", "pending_payment"].includes(data.status)
  const canRelease = ["confirmed", "approved", "pending_payment", "slip_uploaded", "submitted", "waitlist", "held", "slip_rejected"].includes(data.status)
  const checkedIn = participants.filter((p) => (p.checkins?.length || 0) > 0).length

  // ชื่อรอบปัจจุบัน (ถ้ามี) — จาก courses.sessions match ด้วย session_id
  const curSession = (() => {
    if (!data.session_id) return null
    const ss = data.courses?.sessions || []
    return Array.isArray(ss) ? ss.find((s) => s.id === data.session_id) : null
  })()

  return (
    <>
    <div>
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F15A24] transition font-medium mb-5">
        ← รายการสมัคร
      </button>

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">ตรวจสอบการสมัคร</h1>
          <p className="text-xs text-gray-400 mt-0.5">{data.courses?.title}</p>
        </div>
        <span className={`self-start inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold border ${st.cls}`}>{st.label}{data.status === "waitlist" && data.waitlist_pos ? ` #${data.waitlist_pos}` : ""}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: ตรวจสลิป + ผลงาน */}
        <div className="space-y-5">
          {/* สลิปการชำระเงิน */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-bold text-gray-600">🧾 สลิปการชำระเงิน</span>
            </div>
            <div className="p-4">
              {!isPaid ? (
                <div className="h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-1.5">
                  <span className="text-3xl">🆓</span>
                  <span className="text-sm font-bold">คอร์สนี้ไม่ต้องชำระเงิน</span>
                </div>
              ) : payment?.slip_url ? (
                <a href={payment.slip_url} target="_blank" rel="noreferrer" className="block group">
                  <img src={payment.slip_url} alt="slip" className="w-full object-contain max-h-[420px] rounded-xl border border-gray-100 bg-gray-50 group-hover:opacity-90 transition" />
                  <p className="text-center text-xs text-[#F15A24] mt-2 font-bold">🔍 คลิกเพื่อเปิดเต็มจอ · ยอด ฿{payment.amount?.toLocaleString()}</p>
                </a>
              ) : (
                <div className="h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-1.5">
                  <span className="text-3xl">🧾</span><span className="text-sm">ผู้สมัครยังไม่แนบสลิป</span>
                </div>
              )}

              {/* อัปโหลดสลิปแทนผู้สมัคร — เฉพาะคอร์สเสียเงิน + สถานะที่ยังแนบได้ */}
              {isPaid && ["held", "pending_payment", "slip_rejected", "slip_uploaded"].includes(data.status) && (
                <label className={`mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 border-dashed cursor-pointer transition ${uploadingSlip ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-400"}`}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAdminUploadSlip} disabled={uploadingSlip} />
                  {uploadingSlip ? (
                    <><div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> กำลังอัปโหลด…</>
                  ) : (
                    <>📤 {payment?.slip_url ? "เปลี่ยนสลิป (อัปแทนผู้สมัคร)" : "อัปโหลดสลิปแทนผู้สมัคร"}</>
                  )}
                </label>
              )}
            </div>
          </div>
          {/* ลิงก์ผลงาน */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-bold text-gray-600">📎 ผลงานที่แนบ</span>
            </div>
            <div className="p-4">
              {!data.courses?.require_portfolio ? (
                <div className="h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-1.5">
                  <span className="text-3xl">📭</span>
                  <span className="text-sm font-bold">คอร์สนี้ไม่ต้องแนบผลงาน</span>
                </div>
              ) : data.portfolio_url ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 mb-1">{data.courses?.portfolio_label || "ลิงก์ผลงานที่แนบมา"}</p>
                  {data.portfolio_url.split(/[\n,]+/).map((link, i) => {
                    const url = link.trim()
                    if (!url) return null
                    const isLink = /^https?:\/\//i.test(url)
                    return (
                      <div key={i} className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center gap-2">
                        <span className="shrink-0 text-gray-400 text-xs font-bold">{i + 1}.</span>
                        {isLink ? (
                          <a href={url} target="_blank" rel="noreferrer" className="text-[#F15A24] font-bold text-sm break-all hover:underline flex-1">{url}</a>
                        ) : (
                          <span className="text-gray-700 text-sm break-all flex-1">{url}</span>
                        )}
                        {isLink && <a href={url} target="_blank" rel="noreferrer" className="shrink-0 bg-[#F15A24] text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-orange-600 transition">เปิด →</a>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-1.5">
                  <span className="text-3xl">📎</span>
                  <span className="text-sm">ผู้สมัครยังไม่แนบผลงาน</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Info + Actions */}
        <div className="flex flex-col gap-4">
          {/* Applicant info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100 px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-bold text-[#F15A24]">👤 ข้อมูลผู้สมัคร</span>
              {!["cancelled"].includes(data.status) && (
                <button onClick={() => setEditOpen(true)} className="text-xs font-bold text-gray-500 hover:text-[#F15A24] border border-gray-200 rounded-lg px-2.5 py-1 transition">✏️ แก้ไข</button>
              )}
            </div>
            <div className="p-4 space-y-0">
              {[
                ["วิชาที่สมัคร", data.courses?.title, true],
                ...(curSession ? [["รอบที่เลือก", `${curSession.label || "รอบ"}${curSession.time ? ` · ${curSession.time}` : ""}`, true]] : []),
                ["อีเมลผู้สมัคร", data.submitter_email, false],
                ["ยอดที่ต้องชำระ", isPaid ? `${(data.courses?.price || 0).toLocaleString()} บาท` : "ไม่มีค่าใช้จ่าย", false],
                ...(data.theme_name ? [["ชื่อทีม/ธีม", data.theme_name, true]] : []),
              ].map(([label, value, hl]) => (
                <div key={label} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0 gap-3">
                  <span className="text-xs font-bold text-gray-500 shrink-0">{label}:</span>
                  <span className={`text-right text-sm font-medium ${hl ? "font-bold text-[#F15A24]" : "text-gray-700"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-bold text-gray-600">👥 ผู้เข้าร่วม ({participants.length})</span>
              {(data.status === "confirmed" || data.status === "approved") && (
                <span className="text-xs text-green-600 font-bold">เช็คอิน {checkedIn}/{participants.length}</span>
              )}
            </div>
            <div className="p-4 space-y-2">
              {data.theme_name && (
                <div className="bg-purple-50 rounded-lg px-3 py-2 border border-purple-100">
                  <span className="text-xs text-purple-600 font-bold">🎯 ชื่อทีม/ธีม: </span>
                  <span className="text-sm text-gray-700 font-bold">{data.theme_name}</span>
                </div>
              )}
              {participants.map((p) => (
                <div key={p.id} className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-800">{(p.checkins?.length || 0) > 0 && <span className="text-green-600 font-bold">✓ </span>}{p.full_name}</span>
                    <span className="text-xs text-gray-400">{p.grade_level || ""}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{[p.school, p.phone].filter(Boolean).join(" · ")}</div>
                </div>
              ))}
              {advisors.length > 0 && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  <span className="text-xs text-blue-600 font-bold">🧑‍🏫 ครูที่ปรึกษา: </span>
                  <span className="text-sm text-gray-700">{advisors.map((a) => `${a.full_name}${a.phone ? ` (${a.phone})` : ""}`).join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Reject reason (if any) */}
          {data.reject_reason && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-red-600 mb-1.5">❌ เหตุผลที่ไม่อนุมัติ</p>
              <p className="text-sm text-red-700">{data.reject_reason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">การดำเนินการ</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={release} disabled={busy || !canRelease}
                className="flex flex-col items-center gap-1.5 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 disabled:opacity-40 transition text-xs">
                <span className="text-lg">🗑️</span> ยกเลิก / คืนที่นั่ง
              </button>
              <button onClick={() => isFreePortfolioLike ? rejectPortfolioAction() : setRejectModal(true)} disabled={busy || !canReject}
                className="flex flex-col items-center gap-1.5 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 disabled:opacity-40 transition text-xs border border-red-100">
                <span className="text-lg">❌</span> ไม่ผ่าน
              </button>
              {canPromote ? (
                <button onClick={promoteAction} disabled={busy}
                  className="flex flex-col items-center gap-1.5 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-40 shadow-sm transition text-xs">
                  <span className="text-lg">🎟️</span> ให้สิทธิ์
                </button>
              ) : (
                <button onClick={approve} disabled={busy || !canApprove}
                  className="flex flex-col items-center gap-1.5 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-40 disabled:bg-gray-400 shadow-sm transition text-xs">
                  <span className="text-lg">✅</span> อนุมัติ
                </button>
              )}
            </div>
            {busy && (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 py-2 mt-2">
                <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-[#F15A24] rounded-full animate-spin" /> กำลังดำเนินการ…
              </div>
            )}
            {/* ลบรายการสมัครถาวร */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button onClick={doDelete} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-red-600 rounded-xl font-bold hover:bg-red-50 disabled:opacity-40 transition text-xs border border-red-200">
                🗑 ลบรายการสมัครนี้ถาวร
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">ลบใบสมัคร + ผู้เข้าร่วม + สลิป ออกจากระบบถาวร (คืนที่นั่งให้)</p>
            </div>
          </div>

          {/* Meta */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ข้อมูลการสมัคร</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3"><span className="text-gray-400 font-bold uppercase">ID</span><span className="font-mono text-gray-600 truncate">{data.id}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400 font-bold uppercase">วันที่สมัคร</span><span className="font-mono text-gray-600">{data.created_at ? new Date(data.created_at).toLocaleString("th-TH") : "-"}</span></div>
              {payment?.created_at && <div className="flex justify-between gap-3"><span className="text-gray-400 font-bold uppercase">อัปโหลดสลิป</span><span className="font-mono text-gray-600">{new Date(payment.created_at).toLocaleString("th-TH")}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Modal กรอกเหตุผลตีกลับสลิป */}
    {rejectModal && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setRejectModal(false)}>
        <div className="bg-white w-full sm:rounded-2xl sm:max-w-md shadow-2xl overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="h-1.5 bg-red-500" />
          <div className="p-5 sm:p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-1">{isPaid ? "❌ ตีกลับสลิป" : "❌ ไม่อนุมัติผลงาน"}</h3>
            <p className="text-sm text-gray-500 mb-4">{isPaid ? "ระบุเหตุผล ผู้สมัครจะเห็นและส่งสลิปใหม่ได้" : "ระบุเหตุผล ผู้สมัครจะเห็นเหตุผลที่ไม่ผ่าน"}</p>
            <textarea rows="3" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder={isPaid ? "เช่น สลิปไม่ชัด / ยอดเงินไม่ตรง / ไม่พบรายการโอน" : "เช่น ผลงานไม่ตรงโจทย์ / ลิงก์เปิดไม่ได้ / ผิดเงื่อนไข"}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 text-sm resize-none" />
          </div>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-2 gap-3">
            <button onClick={() => setRejectModal(false)} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
            <button onClick={doReject} disabled={busy} className="py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-sm transition text-sm disabled:opacity-50">ตีกลับสลิป</button>
          </div>
        </div>
      </div>
    )}
    {editOpen && <EditRegistrationModal data={data} eventId={data.courses?.event_id} isPaid={isPaid}
      onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load() }} toast={toast} />}
    </>
  )
}

// แก้ไขใบสมัคร: ย้ายวิชา + เลือกรอบ (โชว์ที่นั่งคงเหลือ + ไฮไลต์ปัจจุบัน) / แก้จำนวนเงิน / ชื่อทีม
function EditRegistrationModal({ data, eventId, isPaid, onClose, onSaved, toast }) {
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState(data.course_id)
  const [sessionId, setSessionId] = useState(data.session_id || "")
  const [amount, setAmount] = useState((data.payments?.[0]?.amount ?? data.courses?.price ?? 0))
  const [themeName, setThemeName] = useState(data.theme_name || "")
  const [busy, setBusy] = useState(false)
  // ── แก้ข้อมูลผู้เข้าร่วม + ครูที่ปรึกษา (clone มาแก้ในฟอร์ม) ──
  const [members, setMembers] = useState(() => (data.participants || []).map((p) => ({
    id: p.id, full_name: p.full_name || "", school: p.school || "", grade_level: p.grade_level || "",
    phone: p.phone || "", email: p.email || "", national_id: p.national_id || "",
  })))
  const [advs, setAdvs] = useState(() => (data.advisors || []).map((a) => ({
    id: a.id, full_name: a.full_name || "", phone: a.phone || "", email: a.email || "",
  })))
  function setMember(i, k, v) { setMembers((prev) => prev.map((m, idx) => idx === i ? { ...m, [k]: v } : m)) }
  function setAdv(i, k, v) { setAdvs((prev) => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a)) }

  // จำนวนที่นั่งที่ใบนี้กิน = จำนวนสมาชิก (ทีม 3 คน = 3)
  const seatsNeeded = Math.max(1, (data.participants || []).length)

  useEffect(() => {
    fetchCoursesAdmin(eventId).then(setCourses).catch(() => {})
  }, [eventId])

  const selectedCourse = courses.find((c) => c.id === courseId)
  const courseSessions = Array.isArray(selectedCourse?.sessions) ? selectedCourse.sessions : []
  const hasSessions = courseSessions.length > 0
  const changedCourse = courseId !== data.course_id

  // ที่นั่งคงเหลือของคอร์ส (ระดับคอร์ส)
  function courseRemain(c) {
    if (c.seat_mode === "unlimited") return null // ไม่จำกัด
    const cap = c.capacity || 0
    const taken = c.seats_taken || 0
    return Math.max(0, cap - taken)
  }
  // ที่นั่งคงเหลือของรอบ
  function sessionRemain(s) {
    const cap = s.capacity || 0
    const taken = s.taken || 0
    return Math.max(0, cap - taken)
  }

  // เมื่อเปลี่ยนคอร์ส → รีเซ็ตรอบ (เว้นแต่ยังเป็นคอร์สเดิม ให้คงรอบเดิม)
  function onChangeCourse(newId) {
    setCourseId(newId)
    if (newId === data.course_id) setSessionId(data.session_id || "")
    else setSessionId("") // คอร์สใหม่ยังไม่เลือกรอบ
  }

  async function save() {
    // ถ้าคอร์สใหม่มีรอบ ต้องเลือกรอบก่อน
    if (hasSessions && !sessionId) return toast("กรุณาเลือกรอบก่อนบันทึก", "error")
    setBusy(true)
    try {
      const changedSession = sessionId !== (data.session_id || "")
      // ย้ายวิชา/รอบ (ถ้าเปลี่ยนอย่างใดอย่างหนึ่ง)
      if (changedCourse || changedSession) {
        await adminReassign(data.id, courseId, hasSessions ? sessionId : "")
      }
      // แก้จำนวนเงิน (เฉพาะเสียเงิน)
      if (isPaid && Number(amount) !== Number(data.payments?.[0]?.amount ?? data.courses?.price ?? 0)) {
        await adminUpdatePaymentAmount(data.id, Number(amount))
      }
      // แก้ชื่อทีม
      if (themeName.trim() !== (data.theme_name || "")) {
        await saveRegistrationTheme(data.id, themeName.trim())
      }
      // แก้ข้อมูลผู้เข้าร่วม (เฉพาะคนที่มีการเปลี่ยนแปลง)
      for (let i = 0; i < members.length; i++) {
        const m = members[i]
        const orig = data.participants?.[i]
        if (!m.id || !orig) continue
        const changed = m.full_name !== (orig.full_name || "") || m.school !== (orig.school || "")
          || m.grade_level !== (orig.grade_level || "") || m.phone !== (orig.phone || "")
          || m.email !== (orig.email || "") || m.national_id !== (orig.national_id || "")
        if (changed) await adminUpdateParticipant(m.id, m)
      }
      // แก้ข้อมูลครูที่ปรึกษา (เฉพาะที่เปลี่ยน)
      for (let i = 0; i < advs.length; i++) {
        const a = advs[i]
        const orig = data.advisors?.[i]
        if (!a.id || !orig) continue
        const changed = a.full_name !== (orig.full_name || "") || a.phone !== (orig.phone || "") || a.email !== (orig.email || "")
        if (changed) await adminUpdateAdvisor(a.id, a)
      }
      toast("บันทึกการแก้ไขแล้ว", "success")
      onSaved()
    } catch (e) {
      const msg = e.message?.includes("ALREADY_FINALIZED") ? "แก้ไม่ได้ — รายการถูกยกเลิกแล้ว" : "บันทึกไม่สำเร็จ: " + e.message
      toast(msg, "error"); setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl overflow-hidden rounded-t-2xl flex flex-col max-h-[92dvh]" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#F15A24] shrink-0" />
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          <h3 className="font-bold text-gray-800 text-lg">✏️ แก้ไขใบสมัคร</h3>

          {/* จำนวนที่นั่งที่ใบนี้กิน */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 text-xs text-gray-600">
            ใบสมัครนี้มีผู้เข้าร่วม <b className="text-[#F15A24]">{seatsNeeded} คน</b> — การย้ายจะใช้ที่นั่ง {seatsNeeded} ที่
          </div>

          {/* เลือกวิชา — โชว์ที่นั่งคงเหลือ + ติ๊กปัจจุบัน */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">วิชา</label>
            <select value={courseId} onChange={(e) => onChangeCourse(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#F15A24]">
              {courses.map((c) => {
                const remain = courseRemain(c)
                const isCurrent = c.id === data.course_id
                const remainTxt = remain === null ? "ไม่จำกัด" : `เหลือ ${remain} ที่`
                return (
                  <option key={c.id} value={c.id}>
                    {isCurrent ? "● " : ""}{c.title} — {remainTxt}{isCurrent ? " (ปัจจุบัน)" : ""}
                  </option>
                )
              })}
            </select>
            {selectedCourse && (() => {
              const remain = courseRemain(selectedCourse)
              if (remain === null) return <p className="text-[11px] text-emerald-600 mt-1">ที่นั่งไม่จำกัด</p>
              const notEnough = changedCourse && !hasSessions && remain < seatsNeeded
              return (
                <p className={`text-[11px] mt-1 ${notEnough ? "text-rose-500 font-bold" : "text-gray-400"}`}>
                  คงเหลือ {remain} ที่{notEnough ? ` — ไม่พอสำหรับ ${seatsNeeded} คน` : ""}
                </p>
              )
            })()}
          </div>

          {/* เลือกรอบ — เฉพาะวิชาที่มีรอบ */}
          {hasSessions && (
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1.5">รอบ (Workshop มีหลายรอบ)</label>
              <div className="space-y-2">
                {courseSessions.map((s) => {
                  const remain = sessionRemain(s)
                  const isCurrent = s.id === data.session_id && courseId === data.course_id
                  const selected = sessionId === s.id
                  const full = remain < seatsNeeded && !isCurrent
                  return (
                    <button key={s.id} type="button" disabled={full}
                      onClick={() => setSessionId(s.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                        selected ? "border-[#F15A24] bg-orange-50 ring-1 ring-[#F15A24]"
                        : full ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                        : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/40"}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-800">{s.label || "รอบ"}</span>
                          {isCurrent && <span className="text-[10px] font-bold text-[#F15A24] bg-orange-100 px-1.5 py-0.5 rounded">ปัจจุบัน</span>}
                        </div>
                        {s.time && <div className="text-[11px] text-gray-400">🕐 {s.time}</div>}
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${full ? "text-rose-500" : "text-emerald-600"}`}>
                        {full ? "เต็ม" : `เหลือ ${remain}`}
                      </span>
                    </button>
                  )
                })}
              </div>
              {changedCourse && <p className="text-[11px] text-amber-600 mt-1.5">⚠️ ย้ายมาวิชาใหม่ — เลือกรอบก่อนบันทึก</p>}
            </div>
          )}

          {isPaid && (
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1.5">จำนวนเงินที่ต้องชำระ (บาท)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#F15A24]" />
              <p className="text-[11px] text-gray-400 mt-1">ถ้าผู้สมัครแนบสลิปราคาเดิมไว้แล้ว ระบบคงสลิปไว้ — เปลี่ยนคอร์สราคาเท่ากันได้ หรือกดตีกลับเพื่อขอสลิปเพิ่ม</p>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">ชื่อทีม / ธีมผลงาน</label>
            <input value={themeName} onChange={(e) => setThemeName(e.target.value)} placeholder="เช่น Team Rocket / ชื่อผลงาน"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#F15A24]" />
          </div>

          {/* ── แก้ข้อมูลผู้เข้าร่วม ── */}
          {members.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-500 block mb-2">👥 ข้อมูลผู้เข้าร่วม</label>
              <div className="space-y-3">
                {members.map((m, i) => (
                  <div key={m.id || i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-[#F15A24] text-white rounded-md flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span className="text-[11px] font-bold text-gray-500">คนที่ {i + 1}</span>
                    </div>
                    <input value={m.full_name} onChange={(e) => setMember(i, "full_name", e.target.value)} placeholder="ชื่อ-สกุล"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={m.school} onChange={(e) => setMember(i, "school", e.target.value)} placeholder="โรงเรียน"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                      <input value={m.grade_level} onChange={(e) => setMember(i, "grade_level", e.target.value)} placeholder="ระดับชั้น"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                      <input value={m.phone} onChange={(e) => setMember(i, "phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="เบอร์โทร"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                      <input value={m.national_id} onChange={(e) => setMember(i, "national_id", e.target.value.replace(/[^0-9]/g, "").slice(0, 13))} placeholder="เลขบัตร ปชช."
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                    </div>
                    <input type="email" value={m.email} onChange={(e) => setMember(i, "email", e.target.value)} placeholder="อีเมล"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── แก้ข้อมูลครูที่ปรึกษา ── */}
          {advs.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-500 block mb-2">🧑‍🏫 ครูที่ปรึกษา</label>
              <div className="space-y-3">
                {advs.map((a, i) => (
                  <div key={a.id || i} className="bg-blue-50 rounded-xl p-3 border border-blue-100 space-y-2">
                    <input value={a.full_name} onChange={(e) => setAdv(i, "full_name", e.target.value)} placeholder="ชื่อครูที่ปรึกษา"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={a.phone} onChange={(e) => setAdv(i, "phone", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="เบอร์โทร"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                      <input type="email" value={a.email} onChange={(e) => setAdv(i, "email", e.target.value)} placeholder="อีเมล"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#F15A24]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 grid grid-cols-2 gap-3 shrink-0 border-t border-gray-50">
          <button onClick={onClose} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
          <button onClick={save} disabled={busy} className="py-3 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-orange-600 shadow-sm transition text-sm disabled:opacity-50">บันทึก</button>
        </div>
      </div>
    </div>
  )
}