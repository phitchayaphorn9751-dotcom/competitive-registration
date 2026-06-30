import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchAllEvents, fetchCourseTypes, fetchCoursesAdmin, saveCourse, deleteCourse,
  toggleCourseOpen, updateCapacity, emergencyCloseAll, fetchCourseParticipants,
  uploadCourseAsset, duplicateCourses,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"
import { Ico } from "../../lib/icons.jsx"

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
    image_urls: [], line_qr_url: "",
    type_id: types[0]?.id || "", count_mode: "person", team_size: 2,
    min_members: 1, max_members: 1,
    capacity: 30, price: 0, is_open: true,
    seat_mode: "limited", require_portfolio: false,
    bank_account: "", bank_name: "", bank_holder: "",
    base_id: "", level: "", start_date: "", end_date: "", duration: "",
    external_url: "",
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <Ico.book className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">จัดการรายวิชา</h1>
            <p className="text-slate-400 text-xs mt-0.5">{courses.length} รายวิชา</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openAdd} className="flex items-center gap-1.5 bg-[#F15A24] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-[#c44215] shadow-sm shadow-orange-500/20 transition text-sm">
            <Ico.plus className="w-4 h-4" /> เพิ่มวิชาใหม่
          </button>
          <button onClick={() => setShowDup(true)} className="flex items-center gap-1.5 bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 shadow-sm transition text-sm">
            <Ico.copy className="w-4 h-4" /> คัดลอกจากงานเก่า
          </button>
          <button onClick={doEmergency} className="flex items-center gap-1.5 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 shadow-sm transition text-sm">
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

      {/* Course cards — รูปซ้าย 1/3 + ข้อมูลขวา 2/3 (เดสก์ท็อป) */}
      <div className="hidden md:grid grid-cols-1 gap-4">
        {filtered.map((course) => <CourseCardWide key={course.id} course={course} onEdit={openEdit} onDelete={doDelete} onToggle={doToggle} onView={setViewCourse} />)}
        {filtered.length === 0 && <div className="bg-white rounded-2xl p-16 text-center text-sm text-slate-400 shadow-sm border border-slate-100">ไม่พบรายวิชา</div>}
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

// สีหมวดหมู่ — กระจายสีตามชื่อหมวด (หมวดเดียวกันได้สีเดิมเสมอ) สไตล์เดียวกับหน้ารายการสมัคร
const CATEGORY_PALETTE = [
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-sky-100",    text: "text-sky-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-pink-100",   text: "text-pink-700" },
  { bg: "bg-cyan-100",   text: "text-cyan-700" },
  { bg: "bg-amber-100",  text: "text-amber-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-teal-100",   text: "text-teal-700" },
  { bg: "bg-rose-100",   text: "text-rose-700" },
]
function categoryCfg(name) {
  if (!name) return CATEGORY_PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]
}

