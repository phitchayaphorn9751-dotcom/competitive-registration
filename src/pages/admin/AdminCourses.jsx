import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchAllEvents, fetchCourseTypes, fetchCoursesAdmin, saveCourse, deleteCourse,
  toggleCourseOpen, updateCapacity, emergencyCloseAll, fetchCourseParticipants,
  uploadCourseAsset, duplicateCourses,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"
import { catColor } from "../../lib/categoryColors.js"

// จัดการรายวิชา — Tailwind ตาม doc 18 (คง logic เดิมจาก AdminPanel)
export default function AdminCourses() {
  const { event } = useOutletContext() || {}
  const { toast, confirm } = useDialog()
  const [events, setEvents] = useState([])
  const [types, setTypes] = useState([])
  const [selEvent, setSelEvent] = useState(event?.id || "")
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editCourse, setEditCourse] = useState(null)
  const [viewCourse, setViewCourse] = useState(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all") // all | open | closed
  const [showDup, setShowDup] = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { if (event?.id) { setSelEvent(event.id); loadCourses(event.id); loadTypes(event.id) } }, [event])

  async function init() {
    try {
      const evs = await fetchAllEvents()
      setEvents(evs || [])
      const id = event?.id || evs?.[0]?.id
      if (id) { setSelEvent(id); await loadTypes(id); await loadCourses(id) }
      else setLoading(false)
    } catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error"); setLoading(false) }
  }
  async function loadTypes(id) {
    try { setTypes(await fetchCourseTypes(id) || []) } catch (_) {}
  }
  async function loadCourses(id) {
    setLoading(true)
    try { setCourses(await fetchCoursesAdmin(id) || []) }
    catch (e) { toast("โหลดคอร์สไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }

  const blank = {
    title: "", description: "", content: "", instructor_names: [], image_url: "",
    image_urls: [], detail_images: [], attachments: [], line_qr_url: "",
    type_id: types[0]?.id || "", count_mode: "person", team_size: 2,
    min_members: 1, max_members: 1,
    capacity: 30, price: 0, is_open: true,
    seat_mode: "limited", require_portfolio: false,
    bank_account: "", bank_name: "", bank_holder: "",
    base_id: "", level: "", start_date: "", end_date: "", duration: "",
    external_url: "",
    timeline: [],
    sessions: [],
  }

  function openAdd() { setEditCourse({ ...blank, type_id: types[0]?.id || "" }); setShowModal(true) }
  function openEdit(c) { setEditCourse(c); setShowModal(true) }

  async function doSaveCourse(c) {
    try {
      await saveCourse({ ...c, event_id: selEvent })
      setShowModal(false); setEditCourse(null); toast("บันทึกคอร์สแล้ว", "success"); loadCourses(selEvent)
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, "error") }
  }
  async function doDelete(c) {
    const taken = c.seats_taken || 0
    const hasApplicants = taken > 0
    const ok = await confirm({
      title: hasApplicants ? "⚠️ คอร์สนี้มีผู้สมัครแล้ว" : "ลบคอร์สนี้?",
      message: hasApplicants
        ? `คอร์ส "${c.title}" มีผู้สมัครแล้ว ${taken} รายการ\nหากลบ ข้อมูลผู้สมัครของคอร์สนี้จะหายไปด้วย\n\nยืนยันลบคอร์สหรือไม่?`
        : `ลบคอร์ส "${c.title}"`,
      confirmText: hasApplicants ? "ยืนยันลบ" : "ลบ", tone: "danger",
    })
    if (!ok) return
    try { await deleteCourse(c.id); toast("ลบคอร์สแล้ว", "success"); loadCourses(selEvent) }
    catch { toast("ลบไม่สำเร็จ (อาจมีผู้สมัครอยู่)", "error") }
  }
  async function doToggle(c) {
    try { await toggleCourseOpen(c.id, !c.is_open); loadCourses(selEvent) }
    catch (e) { toast("เปลี่ยนสถานะไม่สำเร็จ: " + e.message, "error") }
  }
  async function doCapacity(c, val) {
    const n = parseInt(val); if (isNaN(n) || n < 0) return
    try { await updateCapacity(c.id, n); loadCourses(selEvent) }
    catch (e) {
      toast(e.message?.includes("CAPACITY_BELOW_TAKEN") ? "ตั้งที่นั่งต่ำกว่าที่จองไปแล้วไม่ได้" : e.message, "error")
      loadCourses(selEvent)
    }
  }
  async function doEmergency() {
    const ok = await confirm({ title: "ปิดรับสมัครทุกคอร์ส?", message: "ปิดรับสมัครทุกคอร์สในงานนี้ ใช้กรณีฉุกเฉินเท่านั้น", confirmText: "ปิดทั้งหมด", tone: "danger" })
    if (!ok) return
    try { const n = await emergencyCloseAll(selEvent); toast(`ปิดรับสมัครแล้ว ${n} คอร์ส`, "success"); loadCourses(selEvent) }
    catch (e) { toast("ทำไม่สำเร็จ: " + e.message, "error") }
  }

  const filtered = courses.filter((c) => {
    const matchSearch = c.title?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || (statusFilter === "open" ? c.is_open : !c.is_open)
    return matchSearch && matchStatus
  })

  // จัดกลุ่มตามหมวด (course_types.label) — สำหรับ desktop 2 คอลัมน์
  const grouped = (() => {
    const groups = {}
    filtered.forEach((c) => {
      const label = c.course_types?.label || "อื่นๆ"
      if (!groups[label]) groups[label] = []
      groups[label].push(c)
    })
    return Object.entries(groups).map(([label, items]) => ({ label, items }))
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">กำลังโหลดรายวิชา...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-8">

      {/* Header — gradient + ไอคอนวงกลม (โทนเดียวกับหน้ารายการสมัคร) */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <Ico.book className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">จัดการรายวิชา</h1>
            <p className="text-slate-400 text-xs mt-0.5">{courses.length} รายวิชา</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          <button onClick={openAdd} className="flex items-center justify-center gap-1.5 bg-[#F15A24] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-[#c44215] shadow-sm shadow-orange-500/20 transition text-sm col-span-2 sm:col-span-1">
            <Ico.plus className="w-4 h-4" /> เพิ่มวิชาใหม่
          </button>
          <button onClick={() => setShowDup(true)} className="flex items-center justify-center gap-1.5 bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 shadow-sm transition text-sm">
            <Ico.copy className="w-4 h-4" /> คัดลอกจากงานเก่า
          </button>
          <button onClick={doEmergency} className="flex items-center justify-center gap-1.5 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 shadow-sm transition text-sm">
            <Ico.alert className="w-4 h-4" /> ปิดรับทั้งหมด
          </button>
        </div>
      </div>

      {/* Search + filter (เลือกปีงานจาก header bar ด้านบน) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Ico.search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาวิชา…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F15A24]/40 focus:border-[#F15A24] focus:bg-white transition" />
        </div>
        <div className="flex gap-1.5">
          {[["all", "ทั้งหมด"], ["open", "เปิดรับ"], ["closed", "ปิดรับ"]].map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition ${statusFilter === k ? "bg-[#F15A24] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop — แบ่ง section ตามหมวด, 2 คอลัมน์ซ้ายขวา */}
      <div className="hidden md:block">
        {grouped.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center text-sm text-slate-400 shadow-sm border border-slate-100">ไม่พบรายวิชา</div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ label, items }) => {
              const cc = catColor({ label })
              return (
                <section key={label}>
                  {/* หัวข้อหมวด */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${cc.bg} ${cc.text}`}>{label}</span>
                    <span className="text-xs font-bold text-slate-400">{items.length} วิชา</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {/* การ์ด 2 คอลัมน์ */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {items.map((course) => <CourseCardWide key={course.id} course={course} onEdit={openEdit} onDelete={doDelete} onToggle={doToggle} onView={setViewCourse} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((course) => <CourseCardMobile key={course.id} course={course} onEdit={openEdit} onDelete={doDelete} onToggle={doToggle} onView={setViewCourse} />)}
        {filtered.length === 0 && <div className="bg-white rounded-2xl p-12 text-center text-sm text-slate-400 shadow-sm border border-slate-100">ไม่พบรายวิชา</div>}
      </div>

      {showModal && editCourse && (
        <CourseModal course={editCourse} types={types} onSave={doSaveCourse} onClose={() => { setShowModal(false); setEditCourse(null) }} />
      )}
      {viewCourse && <ParticipantsModal course={viewCourse} onClose={() => setViewCourse(null)} />}
      {showDup && (
        <DuplicateModal events={events} currentEventId={selEvent}
          onClose={() => setShowDup(false)}
          onDone={(n) => { setShowDup(false); toast(`คัดลอก ${n} วิชาแล้ว (ปิดรับไว้ก่อน — เปิดเองภายหลัง)`, "success"); loadCourses(selEvent) }} />
      )}
    </div>
  )
}

function DuplicateModal({ events, currentEventId, onClose, onDone }) {
  const { toast } = useDialog()
  const [fromEvent, setFromEvent] = useState("")
  const [list, setList] = useState([])
  const [picked, setPicked] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // งานอื่น (ไม่ใช่งานปัจจุบัน)
  const otherEvents = events.filter((e) => e.id !== currentEventId)

  async function loadFrom(eid) {
    setFromEvent(eid); setPicked({}); setList([])
    if (!eid) return
    setLoading(true)
    try { setList(await fetchCoursesAdmin(eid) || []) }
    catch (e) { toast("โหลดไม่สำเร็จ: " + e.message, "error") }
    finally { setLoading(false) }
  }
  const toggle = (id) => setPicked((p) => ({ ...p, [id]: !p[id] }))
  const toggleAll = () => {
    if (list.every((c) => picked[c.id])) setPicked({})
    else setPicked(Object.fromEntries(list.map((c) => [c.id, true])))
  }
  const pickedIds = list.filter((c) => picked[c.id]).map((c) => c.id)

  async function doCopy() {
    if (pickedIds.length === 0) return toast("เลือกวิชาก่อน", "error")
    setSaving(true)
    try {
      const created = await duplicateCourses(pickedIds, currentEventId)
      onDone(created.length)
    } catch (e) { toast("คัดลอกไม่สำเร็จ: " + e.message, "error") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2"><Ico.copy className="w-5 h-5" /> คัดลอกวิชาจากงานเก่า</h3>
            <p className="text-orange-100 text-xs mt-0.5">เลือกงานต้นทาง แล้วเลือกวิชาที่จะคัดลอกมางานปัจจุบัน</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
        </div>

        <div className="p-5 shrink-0 border-b border-slate-100">
          <label className="text-xs font-bold text-slate-500 block mb-1.5">เลือกงานต้นทาง</label>
          <select value={fromEvent} onChange={(e) => loadFrom(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] outline-none">
            <option value="">— เลือกงาน —</option>
            {otherEvents.map((e) => <option key={e.id} value={e.id}>{e.name} {e.year}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {!fromEvent ? <div className="py-12 text-center text-slate-400 text-sm">เลือกงานต้นทางก่อน</div>
            : loading ? <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            : list.length === 0 ? <div className="py-12 text-center text-slate-400 text-sm">งานนี้ไม่มีวิชา</div>
            : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400">{pickedIds.length} / {list.length} วิชา</span>
                  <button onClick={toggleAll} className="text-xs text-[#F15A24] font-bold hover:underline">{list.every((c) => picked[c.id]) ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}</button>
                </div>
                <div className="space-y-2">
                  {list.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${picked[c.id] ? "bg-orange-50 border-orange-300" : "bg-slate-50 border-slate-100 hover:border-slate-300"}`}>
                      <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggle(c.id)} className="w-4 h-4 accent-[#F15A24]" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 text-sm truncate">{c.title}</div>
                        <div className="text-xs text-slate-400">{c.course_types?.label || "—"} · {c.price > 0 ? `฿${c.price}` : "ไม่มีค่าลงทะเบียน"} · รับ {c.capacity}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
        </div>

        <div className="p-4 border-t border-slate-100 grid grid-cols-2 gap-3 shrink-0">
          <button onClick={onClose} className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">ยกเลิก</button>
          <button onClick={doCopy} disabled={saving || pickedIds.length === 0} className="py-3 bg-[#F15A24] text-white rounded-xl font-bold hover:bg-[#c44215] transition text-sm disabled:opacity-50">{saving ? "กำลังคัดลอก…" : `คัดลอก ${pickedIds.length} วิชา`}</button>
        </div>
      </div>
    </div>
  )
}

function seatInfo(course) {
  const taken = course.seats_taken || 0
  const cap = course.capacity || 0
  const pct = cap ? Math.min(100, Math.round((taken / cap) * 100)) : 0
  return { taken, cap, pct, isFull: pct >= 100 }
}

// สีหมวดหมู่ใช้จาก lib กลาง (categoryColors.js) — admin ตั้งสีที่หน้า settings

function CourseCardWide({ course, onEdit, onDelete, onToggle, onView }) {
  const { taken, cap, pct, isFull } = seatInfo(course)
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const typeLabel = course.course_types?.label
  const cc = catColor(course.course_types)
  const unlimited = course.seat_mode === "unlimited"
  return (
    <div className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-orange-200 transition-all duration-300 flex flex-col">
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {/* แถวบน: (ซ้าย) รูป + ป้าย/ชื่อวิชา  ·  (ขวา) toggle เหนือราคา */}
        <div className="flex items-start gap-3">
          {/* รูปเล็กซ้าย */}
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
            {course.image_url
              ? <img src={course.image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-slate-300"><Ico.book className="w-7 h-7" /></div>}
          </div>

          {/* กลาง: ป้ายหมวด+รูปแบบ → ชื่อวิชา → ผู้สอน */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {typeLabel && <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${cc.bg} ${cc.text}`}>{typeLabel}</span>}
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/60 rounded-md px-2 py-0.5"><Ico.users className="w-3 h-3" /> {modeLabel(course)}</span>
            </div>
            <h3 className="font-bold text-[#F15A24] text-sm leading-snug">{course.title}</h3>
            {instructors.length > 0 && <div className="text-[11px] text-slate-500 inline-flex items-center gap-1 truncate"><Ico.cap className="w-3 h-3 shrink-0" /> {instructors.join(", ")}</div>}
          </div>

          {/* ขวา: toggle เปิด/ปิดรับ (บน) → ราคา (ล่าง) ชิดขวาสุด */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <button onClick={() => onToggle(course)} aria-label="สลับสถานะรับสมัคร"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition duration-300 ${course.is_open ? "bg-emerald-500" : "bg-slate-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-300 ${course.is_open ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className={`text-[10px] font-bold ${course.is_open ? "text-emerald-600" : "text-slate-400"}`}>{course.is_open ? "เปิดรับ" : "ปิดรับ"}</span>
            </div>
            <div className="text-right">
              {course.price > 0
                ? <span className="text-base font-extrabold text-[#F15A24] leading-none whitespace-nowrap">{Number(course.price).toLocaleString()}<span className="text-[10px] font-bold text-slate-400 ml-1">บาท</span></span>
                : <span className="text-sm font-extrabold text-emerald-600 whitespace-nowrap">ฟรี</span>}
            </div>
          </div>
        </div>

        {/* แถบที่นั่ง (เต็มกว้าง) */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          {Array.isArray(course.sessions) && course.sessions.length > 0 ? (
            /* คอร์สมีรอบ — ปรอทแยกแต่ละรอบ */
            <div className="space-y-1.5">
              {course.sessions.map((s) => {
                const sTaken = s.taken || 0
                const sCap = s.capacity || 0
                const sPct = sCap > 0 ? Math.min(100, Math.round((sTaken / sCap) * 100)) : 0
                const sFull = sCap > 0 && sTaken >= sCap
                return (
                  <div key={s.id}>
                    <div className="flex justify-between items-center text-[10px] mb-0.5">
                      <span className="text-slate-500 truncate">{s.label || "รอบ"}: <span className={`font-bold ${sFull ? "text-rose-600" : "text-slate-700"}`}>{sTaken}/{sCap}</span></span>
                      <span className={`font-bold ${sFull ? "text-rose-500" : sPct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{sPct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${sFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : sPct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${sPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-500">ที่นั่ง: <span className={`font-bold ${isFull && !unlimited ? "text-rose-600" : "text-slate-700"}`}>{taken} / {unlimited ? "∞" : cap}</span></span>
                {!unlimited && <span className={`font-bold ${isFull ? "text-rose-500" : pct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{pct}%</span>}
              </div>
              {!unlimited ? (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${pct}%` }} />
                </div>
              ) : (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(85, Math.round(Math.log10(taken + 1) * 39))}%` }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* ปุ่ม action (แถวล่าง เต็มกว้าง) */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => onView(course)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition border border-slate-200/60"><Ico.eye className="w-4 h-4" /> ผู้สมัคร</button>
          <button onClick={() => onEdit(course)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#F15A24] bg-orange-50 hover:bg-[#F15A24] hover:text-white rounded-xl transition border border-orange-100"><Ico.pencil className="w-4 h-4 shrink-0" /> แก้ไข</button>
          <button onClick={() => onDelete(course)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white transition"><Ico.trash className="w-4 h-4" /> ลบ</button>
        </div>
      </div>
    </div>
  )
}

function modeLabel(course) {
  if (course.count_mode === "team") {
    const mn = course.min_members, mx = course.max_members
    if (mn && mx && mn !== mx) return `ทีม ${mn}-${mx} คน`
    if (course.team_size === 2) return "คู่"
    return `ทีม ${course.team_size || mx || ""} คน`
  }
  return "เดี่ยว"
}

function CourseCardMobile({ course, onEdit, onDelete, onToggle, onView }) {
  const { taken, cap, pct, isFull } = seatInfo(course)
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const typeLabel = course.course_types?.label
  const cc = catColor(course.course_types)
  const unlimited = course.seat_mode === "unlimited"
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex gap-3">
        {/* รูป */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
          {course.image_url ? <img src={course.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Ico.book className="w-6 h-6" /></div>}
        </div>
        {/* ข้อมูล */}
        <div className="flex-1 min-w-0">
          {/* ป้ายกำกับ: หมวด · รูปแบบ (ใช้ catColor เหมือน desktop) */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {typeLabel && <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${cc.bg} ${cc.text}`}>{typeLabel}</span>}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/60 rounded-md px-2 py-0.5"><Ico.users className="w-3 h-3" /> {modeLabel(course)}</span>
          </div>
          {/* ชื่อวิชา (ส้มเด่น) */}
          <h3 className="font-bold text-[#F15A24] text-sm leading-snug">{course.title}</h3>
          {instructors.length > 0 && <div className="text-[11px] text-slate-500 mt-1 truncate inline-flex items-center gap-1"><Ico.cap className="w-3 h-3 shrink-0" /> {instructors.join(", ")}</div>}
          <div className="text-right mt-1">
            {course.price > 0
              ? <span className="text-base font-extrabold text-[#F15A24] whitespace-nowrap">{Number(course.price).toLocaleString()}<span className="text-[10px] font-bold text-slate-400 ml-1">บาท</span></span>
              : <span className="text-sm font-extrabold text-emerald-600">ฟรี</span>}
          </div>
        </div>
        {/* toggle เปิดรับ */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button onClick={() => onToggle(course)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${course.is_open ? "bg-emerald-500" : "bg-slate-300"}`}>
            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${course.is_open ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className={`text-[10px] font-bold ${course.is_open ? "text-emerald-600" : "text-slate-400"}`}>{course.is_open ? "เปิดรับ" : "ปิดรับ"}</span>
        </div>
      </div>

      {/* แถวล่าง: (ซ้าย) แถบที่นั่ง | (ขวา) ปุ่ม — มีเส้นกั้น */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
        {/* ซ้าย: แถบที่นั่ง */}
        <div className="flex-1 min-w-0">
          {Array.isArray(course.sessions) && course.sessions.length > 0 ? (
            /* คอร์สมีรอบ — ปรอทแยกแต่ละรอบ */
            <div className="space-y-1.5">
              {course.sessions.map((s) => {
                const sTaken = s.taken || 0
                const sCap = s.capacity || 0
                const sPct = sCap > 0 ? Math.min(100, Math.round((sTaken / sCap) * 100)) : 0
                const sFull = sCap > 0 && sTaken >= sCap
                return (
                  <div key={s.id}>
                    <div className="flex justify-between items-center text-[10px] mb-0.5">
                      <span className="text-slate-500 truncate">{s.label || "รอบ"}: <span className={`font-bold ${sFull ? "text-rose-600" : "text-slate-700"}`}>{sTaken}/{sCap}</span></span>
                      <span className={`font-bold ${sFull ? "text-rose-500" : sPct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{sPct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${sFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : sPct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${sPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-500">ที่นั่ง: <span className={`font-bold ${isFull && !unlimited ? "text-rose-600" : "text-slate-700"}`}>{taken} / {unlimited ? "∞" : cap}</span></span>
                {!unlimited && <span className={`font-bold ${isFull ? "text-rose-500" : pct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{pct}%</span>}
              </div>
              {!unlimited ? (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${pct}%` }} />
                </div>
              ) : (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(85, Math.round(Math.log10(taken + 1) * 39))}%` }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* เส้นกั้น */}
        <div className="w-px self-stretch bg-slate-200 shrink-0" />

        {/* ขวา: ปุ่ม (ไอคอนล้วน ประหยัดพื้นที่) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onView(course)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center hover:bg-slate-200 transition" aria-label="ผู้สมัคร"><Ico.eye className="w-4 h-4" /></button>
          <button onClick={() => onEdit(course)} className="w-8 h-8 rounded-lg bg-orange-50 text-[#F15A24] border border-orange-200 flex items-center justify-center hover:bg-orange-100 transition" aria-label="แก้ไข"><Ico.pencil className="w-4 h-4" /></button>
          <button onClick={() => onDelete(course)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center hover:bg-rose-100 transition" aria-label="ลบ"><Ico.trash className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}

// ── ตัวแก้ไข Timeline (กำหนดการ) — date picker + ป้าย + ติ๊กวันเด่น ──
function TimelineEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : []
  const tlInput = "w-full px-2.5 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"

  function add() { onChange([...list, { date: "", label: "", highlight: false }]) }
  function update(i, key, val) { onChange(list.map((it, idx) => idx === i ? { ...it, [key]: val } : it)) }
  function remove(i) { onChange(list.filter((_, idx) => idx !== i)) }

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <Ico.calendar className="w-3.5 h-3.5 text-[#F15A24]" /> กำหนดการ (Timeline)
        </label>
        <button type="button" onClick={add}
          className="flex items-center gap-1 bg-[#F15A24] text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-[#c44215] transition active:scale-95">
          <Ico.plus className="w-3 h-3" /> เพิ่มวัน
        </button>
      </div>

      {list.length === 0 && <p className="text-[11px] text-slate-400 text-center py-2">ยังไม่มีกำหนดการ — กด "เพิ่มวัน" เช่น ปิดรับสมัคร / ประชุม / วันงาน</p>}

      <div className="space-y-2">
        {list.map((it, i) => (
          <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-slate-100 p-2">
            <input type="date" className={`${tlInput} w-36 shrink-0`} value={it.date || ""} onChange={(e) => update(i, "date", e.target.value)} />
            <input className={tlInput} placeholder="ป้าย เช่น ปิดรับสมัคร, วันงาน" value={it.label || ""} onChange={(e) => update(i, "label", e.target.value)} />
            <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="วันเด่น (เช่น วันงาน)">
              <input type="checkbox" checked={!!it.highlight} onChange={(e) => update(i, "highlight", e.target.checked)} className="w-4 h-4 accent-[#F15A24]" />
              <span className="text-[10px] font-bold text-slate-500">เด่น</span>
            </label>
            <button type="button" onClick={() => remove(i)} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg shrink-0" title="ลบ"><Ico.trash className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {list.length > 0 && <p className="text-[10px] text-slate-400 mt-2">เรียงตามวันอัตโนมัติ · ติ๊ก "เด่น" ให้วันงานเด่นกว่าจุดอื่น</p>}
    </div>
  )
}

// ── ตัวแก้ไข "รอบ" (session) — แบ่งคอร์สเป็นหลายรอบ โควตาแยกกัน ──
// ว่าง = คอร์สไม่มีรอบ (flow เดิมปกติ) · มีรอบ = ผู้สมัครเลือกรอบตอนสมัคร
function SessionEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : []
  const sInput = "w-full px-2.5 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"

  function add() {
    // สร้าง id ไม่ซ้ำ
    const id = "s" + (Date.now().toString(36).slice(-4)) + Math.floor(Math.random() * 90 + 10)
    onChange([...list, { id, label: "", time: "", capacity: 30, taken: 0 }])
  }
  function update(i, key, val) { onChange(list.map((it, idx) => idx === i ? { ...it, [key]: val } : it)) }
  function remove(i) { onChange(list.filter((_, idx) => idx !== i)) }

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <Ico.clock className="w-3.5 h-3.5 text-[#F15A24]" /> รอบ (Session)
        </label>
        <button type="button" onClick={add}
          className="flex items-center gap-1 bg-[#F15A24] text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-[#c44215] transition active:scale-95">
          <Ico.plus className="w-3 h-3" /> เพิ่มรอบ
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-2.5">เว้นว่าง = คอร์สรอบเดียว (ปกติ) · ใส่รอบ = ผู้สมัครต้องเลือกรอบ แต่ละรอบมีโควตาแยกกัน</p>

      {list.length === 0 && <p className="text-[11px] text-slate-400 text-center py-2">ยังไม่มีรอบ — คอร์สนี้รับสมัครแบบรอบเดียว (ปกติ)</p>}

      <div className="space-y-2">
        {list.map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-2 bg-white rounded-lg border border-slate-100 p-2">
            <input className={`${sInput} flex-1`} placeholder="ชื่อรอบ เช่น รอบเช้า" value={it.label || ""} onChange={(e) => update(i, "label", e.target.value)} />
            <input className={`${sInput} w-32 shrink-0`} placeholder="09:00-12:00" value={it.time || ""} onChange={(e) => update(i, "time", e.target.value)} />
            <div className="flex items-center gap-1 shrink-0">
              <input type="number" min="0" className={`${sInput} w-20`} placeholder="โควตา" value={it.capacity ?? ""} onChange={(e) => update(i, "capacity", parseInt(e.target.value) || 0)} />
              <span className="text-[10px] text-slate-400">คน</span>
            </div>
            <button type="button" onClick={() => remove(i)} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg shrink-0" title="ลบรอบ"><Ico.trash className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {list.length > 0 && (
        <p className="text-[10px] text-amber-500 mt-2 flex items-start gap-1">
          <Ico.alert className="w-3 h-3 shrink-0 mt-0.5" /> เมื่อมีรอบ: ช่อง "จำนวนที่รับ" ด้านบนจะไม่ใช้ — ระบบนับโควตาจากแต่ละรอบแทน
        </p>
      )}
    </div>
  )
}

// Modal เพิ่ม/แก้คอร์ส
function CourseModal({ course, types, onSave, onClose }) {
  const { toast } = useDialog()
  const initPayMode = (course.price > 0) ? "paid" : "free"
  const initCount = course.count_mode === "team"
    ? (course.team_size === 2 && course.min_members === course.max_members ? "pair" : "team")
    : "single"
  const [f, setF] = useState({
    ...course,
    instructor_text: (course.instructor_names || []).join(", "),
    pay_mode: initPayMode,
    count_choice: initCount,
    image_urls: course.image_urls || (course.image_url ? [course.image_url] : []),
    detail_images: course.detail_images || [],
    attachments: course.attachments || [],
  })
  // เนื้อหาแบบหัวข้อย่อย — parse จาก content (รองรับข้อมูลเก่าที่เป็น text ธรรมดา)
  const [sections, setSections] = useState(() => {
    if (!course.content) return [{ heading: "", body: "" }]
    try {
      const parsed = JSON.parse(course.content)
      if (Array.isArray(parsed) && parsed.length) return parsed.map((s) => ({ heading: s.heading || "", body: s.body || "" }))
      return [{ heading: "", body: course.content }]
    } catch { return [{ heading: "", body: course.content }] }
  })
  function addSection() { setSections((prev) => [...prev, { heading: "", body: "" }]) }
  function removeSection(idx) { setSections((prev) => prev.filter((_, i) => i !== idx)) }
  function updateSection(idx, key, val) { setSections((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s)) }
  // ย้ายหัวข้อขึ้น/ลง (สลับตำแหน่ง)
  function moveSection(idx, dir) {
    setSections((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const [uploading, setUploading] = useState(false)
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))
  // กรอกวันเริ่ม/สิ้นสุด → คำนวณจำนวนวันให้อัตโนมัติ
  function onDateChange(key, val) {
    setF((prev) => {
      const next = { ...prev, [key]: val }
      const s = next.start_date, e = next.end_date
      if (s && e) {
        const d1 = new Date(s), d2 = new Date(e)
        const diff = Math.round((d2 - d1) / 86400000) + 1  // รวมวันแรก
        if (diff > 0) next.duration = `${diff} วัน`
      }
      return next
    })
  }
  const isEdit = !!course.id
  const selectedType = types.find((t) => t.id === f.type_id)

  async function handleImageFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) urls.push(await uploadCourseAsset(file, "images"))
      setF((prev) => ({ ...prev, image_urls: [...(prev.image_urls || []), ...urls] }))
    } catch (err) { toast("อัปโหลดรูปไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(false); e.target.value = "" }
  }
  async function handleQrFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { set("line_qr_url", await uploadCourseAsset(file, "qr")) }
    catch (err) { toast("อัปโหลด QR ไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(false); e.target.value = "" }
  }
  function removeImage(idx) {
    setF((prev) => ({ ...prev, image_urls: prev.image_urls.filter((_, i) => i !== idx) }))
  }
  // รูปรายละเอียด (แสดงขนาดจริงด้านล่าง popup — แยกจากรูปปก)
  async function handleDetailImageFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) urls.push(await uploadCourseAsset(file, "images"))
      setF((prev) => ({ ...prev, detail_images: [...(prev.detail_images || []), ...urls] }))
    } catch (err) { toast("อัปโหลดรูปไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(false); e.target.value = "" }
  }
  function removeDetailImage(idx) {
    setF((prev) => ({ ...prev, detail_images: (prev.detail_images || []).filter((_, i) => i !== idx) }))
  }
  // ไฟล์แนบ PDF (ให้ผู้สมัครดาวน์โหลด) — เก็บ {name, url}
  async function handleAttachmentFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const items = []
      for (const file of files) {
        const url = await uploadCourseAsset(file, "attachments")
        items.push({ name: file.name, url })
      }
      setF((prev) => ({ ...prev, attachments: [...(prev.attachments || []), ...items] }))
    } catch (err) { toast("อัปโหลดไฟล์ไม่สำเร็จ: " + err.message, "error") }
    finally { setUploading(false); e.target.value = "" }
  }
  function removeAttachment(idx) {
    setF((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== idx) }))
  }

  function submit(e) {
    e.preventDefault()
    if (!f.title?.trim()) return toast("กรุณากรอกชื่อคอร์ส", "error")
    // count_choice → count_mode + team_size + min/max
    let count_mode = "person", team_size = 1, min_members = 1, max_members = 1
    if (f.count_choice === "pair") { count_mode = "team"; team_size = 2; min_members = 2; max_members = 2 }
    else if (f.count_choice === "team") {
      count_mode = "team"
      min_members = parseInt(f.min_members) || 1
      max_members = parseInt(f.max_members) || min_members
      team_size = max_members
    }
    const price = f.pay_mode === "paid" ? (parseInt(f.price) || 0) : 0
    const capacity = f.seat_mode === "unlimited" ? 0 : (parseInt(f.capacity) || 0)
    // เนื้อหา: เก็บเฉพาะหัวข้อที่มีข้อมูล เป็น JSON array
    const cleanSections = sections.filter((s) => s.heading.trim() || s.body.trim())
    const content = cleanSections.length ? JSON.stringify(cleanSections) : null
    onSave({
      ...f, count_mode, team_size, min_members, max_members, price, capacity, content,
      seat_mode: f.seat_mode || "limited",
      require_portfolio: !!f.require_portfolio,
      bank_account: f.pay_mode === "paid" ? f.bank_account : "",
      bank_name: f.pay_mode === "paid" ? f.bank_name : "",
      bank_holder: f.pay_mode === "paid" ? f.bank_holder : "",
      image_url: f.image_urls?.[0] || "",
      external_url: (f.external_url && f.external_url.trim() !== "" && f.external_url.trim() !== "https://") ? f.external_url.trim() : null,
      instructor_names: f.instructor_text.split(",").map((s) => s.trim()).filter(Boolean),
    })
  }

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"
  const labelCls = "text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5"

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[90vh] rounded-t-2xl">
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-white text-base flex items-center gap-2">{isEdit ? <><Ico.pencil className="w-5 h-5" /> แก้ไขรายวิชา</> : <><Ico.plus className="w-5 h-5" /> เพิ่มรายวิชาใหม่</>}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* 1. ชื่อวิชา */}
            <div><label className={labelCls}>ชื่อวิชา *</label><input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>

            {/* 2. วันเริ่ม + วันสิ้นสุด + ระยะเวลา */}
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>วันเริ่มเรียน</label><input type="date" className={inputCls} value={f.start_date || ""} onChange={(e) => onDateChange("start_date", e.target.value)} /></div>
              <div><label className={labelCls}>วันสิ้นสุด</label><input type="date" className={inputCls} value={f.end_date || ""} onChange={(e) => onDateChange("end_date", e.target.value)} /></div>
              <div><label className={labelCls}>ระยะเวลา <span className="text-[10px] text-slate-400 font-normal">(คำนวณอัตโนมัติ)</span></label><input className={inputCls} placeholder="เช่น 5 วัน" value={f.duration || ""} onChange={(e) => set("duration", e.target.value)} /></div>
            </div>

            {/* กำหนดการ (timeline) — แสดงในหน้ารายละเอียดคอร์ส */}
            <TimelineEditor items={f.timeline || []} onChange={(tl) => set("timeline", tl)} />

            {/* รอบ (session) — แบ่งคอร์สเป็นหลายรอบ (optional) */}
            <SessionEditor items={f.sessions || []} onChange={(ss) => set("sessions", ss)} />


            {/* 3. หมวดหมู่ + ผู้สอน */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>หมวดหมู่วิชา</label>
                <select className={inputCls} value={f.type_id || ""} onChange={(e) => set("type_id", e.target.value)}>
                  {types.length === 0 && <option value="">— ยังไม่มีหมวดหมู่ —</option>}
                  {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>ผู้สอน (คั่นด้วย ,)</label><input className={inputCls} placeholder="อ.สมชาย" value={f.instructor_text} onChange={(e) => set("instructor_text", e.target.value)} /></div>
            </div>

            {/* Base ID + ระดับชั้น */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Base ID (รหัสนำหน้าเลขประจำตัว)</label><input type="text" className={inputCls} placeholder="เช่น GAME, MUSIC, CODE" value={f.base_id || ""} onChange={(e) => set("base_id", e.target.value.toUpperCase())} /><p className="text-[11px] text-slate-400 mt-1 inline-flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> ควรตั้งให้<b>ต่างกันทุกคอร์ส</b> เพื่อแยกรหัสนักเรียน เช่น GAME-001, MUSIC-001</p></div>
              <div>
                <label className={labelCls}>ระดับชั้น</label>
                <select className={inputCls} value={f.level || ""} onChange={(e) => set("level", e.target.value)}>
                  <option value="">— ไม่ระบุ —</option>
                  <option value="ประถมศึกษา">ประถม (ป.1-6)</option>
                  <option value="มัธยมศึกษาตอนต้น">มัธยมต้น</option>
                  <option value="มัธยมศึกษาตอนปลาย">มัธยมปลาย</option>
                  <option value="มัธยมต้น + ปลาย">มัธยมต้น+ปลาย</option>
                  <option value="ทุกระดับ">ทุกระดับ</option>
                </select>
              </div>
            </div>

            {/* รูปแบบการสมัคร + จำนวนรับสมัคร (บรรทัดเดียว) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>รูปแบบการสมัคร</label>
                <select className={inputCls} value={f.count_choice} onChange={(e) => set("count_choice", e.target.value)}>
                  <option value="single">เดี่ยว (1 คน)</option>
                  <option value="pair">คู่ (2 คน)</option>
                  <option value="team">ทีม (ช่วงจำนวนคน)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>จำนวนที่รับ</label>
                <select className={inputCls} value={f.seat_mode} onChange={(e) => set("seat_mode", e.target.value)}>
                  <option value="limited">จำกัดจำนวน</option>
                  <option value="unlimited">ไม่จำกัด (รับไม่อั้น)</option>
                </select>
              </div>
            </div>
            {/* ช่องย่อย: จำนวนคนต่อทีม / จำนวนที่รับ (คน) */}
            {(f.count_choice === "team" || f.seat_mode === "limited") && (
              <div className="grid grid-cols-2 gap-3 -mt-2">
                {f.count_choice === "team" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>ทีมละต่ำสุด</label><input type="number" min={1} className={inputCls} value={f.min_members} onChange={(e) => set("min_members", e.target.value)} /></div>
                    <div><label className={labelCls}>ทีมละมากสุด</label><input type="number" min={1} className={inputCls} value={f.max_members} onChange={(e) => set("max_members", e.target.value)} /></div>
                  </div>
                ) : <div />}
                {f.seat_mode === "limited" ? (
                  <div>
                    <label className={labelCls}>รับกี่คน (รวมทุกคน)</label>
                    <input type="number" min={0} className={inputCls} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} />
                    {f.count_choice !== "single" && <p className="text-[10px] text-slate-400 mt-1">นับเป็นจำนวนคน — เช่น 60 = รับ 60 คน (ทีม 3 คนกินที่ 3, ทีม 2 คนกินที่ 2)</p>}
                  </div>
                ) : <div />}
              </div>
            )}
            {f.count_choice === "team" && <p className="text-[11px] text-slate-400 -mt-2 inline-flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> เช่น ต่ำสุด 1 มากสุด 4 → 1 ทีมมี 1-4 คนก็ได้ (ยืดหยุ่น)</p>}

            {/* การชำระเงิน */}
            <div>
              <label className={labelCls}>การรับชำระเงิน</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set("pay_mode", "paid")}
                  className={`p-3 rounded-xl border-2 text-left transition ${f.pay_mode === "paid" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.money className="w-4 h-4 text-[#F15A24]" /> เสียเงิน</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">อัปสลิป → กันที่นั่งทันที</div>
                </button>
                <button type="button" onClick={() => set("pay_mode", "free")}
                  className={`p-3 rounded-xl border-2 text-left transition ${f.pay_mode === "free" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.gift className="w-4 h-4 text-emerald-500" /> ไม่เสียเงิน</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">สมัคร → แอดมินอนุมัติ</div>
                </button>
              </div>
              {f.pay_mode === "paid" && (
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelCls}>ชื่อธนาคาร</label><input className={inputCls} placeholder="กสิกรไทย" value={f.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} /></div>
                    <div><label className={labelCls}>เลขบัญชี</label><input className={inputCls} placeholder="xxx-x-xxxxx-x" value={f.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} /></div>
                  </div>
                  <div><label className={labelCls}>ชื่อผู้รับเงิน</label><input className={inputCls} placeholder="ชื่อ-สกุล" value={f.bank_holder || ""} onChange={(e) => set("bank_holder", e.target.value)} /></div>
                  <div><label className={labelCls}>ราคา (บาท)</label><input type="number" min={0} className={inputCls} value={f.price} onChange={(e) => set("price", e.target.value)} /></div>
                </div>
              )}
            </div>

            {/* แนบลิงก์ผลงาน (เปิด/ปิด) + หัวข้อ */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.clip className="w-4 h-4" /> ต้องแนบลิงก์ผลงาน</div>
                  <div className="text-[11px] text-slate-400">เปิดถ้าให้ผู้สมัครส่งลิงก์ผลงาน (เช่น การแข่งขัน)</div>
                </div>
                <button type="button" onClick={() => set("require_portfolio", !f.require_portfolio)}
                  className={`relative inline-flex items-center h-7 rounded-full w-12 shrink-0 transition-colors ${f.require_portfolio ? "bg-[#F15A24]" : "bg-slate-300"}`}>
                  <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transition-transform ${f.require_portfolio ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {f.require_portfolio && (
                <div className="mt-3">
                  <label className={labelCls}>หัวข้อ/คำอธิบายให้ผู้สมัคร</label>
                  <input className={inputCls} placeholder="เช่น แนบลิงก์ผลงาน (Google Drive / YouTube / Behance)" value={f.portfolio_label || ""} onChange={(e) => set("portfolio_label", e.target.value)} />
                  <p className="text-[11px] text-slate-400 mt-1">ข้อความนี้จะแสดงให้ผู้สมัครเห็นตอนกรอกลิงก์</p>
                </div>
              )}
            </div>

            {/* 5. รูปภาพประกอบ */}
            <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4">
              <label className="text-xs font-black text-[#F15A24] uppercase tracking-wide mb-2 flex items-center gap-1.5"><Ico.image className="w-4 h-4" /> รูปภาพประกอบ (อัปหลายรูปได้)</label>
              <input type="file" multiple accept="image/*" onChange={handleImageFiles} disabled={uploading}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 mb-3 disabled:opacity-50" />
              <div className="flex flex-wrap gap-2">
                {(f.image_urls || []).map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-slate-200" />
                    <button type="button" onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow hover:bg-rose-600">×</button>
                    {idx === 0 && <span className="absolute bottom-0 inset-x-0 bg-[#F15A24] text-white text-[8px] text-center rounded-b-lg">ปก</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* 5.5 รูปรายละเอียด — แสดงขนาดจริงด้านล่าง popup (แยกจากรูปปก) */}
            <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-4">
              <label className="text-xs font-black text-sky-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><Ico.image className="w-4 h-4" /> รูปรายละเอียด</label>
              <input type="file" multiple accept="image/*" onChange={handleDetailImageFiles} disabled={uploading}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200 mb-3 disabled:opacity-50" />
              <div className="flex flex-wrap gap-2">
                {(f.detail_images || []).map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-slate-200" />
                    <button type="button" onClick={() => removeDetailImage(idx)} className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow hover:bg-rose-600">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. QR ไลน์กลุ่ม */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
              <label className="text-xs font-black text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Ico.qr className="w-4 h-4" /> QR ไลน์กลุ่ม (ถ้ามี)</label>
              <input type="file" accept="image/*" onChange={handleQrFile} disabled={uploading}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-700 disabled:opacity-50" />
              {f.line_qr_url && (
                <div className="relative inline-block mt-2">
                  <img src={f.line_qr_url} alt="QR" className="h-20 w-auto rounded-lg border border-emerald-300" />
                  <button type="button" onClick={() => set("line_qr_url", "")}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow hover:bg-rose-600" title="ลบ QR">×</button>
                </div>
              )}
            </div>

            {/* 6.5 ไฟล์แนบ PDF — ให้ผู้สมัครดาวน์โหลด */}
            <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4">
              <label className="text-xs font-black text-violet-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><Ico.folder className="w-4 h-4" /> ไฟล์แนบ (PDF)</label>
              <input type="file" multiple accept=".pdf,application/pdf" onChange={handleAttachmentFiles} disabled={uploading}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200 mb-3 disabled:opacity-50" />
              <div className="space-y-1.5">
                {(f.attachments || []).map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
                    <Ico.receipt className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="text-xs text-slate-700 truncate flex-1">{att.name}</span>
                    <button type="button" onClick={() => removeAttachment(idx)} className="text-rose-500 hover:bg-rose-50 rounded p-1 shrink-0"><Ico.trash className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* 7. คำอธิบายย่อ */}
            <div><label className={labelCls}>คำอธิบายย่อ</label><textarea rows="2" className={`${inputCls} resize-none`} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></div>

            {/* 8. เนื้อหาครบถ้วน — แบ่งหัวข้อย่อย */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + " !mb-0"}>เนื้อหาครบถ้วน (แบ่งเป็นหัวข้อได้)</label>
                <button type="button" onClick={addSection} className="text-xs font-bold text-[#F15A24] hover:text-orange-600 flex items-center gap-1">
                  <Ico.plus className="w-3.5 h-3.5" /> เพิ่มหัวข้อ
                </button>
              </div>
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 relative">
                    {/* ปุ่มควบคุม: ย้ายขึ้น/ลง + ลบ */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0}
                        className="w-6 h-6 rounded-lg bg-white text-slate-500 border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition" title="ย้ายขึ้น">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                      </button>
                      <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1}
                        className="w-6 h-6 rounded-lg bg-white text-slate-500 border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition" title="ย้ายลง">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                      {sections.length > 1 && (
                        <button type="button" onClick={() => removeSection(idx)}
                          className="w-6 h-6 rounded-lg bg-rose-50 text-rose-500 border border-rose-200 flex items-center justify-center text-xs hover:bg-rose-100 transition" title="ลบหัวข้อ">×</button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mb-2 pr-24">
                      <span className="w-5 h-5 rounded-md bg-[#F15A24] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <input className={`${inputCls} font-bold !mb-0`} placeholder={`หัวข้อ ${idx + 1} (เช่น รายละเอียดวิชา / ประโยชน์ / กิจกรรม)`}
                        value={sec.heading} onChange={(e) => updateSection(idx, "heading", e.target.value)} />
                    </div>
                    <textarea rows="3" className={`${inputCls} resize-none`} placeholder="รายละเอียดของหัวข้อนี้…"
                      value={sec.body} onChange={(e) => updateSection(idx, "body", e.target.value)} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 inline-flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> เว้นว่างได้ถ้าไม่ต้องการ · ใช้ปุ่ม ▲▼ ย้ายสลับลำดับหัวข้อ · หัวข้อจะแสดงเป็นหมวดในหน้ารายละเอียดวิชา</p>
            </div>

            {/* สมัครผ่านลิงก์นอก */}
            <div className="bg-violet-50/60 rounded-xl p-4 border border-violet-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Ico.copy className="w-4 h-4 text-violet-500" /> สมัครผ่านลิงก์นอก</div>
                  <div className="text-[11px] text-slate-400">คอร์สที่รับสมัครผ่านระบบอื่น — user กดลงทะเบียนจะเด้งไปลิงก์นี้</div>
                </div>
                <button type="button" onClick={() => set("external_url", f.external_url ? "" : "https://")}
                  className={`relative inline-flex items-center h-7 rounded-full w-12 shrink-0 transition-colors ${f.external_url ? "bg-violet-500" : "bg-slate-300"}`}>
                  <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transition-transform ${f.external_url ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {f.external_url !== "" && f.external_url !== undefined && f.external_url !== null && (
                <div className="mt-3">
                  <label className={labelCls}>ลิงก์สมัครภายนอก</label>
                  <input className={inputCls} type="url" placeholder="https://forms.google.com/..." value={f.external_url} onChange={(e) => set("external_url", e.target.value)} />
                  <p className="text-[11px] text-slate-400 mt-1 inline-flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> user จะเปิดลิงก์นี้สมัคร แล้วกด "ฉันสมัครแล้ว" → ขึ้นสถานะรอพิจารณา จากนั้นนำเข้ารายชื่อเพื่อยืนยัน</p>
                </div>
              )}
            </div>

            {/* เปิด/ปิดรับ */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div>
                <div className="font-bold text-sm text-slate-800">สถานะรับสมัคร</div>
                <div className="text-[11px] text-slate-400">เปิดให้ผู้ใช้เห็นและสมัครได้</div>
              </div>
              <button type="button" onClick={() => set("is_open", !f.is_open)}
                className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors ${f.is_open ? "bg-emerald-500" : "bg-slate-300"}`}>
                <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transition-transform ${f.is_open ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
          <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">ยกเลิก</button>
            <button type="submit" disabled={uploading} className="py-3 text-white rounded-xl font-bold shadow-sm shadow-orange-500/20 transition text-sm disabled:opacity-50 bg-[#F15A24] hover:bg-[#c44215] flex items-center justify-center gap-1.5">
              {uploading ? "กำลังอัปโหลด…" : isEdit ? <><Ico.save className="w-4 h-4" /> บันทึกการแก้ไข</> : <><Ico.check className="w-4 h-4" /> ยืนยันเพิ่มวิชา</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
// Modal ดูผู้สมัคร + export CSV จัดกลุ่มธีม
function ParticipantsModal({ course, onClose }) {
  const [regs, setRegs] = useState(null)
  const [err, setErr] = useState(null)
  const [fSchool, setFSchool] = useState("")
  const [fStatus, setFStatus] = useState("")
  const [fSession, setFSession] = useState("")

  useEffect(() => { fetchCourseParticipants(course.id).then(setRegs).catch((e) => setErr(e.message)) }, [course])

  const hasSessions = Array.isArray(course.sessions) && course.sessions.length > 0
  const isTeamCourse = course.count_mode === "team"
  const sessionLabel = (sid) => {
    if (!sid) return ""
    const s = (course.sessions || []).find((x) => x.id === sid)
    return s ? (s.label || "รอบ") : ""
  }

  // แถวรายคน (สำหรับตาราง + filter) — คง reg_id, theme_name เพื่อจัดกลุ่มตอน export
  const allRows = []
  ;(regs || []).forEach((r) => {
    (r.participants || []).forEach((p) => {
      allRows.push({
        reg_id: r.id, theme_name: r.theme_name || "",
        name: p.full_name, school: p.school || "", grade: p.grade_level || "",
        phone: p.phone || "", email: r.submitter_email || "",
        advisor: r.advisors?.[0]?.full_name || "", status: r.status,
        checkedIn: (p.checkins?.length || 0) > 0,
        sessionId: r.session_id || "", sessionName: sessionLabel(r.session_id),
      })
    })
  })

  const schools = [...new Set(allRows.map((r) => r.school).filter(Boolean))].sort()
  const statuses = [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort()
  const rows = allRows.filter((r) => (!fSchool || r.school === fSchool) && (!fStatus || r.status === fStatus) && (!fSession || r.sessionId === fSession))

  // ── จัดกลุ่มทีม (ตาม reg_id) สำหรับ export ──
  // วิชาทีม: reg_id เดียว = ทีมเดียว (สมาชิกหลายคน) · วิชาเดี่ยว: กลุ่มละ 1 คน
  function groupTeams(list) {
    const groups = []
    const byReg = new Map()
    for (const r of list) {
      const key = isTeamCourse && r.reg_id ? `reg:${r.reg_id}` : `solo:${r.reg_id}:${r.name}:${Math.random()}`
      if (!byReg.has(key)) {
        const g = { theme: r.theme_name || "", members: [] }
        byReg.set(key, g); groups.push(g)
      }
      byReg.get(key).members.push(r)
    }
    return groups
  }

  // Export CSV จัดกลุ่มธีม
  // วิชาทีม: จำนวนธีม | ชื่อธีม | ชื่อวิชา | จำนวนคน | ชื่อคน | + ที่เหลือ
  // วิชาเดี่ยว: ตัดคอลัมน์ธีม/จำนวนคน → ชื่อวิชา | ชื่อคน | + ที่เหลือ
  function exportCsv() {
    const restCols = [
      ["โรงเรียน", (r) => r.school],
      ["ระดับชั้น", (r) => r.grade],
      ...(hasSessions ? [["รอบ", (r) => r.sessionName]] : []),
      ["เบอร์โทร", (r) => r.phone],
      ["อีเมลผู้สมัคร", (r) => r.email],
      ["ครูที่ปรึกษา", (r) => r.advisor],
      ["สถานะ", (r) => r.status],
      ["เช็คอิน", (r) => r.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"],
    ]
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
    let header, lines

    if (isTeamCourse) {
      // วิชาทีม — จัดกลุ่มธีม
      header = ["จำนวนธีม", "ชื่อธีม", "ชื่อวิชา", "จำนวนคน", "ชื่อคน", ...restCols.map(([h]) => h)]
      lines = [header.map(esc).join(",")]
      const groups = groupTeams(rows)
      groups.forEach((g, gi) => {
        g.members.forEach((r, mi) => {
          const row = [
            mi === 0 ? gi + 1 : "",           // จำนวนธีม (ครั้งเดียว/ทีม)
            mi === 0 ? g.theme : "",           // ชื่อธีม (แถวแรก)
            mi === 0 ? course.title : "",      // ชื่อวิชา (แถวแรก)
            mi + 1,                            // จำนวนคน (เลขในทีม)
            r.name,                            // ชื่อคน
            ...restCols.map(([, fn]) => fn(r)),
          ]
          lines.push(row.map(esc).join(","))
        })
      })
    } else {
      // วิชาเดี่ยว — ไม่มีคอลัมน์ธีม
      header = ["ลำดับ", "ชื่อวิชา", "ชื่อคน", ...restCols.map(([h]) => h)]
      lines = [header.map(esc).join(",")]
      rows.forEach((r, i) => {
        const row = [i + 1, course.title, r.name, ...restCols.map(([, fn]) => fn(r))]
        lines.push(row.map(esc).join(","))
      })
    }

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `ผู้สมัคร_${course.title}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[85vh] rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">ผู้สมัคร — {course.title}</h3>
            <p className="text-orange-100 text-xs mt-0.5">{rows.length}{rows.length !== allRows.length ? ` / ${allRows.length}` : ""} คน</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40"><Ico.download className="w-3.5 h-3.5" /> Export CSV</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Filter bar */}
        {allRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
            <span className="text-xs text-slate-400 font-bold">กรอง:</span>
            <select value={fSchool} onChange={(e) => setFSchool(e.target.value)} className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F15A24] bg-white text-slate-700 max-w-[140px]">
              <option value="">ทุกโรงเรียน</option>
              {schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F15A24] bg-white text-slate-700 max-w-[140px]">
              <option value="">ทุกสถานะ</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasSessions && (
              <select value={fSession} onChange={(e) => setFSession(e.target.value)} className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F15A24] bg-white text-slate-700 max-w-[140px]">
                <option value="">ทุกรอบ</option>
                {course.sessions.map((s) => <option key={s.id} value={s.id}>{s.label || "รอบ"}</option>)}
              </select>
            )}
            {(fSchool || fStatus || fSession) && (
              <button onClick={() => { setFSchool(""); setFStatus(""); setFSession("") }} className="text-xs text-[#F15A24] font-bold hover:underline">ล้างตัวกรอง</button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {err ? <div className="py-16 text-center text-slate-400">โหลดไม่สำเร็จ: {err}</div>
            : regs === null ? <div className="py-16 text-center text-slate-400">กำลังโหลด…</div>
            : allRows.length === 0 ? <div className="py-16 text-center text-slate-400">ยังไม่มีผู้สมัคร</div>
            : rows.length === 0 ? <div className="py-16 text-center text-slate-400">ไม่พบผู้สมัครตามตัวกรอง</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-100">
                  <tr className="text-[10px] text-slate-400 uppercase">
                    {isTeamCourse && <th className="px-4 py-3 text-left">ธีม</th>}
                    <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left">โรงเรียน</th>
                    {hasSessions && <th className="px-4 py-3 text-left">รอบ</th>}
                    <th className="px-4 py-3 text-left">เบอร์โทร</th>
                    <th className="px-4 py-3 text-left">สถานะ</th>
                    <th className="px-4 py-3 text-center">เช็คอิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      {isTeamCourse && <td className="px-4 py-3 text-slate-600 max-w-[160px]"><span className="line-clamp-1 text-[11px] font-medium text-[#F15A24]">{r.theme_name || "—"}</span></td>}
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.school}</td>
                      {hasSessions && <td className="px-4 py-3">{r.sessionName ? <span className="text-[11px] font-bold bg-orange-50 text-[#F15A24] px-2 py-0.5 rounded-full">{r.sessionName}</span> : <span className="text-slate-300">—</span>}</td>}
                      <td className="px-4 py-3 font-mono text-slate-600">{r.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{r.status}</td>
                      <td className={`px-4 py-3 text-center font-bold ${r.checkedIn ? "text-emerald-600" : "text-slate-300"}`}>{r.checkedIn ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}