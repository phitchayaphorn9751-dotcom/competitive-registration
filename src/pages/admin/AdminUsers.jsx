import { useEffect, useState, forwardRef, useImperativeHandle } from "react"
import { listAdmins, addAdmin, removeAdmin } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

const AdminUsers = forwardRef(function AdminUsers({ embedded = false }, ref) {
  const { confirm, toast } = useDialog()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [adding, setAdding] = useState(false)

  // เปิด modal เพิ่มแอดมินจากภายนอก (ปุ่ม + บน header section)
  useImperativeHandle(ref, () => ({ openAdd: () => { setNewEmail(""); setModal(true) } }))

  useEffect(() => { load() }, [])
  async function load() {
    try { setLoading(true); setAdmins(await listAdmins() || []) }
    catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") } finally { setLoading(false) }
  }
  async function doAdd() {
    if (!newEmail.trim()) return toast("กรอกอีเมลก่อน", "error")
    setAdding(true)
    // ทุกคนสิทธิ์เท่ากัน → ส่ง "super" เพื่อให้แอดมินทุกคนจัดการแอดมินได้
    try { await addAdmin(newEmail.trim(), "super"); toast("✅ เพิ่มแอดมินแล้ว", "success"); setNewEmail(""); setModal(false); load() }
    catch (e) {
      const m = e.message?.includes("USER_NOT_FOUND_IN_AUTH") ? "ไม่พบผู้ใช้นี้ — ต้องสมัครบัญชี/เข้าสู่ระบบด้วย Google ก่อน"
        : e.message?.includes("NOT_SUPER_ADMIN") ? "ไม่มีสิทธิ์เพิ่มแอดมิน" : e.message
      toast(m, "error")
    } finally { setAdding(false) }
  }
  async function doRemove(id) {
    const ok = await confirm({ title: "ลบสิทธิ์แอดมิน?", message: "ลบสิทธิ์แอดมินคนนี้ออกจากระบบ", confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await removeAdmin(id); toast("ลบแล้ว", "success"); load() }
    catch (e) { toast(e.message?.includes("CANNOT_REMOVE_LAST_SUPER") ? "ลบแอดมินคนสุดท้ายไม่ได้" : e.message, "error") }
  }

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm"

  return (
    <div>
      {!embedded && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3">จัดการแอดมิน</h1>
            <p className="text-sm text-gray-400 pl-3 mt-0.5">ผู้ดูแลระบบ · ทุกคนมีสิทธิ์เท่ากัน</p>
          </div>
          <button onClick={() => { setNewEmail(""); setModal(true) }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-sm transition text-sm">➕ เพิ่มแอดมิน</button>
        </div>
      )}

      {loading ? <div className="py-16 text-center text-gray-400">กำลังโหลด…</div> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100">
              <th className="px-5 py-3 text-xs font-bold text-[#F15A24] uppercase">อีเมล</th>
              <th className="px-5 py-3 text-xs font-bold text-[#F15A24] uppercase text-center">เพิ่มเมื่อ</th>
              <th className="px-5 py-3 text-xs font-bold text-[#F15A24] uppercase text-center">จัดการ</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{a.email}</td>
                  <td className="px-5 py-3.5 text-center text-xs text-gray-400">{a.created_at ? new Date(a.created_at).toLocaleDateString("th-TH") : "—"}</td>
                  <td className="px-5 py-3.5 text-center"><button onClick={() => doRemove(a.id)} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100">ลบสิทธิ์</button></td>
                </tr>
              ))}
              {admins.length === 0 && <tr><td colSpan="3" className="py-12 text-center text-gray-400 text-sm">ยังไม่มีแอดมิน</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal เพิ่มแอดมิน */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setModal(false)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-md shadow-2xl overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#F15A24] px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">เพิ่มแอดมิน</h3>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">อีเมล Google ของแอดมิน</label>
                <input className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="staff@gmail.com" autoFocus
                  onKeyDown={(e) => e.key === "Enter" && doAdd()} />
                <p className="text-[11px] text-gray-400 mt-1.5">💡 ผู้ใช้ต้องเคยเข้าสู่ระบบด้วย Google ในเว็บนี้ก่อน</p>
              </div>
            </div>
            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              <button onClick={() => setModal(false)} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
              <button onClick={doAdd} disabled={adding} className="py-3 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-50">{adding ? "กำลังเพิ่ม…" : "เพิ่มแอดมิน"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default AdminUsers