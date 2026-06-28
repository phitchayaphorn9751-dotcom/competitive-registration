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

// ───── ไอคอน SVG inline (สไตล์ lucide) — โทนเดียวกับหน้าอื่น ─────
const Ico = {
  gear:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>),
  plus:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5v14"/></svg>),
  pencil:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>),
  trash:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>),
  calendar:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>),
  user:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>),
  phone:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>),
  megaphone:(p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>),
  tag:     (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>),
  save:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/></svg>),
}

const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"
const labelCls = "text-xs font-bold text-slate-500 block mb-1.5"

export default function AdminSettings() {
  const { confirm, toast } = useDialog()
  const { event } = useOutletContext()
  const eventsRef = useRef(null)
  const usersRef = useRef(null)
  const [form, setForm] = useState(null)
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
        hero_subtitle: es.hero_subtitle || "",
        home_notice: es.home_notice || "",
      })
      setTypes(await fetchCourseTypes(event?.id) || [])
    } catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
  }
  async function loadEventPart() {
    try {
      const es = await fetchEventSettings(event.id)
      setForm((f) => ({ ...(f || { line_id: "", phone: "" }), site_title: es.site_title || "", hero_subtitle: es.hero_subtitle || "", home_notice: es.home_notice || "" }))
      setTypes(await fetchCourseTypes(event.id) || [])
    } catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
  }

  async function save() {
    setSaving(true)
    try {
      // ค่ากลาง: Line/เบอร์
      await updateSettings({ line_id: form.line_id, phone: form.phone })
      // ค่าตามงาน: ชื่อเว็บ/ข้อความแจ้งเตือน
      if (event?.id) await updateEventSettings(event.id, { site_title: form.site_title, hero_subtitle: form.hero_subtitle, home_notice: form.home_notice })
      toast("✅ บันทึกข้อมูลสำเร็จ", "success")
    }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") } finally { setSaving(false) }
  }

  async function saveType(ct) {
    if (!ct.label?.trim()) return toast("กรอกชื่อประเภทก่อน", "error")
    if (!ct.code?.trim()) return toast("กรอกรหัส (code) ก่อน", "error")
    try { await saveCourseType(ct, event?.id); toast("✅ บันทึกประเภทวิชาแล้ว", "success"); setTypeModal(null); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
  }
  async function removeType(ct) {
    const ok = await confirm({ title: "ลบประเภทวิชา?", message: `ลบประเภท "${ct.label}"\n(ลบได้เฉพาะที่ยังไม่มีวิชาใช้อยู่)`, confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await deleteCourseType(ct.id); toast("ลบประเภทแล้ว", "success"); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { toast(e.message === "TYPE_IN_USE" ? "❌ ลบไม่ได้ — มีวิชาใช้ประเภทนี้อยู่" : "ลบไม่สำเร็จ: " + e.message, "error") }
  }

  if (!form) return <div className="py-16 text-center text-slate-400">กำลังโหลด…</div>
  const set = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div className="max-w-4xl">
      {/* Header — gradient + ไอคอนวงกลม (โทนเดียวกับหน้าอื่น) */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <Ico.gear className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">ตั้งค่าเว็บ</h1>
          <p className="text-slate-400 text-xs mt-0.5">ข้อมูลติดต่อ ข้อความหน้าแรก และประเภทวิชา</p>
        </div>
      </div>


      {/* ── Section: จัดการงานรายปี ── */}
      <SectionCard icon={Ico.calendar} title="จัดการงานรายปี" subtitle="สร้าง/แก้ไขงานแต่ละปี เปิด-ปิดรับสมัคร"
        action={<button onClick={() => eventsRef.current?.openAdd()}
          className="flex items-center gap-1 bg-gradient-to-r from-[#F15A24] to-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:from-[#d94e1e] hover:to-amber-600 transition active:scale-95"><Ico.plus className="w-3.5 h-3.5" /> เพิ่ม</button>}>
        <AdminEvents ref={eventsRef} embedded />
      </SectionCard>

      {/* ── Section: จัดการแอดมิน ── */}
      <SectionCard icon={Ico.user} title="จัดการแอดมิน" subtitle="ผู้ดูแลระบบ · ทุกคนมีสิทธิ์เท่ากัน"
        action={<button onClick={() => usersRef.current?.openAdd()}
          className="flex items-center gap-1 bg-gradient-to-r from-[#F15A24] to-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:from-[#d94e1e] hover:to-amber-600 transition active:scale-95"><Ico.plus className="w-3.5 h-3.5" /> เพิ่ม</button>}>
        <AdminUsers ref={usersRef} embedded />
      </SectionCard>

      {/* ── การ์ด 1: ข้อมูลติดต่อ (ค่ากลาง ใช้ร่วมทุกงาน) ── */}
      <SectionCard icon={Ico.phone} title="ข้อมูลติดต่อ" subtitle="แสดงบนแถบเมนูด้านบน (Navbar) · ใช้ร่วมทุกงาน">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Line ID" value={form.line_id} onChange={(v) => set("line_id", v)} placeholder="@camtcmu" />
          <Field label="เบอร์โทรศัพท์" value={form.phone} onChange={(v) => set("phone", v)} placeholder="063-525-0248" />
        </div>
      </SectionCard>

      {/* ── การ์ด 2: ชื่อเว็บ + ข้อความ (แยกตามงาน) ── */}
      <SectionCard icon={Ico.megaphone} title="ข้อมูลหน้าเว็บ (เฉพาะงานนี้)"
        subtitle={event ? `🗓️ ${event.name} ${event.year} — ชื่อเว็บ + ข้อความ แยกของแต่ละงาน` : "เลือกงานก่อน"}>
        <Field label="ชื่อเว็บ (แสดงบนโลโก้)" value={form.site_title} onChange={(v) => set("site_title", v)} placeholder="CAMT SUMMER COURSE" />
        <Field label="ข้อความใต้ชื่อ (Hero — แสดงใต้ชื่องานหน้าแรก)" value={form.hero_subtitle} onChange={(v) => set("hero_subtitle", v)} placeholder="เปิดโลกเทคโนโลยี สร้างสรรค์นวัตกรรมสู่อนาคต" />
        <div>
          <label className={labelCls}>ข้อความแจ้งเตือนหน้าแรก (แบนเนอร์ส้ม)</label>
          <textarea className={`${inputCls} resize-none leading-relaxed`} rows="4" value={form.home_notice}
            onChange={(e) => set("home_notice", e.target.value)}
            placeholder="เช่น แจ้งเรื่องการบันทึกภาพ และวิดีโอ: ตลอดกิจกรรมค่ายจะมีการบันทึกภาพนิ่งและวิดีโอ…" />
          <p className="text-[11px] text-slate-400 mt-1">💡 ขึ้นบรรทัดใหม่ได้ · เว้นว่าง = ไม่แสดงแบนเนอร์</p>
        </div>
      </SectionCard>

      {/* ── การ์ด 3: ประเภทวิชา ── */}
      <SectionCard icon={Ico.tag} title="ประเภทวิชา (หมวดหมู่)" subtitle="หมวดหมู่สำหรับจัดกลุ่มรายวิชา"
        action={<button onClick={() => setTypeModal({ code: "", label: "", requires_payment: false, requires_approval: false })}
          className="flex items-center gap-1 bg-gradient-to-r from-[#F15A24] to-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:from-[#d94e1e] hover:to-amber-600 transition active:scale-95"><Ico.plus className="w-3.5 h-3.5" /> เพิ่ม</button>}>
        <div className="space-y-2">
          {types.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีประเภทวิชา</p>}
          {types.map((ct) => (
            <div key={ct.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              <div className="min-w-0">
                <div className="font-bold text-slate-800 text-sm">{ct.label} <span className="text-[11px] text-slate-400 font-mono">({ct.code})</span></div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setTypeModal(ct)} className="bg-orange-50 text-[#F15A24] border border-orange-200 p-1.5 rounded-lg hover:bg-orange-100 transition"><Ico.pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeType(ct)} className="bg-rose-50 text-rose-600 border border-rose-200 p-1.5 rounded-lg hover:bg-rose-100 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── ปุ่มบันทึก (ท้ายสุด) ── */}
      <button onClick={save} disabled={saving} className="w-full py-3.5 bg-gradient-to-r from-[#F15A24] to-amber-500 text-white rounded-xl font-bold hover:from-[#d94e1e] hover:to-amber-600 transition disabled:opacity-50 text-sm shadow-md shadow-orange-500/25 active:scale-[0.99] flex items-center justify-center gap-2">
        {saving ? "กำลังบันทึก…" : <><Ico.save className="w-4 h-4" /> บันทึกการตั้งค่า</>}
      </button>

      {typeModal && <TypeModal ct={typeModal} onSave={saveType} onClose={() => setTypeModal(null)} />}

      {/* Footer */}
      <footer className="mt-10 pt-6 pb-24 lg:pb-6 border-t border-slate-200 text-center text-xs text-slate-400">
        <p>© 2026 College of Arts, Media and Technology (CAMT) | College Administration Portal</p>
        <p className="mt-1">ระบบจัดการการแข่งขันและกิจกรรมโครงการดิจิทัล</p>
      </footer>
    </div>
  )
}

function SectionCard({ icon: Icon, title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-[#fff7f3] to-white">
        <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#F15A24] flex items-center justify-center shrink-0">{Icon && <Icon className="w-4 h-4" />}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
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
            {isEdit && <p className="text-[11px] text-slate-400 mt-1">แก้ code ไม่ได้หลังสร้าง (กันกระทบข้อมูลเดิม)</p>}
          </div>
          <p className="text-[11px] text-slate-400 px-1">💡 ราคา/ค่าสมัครกำหนดตอนสร้างวิชาแต่ละวิชา (ไม่ผูกกับประเภท)</p>
        </div>
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">ยกเลิก</button>
          <button onClick={() => onSave(f)} className={`py-3 text-white rounded-xl font-bold shadow-sm transition text-sm ${isEdit ? "bg-yellow-500 hover:bg-yellow-600" : "bg-[#F15A24] hover:bg-orange-600"}`}>
            {isEdit ? "💾 บันทึก" : "✅ เพิ่มประเภท"}
          </button>
        </div>
      </div>
    </div>
  )
}