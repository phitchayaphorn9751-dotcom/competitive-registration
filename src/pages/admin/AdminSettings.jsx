import { useEffect, useState, useRef } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchSettings, updateSettings,
  fetchEventSettings, updateEventSettings,
  fetchCourseTypes, saveCourseType, deleteCourseType,
  uploadCourseAsset,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"
import { CATEGORY_COLORS, catColor } from "../../lib/categoryColors.js"
import AdminEvents from "./AdminEvents.jsx"
import AdminUsers from "./AdminUsers.jsx"

const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"
const labelCls = "text-xs font-bold text-slate-500 block mb-1.5"

// ค่าเริ่มต้นรายการรางวัลเกียรติบัตร
const DEFAULT_AWARDS = ["รางวัลชนะเลิศ", "รางวัลรองชนะเลิศอันดับ 1", "รางวัลรองชนะเลิศอันดับ 2", "รางวัลชมเชย", "เข้าร่วมกิจกรรม"]

export default function AdminSettings() {
  const { confirm, toast } = useDialog()
  const { event } = useOutletContext()
  const eventsRef = useRef(null)
  const usersRef = useRef(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [types, setTypes] = useState([])
  const [typeModal, setTypeModal] = useState(null)
  const [uploadingSchedule, setUploadingSchedule] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

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
        schedule_image_url: es.schedule_image_url || "",
        banner_image: es.banner_image || "",
        cert_template_url: es.cert_template_url || "",
        cert_awards: (Array.isArray(es.cert_awards) && es.cert_awards.length) ? es.cert_awards : DEFAULT_AWARDS,
      })
      setTypes(await fetchCourseTypes(event?.id) || [])
    } catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
  }
  async function loadEventPart() {
    try {
      const es = await fetchEventSettings(event.id)
      setForm((f) => ({ ...(f || { line_id: "", phone: "" }), site_title: es.site_title || "", hero_subtitle: es.hero_subtitle || "", home_notice: es.home_notice || "", schedule_image_url: es.schedule_image_url || "", banner_image: es.banner_image || "", cert_template_url: es.cert_template_url || "", cert_awards: (Array.isArray(es.cert_awards) && es.cert_awards.length) ? es.cert_awards : DEFAULT_AWARDS }))
      setTypes(await fetchCourseTypes(event.id) || [])
    } catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
  }

  async function save() {
    setSaving(true)
    try {
      // ค่ากลาง: Line/เบอร์
      await updateSettings({ line_id: form.line_id, phone: form.phone })
      // ค่าตามงาน: ชื่อเว็บ/ข้อความแจ้งเตือน
      if (event?.id) await updateEventSettings(event.id, { site_title: form.site_title, hero_subtitle: form.hero_subtitle, home_notice: form.home_notice, schedule_image_url: form.schedule_image_url || "", banner_image: form.banner_image || "", cert_template_url: form.cert_template_url || "", cert_awards: form.cert_awards || [] })
      toast("บันทึกข้อมูลสำเร็จ", "success")
    }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") } finally { setSaving(false) }
  }

  async function saveType(ct) {
    if (!ct.label?.trim()) return toast("กรอกชื่อประเภทก่อน", "error")
    if (!ct.code?.trim()) return toast("กรอกรหัส (code) ก่อน", "error")
    if (!ct.color) return toast("กรุณาเลือกสีประจำหมวด", "error")
    try { await saveCourseType(ct, event?.id); toast("บันทึกประเภทวิชาแล้ว", "success"); setTypeModal(null); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
  }
  async function removeType(ct) {
    const ok = await confirm({ title: "ลบประเภทวิชา?", message: `ลบประเภท "${ct.label}"\n(ลบได้เฉพาะที่ยังไม่มีวิชาใช้อยู่)`, confirmText: "ลบ", tone: "danger" })
    if (!ok) return
    try { await deleteCourseType(ct.id); toast("ลบประเภทแล้ว", "success"); setTypes(await fetchCourseTypes(event?.id)) }
    catch (e) { toast(e.message === "TYPE_IN_USE" ? "ลบไม่ได้ — มีวิชาใช้ประเภทนี้อยู่" : "ลบไม่สำเร็จ: " + e.message, "error") }
  }

  async function handleScheduleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSchedule(true)
    try {
      const url = await uploadCourseAsset(file, "schedule")
      setForm((f) => ({ ...f, schedule_image_url: url }))
      toast("อัปโหลดรูปตารางแล้ว กดบันทึกเพื่อใช้งาน", "success")
    } catch (err) { toast("อัปโหลดไม่สำเร็จ: " + err.message, "error") }
    finally { setUploadingSchedule(false); e.target.value = "" }
  }
  function removeSchedule() {
    setForm((f) => ({ ...f, schedule_image_url: "" }))
  }

  // ── Banner (รูปเดี่ยว) — อัปโหลด / ลบ (แบบเดียวกับรูปตาราง) ──
  async function handleBannerUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    try {
      const url = await uploadCourseAsset(file, "banner")
      setForm((f) => ({ ...f, banner_image: url }))
      toast("อัปโหลดรูปแบนเนอร์แล้ว กดบันทึกเพื่อใช้งาน", "success")
    } catch (err) { toast("อัปโหลดไม่สำเร็จ: " + err.message, "error") }
    finally { setUploadingBanner(false); e.target.value = "" }
  }
  function removeBanner() {
    setForm((f) => ({ ...f, banner_image: "" }))
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
        action={<AddBtn onClick={() => eventsRef.current?.openAdd()} />}>
        <AdminEvents ref={eventsRef} embedded />
      </SectionCard>

      {/* ── Section: จัดการแอดมิน ── */}
      <SectionCard icon={Ico.user} title="จัดการแอดมิน" subtitle="ผู้ดูแลระบบ · ทุกคนมีสิทธิ์เท่ากัน"
        action={<AddBtn onClick={() => usersRef.current?.openAdd()} />}>
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
        subtitle={event ? `${event.name} ${event.year} — ชื่อเว็บ + ข้อความ แยกของแต่ละงาน` : "เลือกงานก่อน"}>
        <Field label="ชื่อเว็บ (แสดงบนโลโก้)" value={form.site_title} onChange={(v) => set("site_title", v)} placeholder="CAMT SUMMER COURSE" />
        <Field label="ข้อความใต้ชื่อ (Hero — แสดงใต้ชื่องานหน้าแรก)" value={form.hero_subtitle} onChange={(v) => set("hero_subtitle", v)} placeholder="เปิดโลกเทคโนโลยี สร้างสรรค์นวัตกรรมสู่อนาคต" />
        <div>
          <label className={labelCls}>ข้อความแจ้งเตือนหน้าแรก (แบนเนอร์ส้ม)</label>
          <textarea className={`${inputCls} resize-none leading-relaxed`} rows="4" value={form.home_notice}
            onChange={(e) => set("home_notice", e.target.value)}
            placeholder="เช่น แจ้งเรื่องการบันทึกภาพ และวิดีโอ: ตลอดกิจกรรมค่ายจะมีการบันทึกภาพนิ่งและวิดีโอ…" />
          <p className="text-[11px] text-slate-400 mt-1">ขึ้นบรรทัดใหม่ได้ · เว้นว่าง = ไม่แสดงแบนเนอร์</p>
        </div>
      </SectionCard>

      {/* ── การ์ด: Banner หน้าแรก (รูปเดียว) เฉพาะงานนี้ ── */}
      <SectionCard icon={Ico.image} title="ภาพแบนเนอร์หน้าแรก"
        subtitle={event ? `${event.name} ${event.year} — แสดงเต็มความกว้างบนสุดของหน้าแรก กดดูรูปเต็มได้` : "เลือกงานก่อน"}>
        <div className="space-y-3">
          <label className={labelCls}>อัปโหลดรูปแบนเนอร์ (แทนพื้นส้มหัวเว็บ)</label>
          {form.banner_image ? (
            <div className="relative inline-block">
              <img src={form.banner_image} alt="แบนเนอร์" className="max-h-64 w-auto rounded-xl border border-slate-200 shadow-sm" />
              <button onClick={removeBanner} type="button"
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition">
                <Ico.trash className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-[#F15A24] hover:bg-orange-50/40 transition ${uploadingBanner ? "opacity-60 pointer-events-none" : ""}`}>
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#F15A24] flex items-center justify-center"><Ico.image className="w-6 h-6" /></div>
              <span className="text-sm font-bold text-slate-600">{uploadingBanner ? "กำลังอัปโหลด…" : "คลิกเพื่อเลือกรูปแบนเนอร์"}</span>
              <span className="text-[11px] text-slate-400">JPG / PNG · แนะนำสัดส่วนกว้าง (เช่น 16:9)</span>
              <input type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploadingBanner} className="hidden" />
            </label>
          )}
          <p className="text-[11px] text-slate-400">เว้นว่าง = ใช้พื้นส้มหัวเว็บเดิม · มีรูป = แสดงแบนเนอร์เต็มความกว้างแทน</p>
        </div>
      </SectionCard>

      {/* ── การ์ด: รูปตารางกิจกรรม (เฉพาะงานนี้) ── */}
      <SectionCard icon={Ico.calendar} title="ตารางกิจกรรมทั้งงาน (รูปภาพ)"
        subtitle={event ? `${event.name} ${event.year} — แสดงเป็นกรอบบนหน้าแรก กดดูรูปเต็ม + บันทึกได้` : "เลือกงานก่อน"}>
        <div className="space-y-3">
          <label className={labelCls}>อัปโหลดรูปตาราง (ทำกราฟิกจากข้างนอกแล้วแปะ)</label>
          {form.schedule_image_url ? (
            <div className="relative inline-block">
              <img src={form.schedule_image_url} alt="ตารางกิจกรรม" className="max-h-64 w-auto rounded-xl border border-slate-200 shadow-sm" />
              <button onClick={removeSchedule} type="button"
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition">
                <Ico.trash className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-[#F15A24] hover:bg-orange-50/40 transition ${uploadingSchedule ? "opacity-60 pointer-events-none" : ""}`}>
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#F15A24] flex items-center justify-center"><Ico.image className="w-6 h-6" /></div>
              <span className="text-sm font-bold text-slate-600">{uploadingSchedule ? "กำลังอัปโหลด…" : "คลิกเพื่อเลือกรูปตาราง"}</span>
              <span className="text-[11px] text-slate-400">JPG / PNG · แนะนำกว้างพอให้อ่านชัด</span>
              <input type="file" accept="image/*" onChange={handleScheduleUpload} disabled={uploadingSchedule} className="hidden" />
            </label>
          )}
          <p className="text-[11px] text-slate-400">เว้นว่าง = ไม่แสดงกรอบตารางบนหน้าแรก · เปลี่ยนรูปใหม่ได้ทุกปี</p>
        </div>
      </SectionCard>

      {/* ── การ์ด 3: ประเภทวิชา ── */}
      <SectionCard icon={Ico.tag} title="ประเภทวิชา (หมวดหมู่)" subtitle="หมวดหมู่ + สีประจำหมวด — ใช้สีเดียวกันทุกหน้า"
        action={<AddBtn onClick={() => setTypeModal({ code: "", label: "", requires_payment: false, requires_approval: false, color: "" })} />}>
        <div className="space-y-2">
          {types.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีประเภทวิชา</p>}
          {types.map((ct) => {
            const cc = catColor(ct)
            return (
              <div key={ct.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* ป้ายสีตัวอย่าง */}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${cc.bg} ${cc.text} shrink-0`}>{ct.label}</span>
                  <span className="text-[11px] text-slate-400 font-mono truncate">({ct.code})</span>
                  {!ct.color && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">ยังไม่ตั้งสี</span>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setTypeModal(ct)} className="bg-orange-50 text-[#F15A24] border border-orange-200 p-1.5 rounded-lg hover:bg-orange-100 transition"><Ico.pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeType(ct)} className="bg-rose-50 text-rose-600 border border-rose-200 p-1.5 rounded-lg hover:bg-rose-100 transition"><Ico.trash className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* ── ปุ่มบันทึก (ท้ายสุด) ── */}
      <button onClick={save} disabled={saving} className="w-full py-3.5 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#c44215] transition disabled:opacity-50 text-sm shadow-md shadow-orange-500/25 active:scale-[0.99] flex items-center justify-center gap-2">
        {saving ? "กำลังบันทึก…" : <><Ico.save className="w-4 h-4" /> บันทึกการตั้งค่า</>}
      </button>

      {typeModal && <TypeModal ct={typeModal} onSave={saveType} onClose={() => setTypeModal(null)} />}

      {/* Footer */}
    </div>
  )
}

// ปุ่ม "เพิ่ม" ส้มเรียบ — เหมือนหน้าอื่น
function AddBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 bg-[#F15A24] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#c44215] transition active:scale-95 shrink-0">
      <Ico.plus className="w-3.5 h-3.5" /> เพิ่ม
    </button>
  )
}

function SectionCard({ icon: Icon, title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
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
  const [f, setF] = useState({ ...ct, color: ct.color || "" })
  const set = (k, v) => setF({ ...f, [k]: v })
  const isEdit = !!ct.id

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-md shadow-2xl overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center">
          <h3 className="font-bold text-white text-base flex items-center gap-2">{isEdit ? <><Ico.pencil className="w-5 h-5" /> แก้ไขประเภทวิชา</> : <><Ico.plus className="w-5 h-5" /> เพิ่มประเภทวิชา</>}</h3>
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

          {/* จานสีประจำหมวด — บังคับเลือก */}
          <div>
            <label className={labelCls}>สีประจำหมวด <span className="text-rose-500">*</span></label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button key={c.key} type="button" onClick={() => set("color", c.key)}
                  className={`relative h-10 rounded-xl ${c.bg} border-2 transition flex items-center justify-center ${f.color === c.key ? "border-slate-800 ring-2 ring-offset-1 " + c.ring : "border-transparent hover:border-slate-300"}`}
                  title={c.label} aria-label={c.label}>
                  <span className={`w-4 h-4 rounded-full ${c.dot}`} />
                  {f.color === c.key && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shadow"><Ico.check className="w-3 h-3" /></span>}
                </button>
              ))}
            </div>
            {/* ตัวอย่างป้าย */}
            {f.color && (
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
                ตัวอย่าง:
                <span className={`font-bold px-2 py-0.5 rounded-md ${catColor(f).bg} ${catColor(f).text}`}>{f.label || "ชื่อหมวด"}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 px-1 inline-flex items-start gap-1"><Ico.tag className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> สีนี้จะใช้แสดงป้ายหมวดเหมือนกันทุกหน้า (หน้าแรก, จัดการวิชา, ผู้สมัคร)</p>
        </div>
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">ยกเลิก</button>
          <button onClick={() => onSave(f)} className="py-3 text-white rounded-xl font-bold shadow-sm transition text-sm bg-[#F15A24] hover:bg-[#c44215] flex items-center justify-center gap-1.5">
            {isEdit ? <><Ico.save className="w-4 h-4" /> บันทึก</> : <><Ico.check className="w-4 h-4" /> เพิ่มประเภท</>}
          </button>
        </div>
      </div>
    </div>
  )
}