function CourseCardWide({ course, onEdit, onDelete, onToggle, onView }) {
  const { taken, cap, pct, isFull } = seatInfo(course)
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const typeLabel = course.course_types?.label
  const cc = categoryCfg(typeLabel)
  const unlimited = course.seat_mode === "unlimited"
  return (
    <div className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-orange-200 transition-all duration-300 flex flex-col">
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {/* แถวบน: (ซ้าย) รูป + ป้าย/ชื่อวิชา  ·  (ขวา) toggle เหนือราคา */}
        <div className="flex items-start gap-3">
          {/* รูปเล็กซ้าย */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
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
            <h3 className="font-bold text-[#F15A24] text-sm sm:text-[15px] leading-snug">{course.title}</h3>
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
                ? <span className="text-base sm:text-xl font-extrabold text-[#F15A24] leading-none whitespace-nowrap">{Number(course.price).toLocaleString()}<span className="text-[10px] font-bold text-slate-400 ml-1">บาท</span></span>
                : <span className="text-sm font-extrabold text-emerald-600 whitespace-nowrap">ฟรี</span>}
            </div>
          </div>
        </div>

        {/* แถวล่าง: (ซ้าย) แถบที่นั่ง  |  (ขวา) ปุ่ม action — มีเส้นเทากั้น */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4">
          {/* ซ้าย: แถบที่นั่ง */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="text-slate-500">ที่นั่ง: <span className={`font-bold ${isFull && !unlimited ? "text-rose-600" : "text-slate-700"}`}>{taken} / {unlimited ? "∞" : cap}</span></span>
              {!unlimited && <span className={`font-bold ${isFull ? "text-rose-500" : pct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{pct}%</span>}
            </div>
            {!unlimited ? (
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${pct}%` }} />
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">รับสมัครไม่จำกัดจำนวน</div>
            )}
          </div>

          {/* เส้นกั้น */}
          <div className="w-px self-stretch bg-slate-200 shrink-0" />

          {/* ขวา: ปุ่ม action */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onView(course)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition border border-slate-200/60"><Ico.eye className="w-4 h-4" /> ผู้สมัคร</button>
            <button onClick={() => onEdit(course)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#F15A24] bg-orange-50 hover:bg-[#F15A24] hover:text-white rounded-xl transition border border-orange-100"><Ico.pencil className="w-4 h-4 shrink-0" /> แก้ไข</button>
            <button onClick={() => onDelete(course)} className="p-2 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white transition shrink-0" aria-label="ลบรายวิชา"><Ico.trash className="w-4 h-4" /></button>
          </div>
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
  const cc = categoryCfg(typeLabel)
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
          {/* ป้ายกำกับ: หมวด · รูปแบบ (ใช้ categoryCfg เหมือน desktop) */}
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
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="text-slate-500">ที่นั่ง: <span className={`font-bold ${isFull && !unlimited ? "text-rose-600" : "text-slate-700"}`}>{taken} / {unlimited ? "∞" : cap}</span></span>
            {!unlimited && <span className={`font-bold ${isFull ? "text-rose-500" : pct >= 80 ? "text-amber-500" : "text-[#F15A24]"}`}>{pct}%</span>}
          </div>
          {!unlimited ? (
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-gradient-to-r from-rose-500 to-rose-600" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#fb923c] to-[#F15A24]"}`} style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">ไม่จำกัด</div>
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
            {/* ช่องย่อย: จำนวนทีม / จำนวนที่รับ */}
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
                    <label className={labelCls}>{f.count_choice === "single" ? "รับกี่คน" : "รับกี่ทีม"}</label>
                    <input type="number" min={0} className={inputCls} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} />
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

            {/* 6. QR ไลน์กลุ่ม */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
              <label className="text-xs font-black text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Ico.qr className="w-4 h-4" /> QR ไลน์กลุ่ม (ถ้ามี)</label>
              <input type="file" accept="image/*" onChange={handleQrFile} disabled={uploading}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-700 disabled:opacity-50" />
              {f.line_qr_url && <img src={f.line_qr_url} alt="QR" className="h-20 w-auto rounded-lg border border-emerald-300 mt-2" />}
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
                    {sections.length > 1 && (
                      <button type="button" onClick={() => removeSection(idx)}
                        className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-rose-50 text-rose-500 border border-rose-200 flex items-center justify-center text-xs hover:bg-rose-100">×</button>
                    )}
                    <input className={`${inputCls} font-bold mb-2`} placeholder={`หัวข้อ ${idx + 1} (เช่น รายละเอียดวิชา / ประโยชน์ / กิจกรรม)`}
                      value={sec.heading} onChange={(e) => updateSection(idx, "heading", e.target.value)} />
                    <textarea rows="3" className={`${inputCls} resize-none`} placeholder="รายละเอียดของหัวข้อนี้…"
                      value={sec.body} onChange={(e) => updateSection(idx, "body", e.target.value)} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 inline-flex items-start gap-1"><Ico.alert className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> เว้นว่างได้ถ้าไม่ต้องการ · หัวข้อจะแสดงเป็นหมวดในหน้ารายละเอียดวิชา</p>
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
// Modal ดูผู้สมัคร + export CSV (คง logic เดิม)
function ParticipantsModal({ course, onClose }) {
  const [regs, setRegs] = useState(null)
  const [err, setErr] = useState(null)
  const [fSchool, setFSchool] = useState("")
  const [fStatus, setFStatus] = useState("")

  useEffect(() => { fetchCourseParticipants(course.id).then(setRegs).catch((e) => setErr(e.message)) }, [course])

  const allRows = []
  ;(regs || []).forEach((r) => {
    (r.participants || []).forEach((p) => {
      allRows.push({
        name: p.full_name, school: p.school || "", grade: p.grade_level || "",
        phone: p.phone || "", email: r.submitter_email || "",
        advisor: r.advisors?.[0]?.full_name || "", status: r.status,
        checkedIn: (p.checkins?.length || 0) > 0,
      })
    })
  })

  const schools = [...new Set(allRows.map((r) => r.school).filter(Boolean))].sort()
  const statuses = [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort()
  const rows = allRows.filter((r) => (!fSchool || r.school === fSchool) && (!fStatus || r.status === fStatus))

  function exportCsv() {
    const headers = ["คอร์ส", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมลผู้สมัคร", "ครูที่ปรึกษา", "สถานะ", "เช็คอิน"]
    const lines = [headers.join(",")]
    rows.forEach((r) => {
      const vals = [course.title, r.name, r.school, r.grade, r.phone, r.email, r.advisor, r.status, r.checkedIn ? "เช็คอินแล้ว" : "ยังไม่"]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
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
            {(fSchool || fStatus) && (
              <button onClick={() => { setFSchool(""); setFStatus("") }} className="text-xs text-[#F15A24] font-bold hover:underline">ล้างตัวกรอง</button>
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
                    <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left">โรงเรียน</th>
                    <th className="px-4 py-3 text-left">เบอร์โทร</th>
                    <th className="px-4 py-3 text-left">สถานะ</th>
                    <th className="px-4 py-3 text-center">เช็คอิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.school}</td>
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