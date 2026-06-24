import { useEffect, useState, useRef } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchSettings, updateSettings,
  fetchEventSettings, updateEventSettings,
  fetchCourseTypes, saveCourseType, deleteCourseType,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import AdminEvents from "./AdminEvents.jsx"
import AdminUsers from "./AdminUsers.jsx"

const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"
const labelCls = "text-xs font-bold text-gray-500 block mb-1.5"

export default function AdminSettings() {
  const { confirm } = useDialog()
  const { event } = useOutletContext()
  const eventsRef = useRef(null)
  const usersRef = useRef(null)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [types, setTypes] = useState([])
  const [typeModal, setTypeModal] = useState(null)

  // โหลดค่ากลาง (Line/เบอร์) + ประเภทวิชา ครั้งเดียว
  useEffect(() => { loadAll() }, [])
  // โหลดค่าตามงาน (ชื่อเว็บ/ข้อความ) เมื่อเปลี่ยนงาน
  useEffect(() => { if (event?.id) loadEventPart() }, [event?.id])

  async function loadAll() {
    try {
      const s = await fetchSettings()
      const es = event?.id ? await fetchEventSettings(event.id) : {}
      setForm({
        line_id: s.line_id || "", phone: s.phone || "",
        site_title: es.site_title || "",
        home_notice: es.home_notice || "",
      })
      setTypes(await fetchCourseTypes(event?.id) || [])
    } catch (e) { setMsg("โหลดไม่สำเร็จ: " + e.message) }
  }
  async function loadEventPart() {
    try {
      const es = await fetchEventSettings(event.id)
      setForm((f) => ({ ...(f || { line_id: "", phone: "" }), site_title: es.site_title || "", home_notice: es.home_notice || "" }))
      setTypes(await fetchCourseTypes(event.id) || [])
    } catch (e) { setMsg("โหลดไม่สำเร็จ: " + e.message) }
  }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      // ค่ากลาง: Line/เบอร์
      await updateSettings({ line_id: form.line_id, phone: form.phone })
      // ค่าตามงาน: ชื่อเว็บ/ข้อความแจ้งเตือน
      if (event?.id) await updateEventSettings(event.id, { site_title: form.site_title, home_notice: form.home_notice })
      setMsg("✅ บันทึกเรียบร้อย — ข้อมูลจะแสดงบนหน้าเว็บทันที")
    }
    catch (e) { setMsg("บันทึกไม่สำเร็จ: " + e.message) } finally { setSaving(false) }
  }

  async function saveType(ct) {
    if (!ct.label?.trim()) return setMsg("กรอกชื่อประเภทก่อน")
    if (!ct.code?.trim()) return setMsg("กรอกรหัส (code) ก่อน")
    try { await saveCourseType(ct, event?.id); setMsg("✅ บันทึกประเภทวิชาแล้ว"); setTypeModal(null); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { setMsg("บันทึกไม่สำเร็จ: " + e.message) }
  }
  async function removeType(ct) {
    const ok = await confirm({ title: "ลบประเภทวิชา?", message: `ลบประเภท "${ct.label}"\n(ลบได้เฉพาะที่ยังไม่มีวิชาใช้อยู่)`, confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await deleteCourseType(ct.id); setMsg("ลบประเภทแล้ว"); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { setMsg(e.message === "TYPE_IN_USE" ? "❌ ลบไม่ได้ — มีวิชาใช้ประเภทนี้อยู่" : "ลบไม่สำเร็จ: " + e.message) }
  }

  if (!form) return <div className="py-16 text-center text-gray-400">กำลังโหลด…</div>
  const set = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3">ตั้งค่าเว็บ</h1>
        <p className="text-sm text-gray-400 pl-3 mt-0.5">ข้อมูลติดต่อ ข้อความหน้าแรก และประเภทวิชา</p>
      </div>

      {msg && <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-2.5 text-sm flex justify-between items-center"><span>{msg}</span><button onClick={() => setMsg(null)} className="text-orange-400">✕</button></div>}

      {/* ── Section: จัดการงานรายปี ── */}
      <SectionCard icon="📅" title="จัดการงานรายปี" subtitle="สร้าง/แก้ไขงานแต่ละปี เปิด-ปิดรับสมัคร"
        action={<button onClick={() => eventsRef.current?.openAdd()}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">➕ เพิ่ม</button>}>
        <AdminEvents ref={eventsRef} embedded />
      </SectionCard>

      {/* ── Section: จัดการแอดมิน ── */}
      <SectionCard icon="👤" title="จัดการแอดมิน" subtitle="ผู้ดูแลระบบ · ทุกคนมีสิทธิ์เท่ากัน"
        action={<button onClick={() => usersRef.current?.openAdd()}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">➕ เพิ่ม</button>}>
        <AdminUsers ref={usersRef} embedded />
      </SectionCard>

      {/* ── การ์ด 1: ข้อมูลติดต่อ (ค่ากลาง ใช้ร่วมทุกงาน) ── */}
      <SectionCard icon="📞" title="ข้อมูลติดต่อ" subtitle="แสดงบนแถบเมนูด้านบน (Navbar) · ใช้ร่วมทุกงาน">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Line ID" value={form.line_id} onChange={(v) => set("line_id", v)} placeholder="@camtcmu" />
          <Field label="เบอร์โทรศัพท์" value={form.phone} onChange={(v) => set("phone", v)} placeholder="063-525-0248" />
        </div>
      </SectionCard>

      {/* ── การ์ด 2: ชื่อเว็บ + ข้อความ (แยกตามงาน) ── */}
      <SectionCard icon="📢" title="ข้อมูลหน้าเว็บ (เฉพาะงานนี้)"
        subtitle={event ? `🗓️ ${event.name} ${event.year} — ชื่อเว็บ + ข้อความ แยกของแต่ละงาน` : "เลือกงานก่อน"}>
        <Field label="ชื่อเว็บ (แสดงบนโลโก้)" value={form.site_title} onChange={(v) => set("site_title", v)} placeholder="CAMT SUMMER COURSE" />
        <div>
          <label className={labelCls}>ข้อความแจ้งเตือนหน้าแรก (แบนเนอร์ส้ม)</label>
          <textarea className={`${inputCls} resize-none leading-relaxed`} rows="4" value={form.home_notice}
            onChange={(e) => set("home_notice", e.target.value)}
            placeholder="เช่น แจ้งเรื่องการบันทึกภาพ และวิดีโอ: ตลอดกิจกรรมค่ายจะมีการบันทึกภาพนิ่งและวิดีโอ…" />
          <p className="text-[11px] text-gray-400 mt-1">💡 ขึ้นบรรทัดใหม่ได้ · เว้นว่าง = ไม่แสดงแบนเนอร์</p>
        </div>
      </SectionCard>

      {/* ── การ์ด 3: ประเภทวิชา ── */}
      <SectionCard icon="🏷️" title="ประเภทวิชา (หมวดหมู่)" subtitle="หมวดหมู่สำหรับจัดกลุ่มรายวิชา"
        action={<button onClick={() => setTypeModal({ code: "", label: "", requires_payment: false, requires_approval: false })}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">➕ เพิ่ม</button>}>
        <div className="space-y-2">
          {types.length === 0 && <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีประเภทวิชา</p>}
          {types.map((ct) => (
            <div key={ct.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <div className="min-w-0">
                <div className="font-bold text-gray-800 text-sm">{ct.label} <span className="text-[11px] text-gray-400 font-mono">({ct.code})</span></div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setTypeModal(ct)} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-100 transition">✏️</button>
                <button onClick={() => removeType(ct)} className="bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── ปุ่มบันทึก (ท้ายสุด) ── */}
      <button onClick={save} disabled={saving} className="w-full py-3.5 mb-6 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm shadow-sm">
        {saving ? "กำลังบันทึก…" : "💾 บันทึกการตั้งค่า"}
      </button>

      {typeModal && <TypeModal ct={typeModal} onSave={saveType} onClose={() => setTypeModal(null)} />}
    </div>
  )
}

function SectionCard({ icon, title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-[#fff7f3] to-white">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function TypeModal({ ct, onSave, onClose }) {
  const [f, setF] = useState({ ...ct })
  const set = (k, v) => setF({ ...f, [k]: v })
  const isEdit = !!ct.id

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-md shadow-2xl overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`${isEdit ? "bg-yellow-500" : "bg-[#F15A24]"} px-5 py-4 flex justify-between items-center`}>
          <h3 className="font-bold text-white text-base">{isEdit ? "✏️ แก้ไขประเภทวิชา" : "➕ เพิ่มประเภทวิชา"}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>ชื่อประเภท (แสดงให้ผู้ใช้เห็น)</label>
            <input className={inputCls} value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="เช่น Workshop, การแข่งขัน" />
          </div>
          <div>
            <label className={labelCls}>รหัส code (อังกฤษ ไม่เว้นวรรค)</label>
            <input className={inputCls} value={f.code} onChange={(e) => set("code", e.target.value.toLowerCase().replace(/\s/g, "_"))} placeholder="workshop" disabled={isEdit} />
            {isEdit && <p className="text-[11px] text-gray-400 mt-1">แก้ code ไม่ได้หลังสร้าง (กันกระทบข้อมูลเดิม)</p>}
          </div>
          <p className="text-[11px] text-gray-400 px-1">💡 ราคา/ค่าสมัครกำหนดตอนสร้างวิชาแต่ละวิชา (ไม่ผูกกับประเภท)</p>
        </div>
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
          <button onClick={() => onSave(f)} className={`py-3 text-white rounded-xl font-bold shadow-sm transition text-sm ${isEdit ? "bg-yellow-500 hover:bg-yellow-600" : "bg-[#F15A24] hover:bg-orange-600"}`}>
            {isEdit ? "💾 บันทึก" : "✅ เพิ่มประเภท"}
          </button>
        </div>
      </div>
    </div>
  )
}