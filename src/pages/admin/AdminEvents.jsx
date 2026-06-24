import { useEffect, useState, forwardRef, useImperativeHandle } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchAllEvents, saveEvent, setEventStatus, deleteEvent } from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

const STATUS_INFO = {
  open:   { label: "🟢 เปิดรับสมัคร", cls: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  draft:  { label: "📝 ร่าง (เตรียมไว้)", cls: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
  closed: { label: "🔒 ปิด/จบแล้ว", cls: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-400" },
}

const AdminEvents = forwardRef(function AdminEvents({ embedded = false }, ref) {
  const ctx = useOutletContext()
  const { toast, confirm } = useDialog()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // {id?, name, year, status}

  // เปิด modal สร้างงานจากภายนอก (ปุ่ม + บน header section)
  useImperativeHandle(ref, () => ({
    openAdd: () => setModal({ name: "CAMT Summer Course", year: new Date().getFullYear() + 543, status: "draft" }),
  }))

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try { setEvents(await fetchAllEvents() || []) }
    catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }

  async function doSave(ev) {
    if (!ev.name?.trim()) return toast("กรอกชื่องานก่อน", "error")
    if (!ev.year) return toast("กรอกปีก่อน", "error")
    try {
      await saveEvent(ev)
      toast(ev.id ? "แก้ไขงานแล้ว" : "สร้างงานใหม่แล้ว", "success")
      setModal(null); load()
      ctx?.reloadEvents?.()   // อัปเดต dropdown งานบน header ทันที
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
  }

  async function changeStatus(ev, status) {
    if (status === "open") {
      const ok = await confirm({
        title: "เปิดรับสมัครงานนี้?",
        message: `ตั้ง "${ev.name} ${ev.year}" เป็นงานที่เปิดรับสมัคร\n(งานอื่นที่เปิดอยู่จะถูกปิดอัตโนมัติ — เปิดได้ทีละงาน)`,
        confirmText: "เปิดรับสมัคร", tone: "success",
      })
      if (!ok) return
    }
    try {
      await setEventStatus(ev.id, status); toast("เปลี่ยนสถานะแล้ว", "success"); load()
      ctx?.reloadEvents?.()
    }
    catch (e) { toast("เปลี่ยนสถานะไม่สำเร็จ: " + e.message, "error") }
  }

  async function doDelete(ev) {
    const ok = await confirm({
      title: "ลบงานนี้?",
      message: `ลบงาน "${ev.name} ${ev.year}"\n(ลบได้เฉพาะงานที่ยังไม่มีรายวิชา)`,
      confirmText: "ลบ", tone: "danger",
    })
    if (!ok) return
    try {
      await deleteEvent(ev.id); toast("ลบงานแล้ว", "success"); load()
      ctx?.reloadEvents?.()
    }
    catch (e) {
      toast(e.message === "EVENT_HAS_COURSES" ? "ลบไม่ได้ — งานนี้มีรายวิชาแล้ว (เก็บเป็นประวัติ)" : "ลบไม่สำเร็จ: " + e.message, "error")
    }
  }

  const openEvent = events.find((e) => e.status === "open")

  return (
    <div>
      {!embedded && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3 leading-tight">จัดการงานรายปี</h1>
            <p className="text-sm text-gray-400 pl-3 mt-0.5">สร้างและจัดการงานแต่ละปี · {events.length} งาน</p>
          </div>
          <button onClick={() => setModal({ name: "CAMT Summer Course", year: new Date().getFullYear() + 543, status: "draft" })}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-sm transition text-sm">
            ➕ สร้างงานปีใหม่
          </button>
        </div>
      )}

      {/* งานที่เปิดอยู่ตอนนี้ — แสดงเฉพาะหน้าเต็ม (ไม่ embed) */}
      {!embedded && (
        <div className="bg-gradient-to-r from-[#fff5f0] to-white border border-orange-100 rounded-2xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">📣</span>
          <div className="text-sm">
            <span className="text-gray-500">งานที่เปิดรับสมัครตอนนี้: </span>
            {openEvent
              ? <span className="font-bold text-[#F15A24]">{openEvent.name} {openEvent.year}</span>
              : <span className="font-bold text-gray-400">ยังไม่มีงานเปิดรับ — ตั้งสถานะงานเป็น "เปิดรับสมัคร"</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">กำลังโหลด…</div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm border border-gray-200">ยังไม่มีงาน — กด "สร้างงานปีใหม่"</div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const info = STATUS_INFO[ev.status] || STATUS_INFO.draft
            return (
              <div key={ev.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${info.dot}`} />
                    <div className="min-w-0">
                      <div className="font-bold text-gray-800 text-base truncate">{ev.name} <span className="text-[#F15A24]">{ev.year}</span></div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${info.cls}`}>{info.label}</span>
                        {ev.created_at && <span className="text-[11px] text-gray-400">สร้าง {new Date(ev.created_at).toLocaleDateString("th-TH")}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {ev.status !== "open" && (
                      <button onClick={() => changeStatus(ev, "open")} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-100 transition">เปิดรับสมัคร</button>
                    )}
                    {ev.status === "open" && (
                      <button onClick={() => changeStatus(ev, "closed")} className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-100 transition">ปิดรับสมัคร</button>
                    )}
                    {ev.status === "closed" && (
                      <button onClick={() => changeStatus(ev, "draft")} className="bg-gray-50 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100 transition">กลับเป็นร่าง</button>
                    )}
                    <button onClick={() => setModal(ev)} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-100 transition">✏️ แก้ไข</button>
                    <button onClick={() => doDelete(ev)} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition">🗑️</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && <EventModal ev={modal} onSave={doSave} onClose={() => setModal(null)} />}
    </div>
  )
})

export default AdminEvents

function EventModal({ ev, onSave, onClose }) {
  const [f, setF] = useState({ ...ev })
  const set = (k, v) => setF({ ...f, [k]: v })
  const isEdit = !!ev.id
  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm"
  const labelCls = "text-xs font-bold text-gray-500 block mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-md shadow-2xl overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`${isEdit ? "bg-yellow-500" : "bg-[#F15A24]"} px-5 py-4 flex justify-between items-center`}>
          <h3 className="font-bold text-white text-base">{isEdit ? "✏️ แก้ไขงาน" : "➕ สร้างงานปีใหม่"}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>ชื่องาน</label>
            <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="CAMT Summer Course" />
          </div>
          <div>
            <label className={labelCls}>ปี (พ.ศ.)</label>
            <input type="number" className={inputCls} value={f.year} onChange={(e) => set("year", parseInt(e.target.value) || "")} placeholder="2568" />
          </div>
          <div>
            <label className={labelCls}>สถานะ</label>
            <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="draft">📝 ร่าง (เตรียมไว้ ยังไม่เปิด)</option>
              <option value="open">🟢 เปิดรับสมัคร</option>
              <option value="closed">🔒 ปิด/จบแล้ว</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">💡 ตั้ง "เปิดรับสมัคร" ได้ทีละงาน — งานอื่นที่เปิดอยู่จะถูกปิดให้</p>
          </div>
        </div>
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
          <button onClick={() => onSave(f)} className={`py-3 text-white rounded-xl font-bold shadow-sm transition text-sm ${isEdit ? "bg-yellow-500 hover:bg-yellow-600" : "bg-[#F15A24] hover:bg-orange-600"}`}>
            {isEdit ? "💾 บันทึก" : "✅ สร้างงาน"}
          </button>
        </div>
      </div>
    </div>
  )
}