import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import {
  fetchAllEvents, fetchCourseTypes, fetchCoursesAdmin, saveCourse, deleteCourse,
  toggleCourseOpen, updateCapacity, emergencyCloseAll, fetchCourseParticipants,
  uploadCourseAsset, duplicateCourses, recalcAllSeats,
} from "../../lib/supabase.js"
import { useDialog } from "../../lib/dialog.jsx"

// จัดการรายวิชา — Tailwind ตาม doc 18 (คง logic เดิมจาก AdminPanel)
export default function AdminCourses() {
  const { event } = useOutletContext()
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

  async function doRecalc() {
    try { await recalcAllSeats(); toast("คำนวณจำนวนผู้สมัครใหม่เรียบร้อย", "success"); loadCourses(selEvent) }
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
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">กำลังโหลดรายวิชา...</span>
        </div>
      </div>
    )
  }

  return (
    <div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3 leading-tight">จัดการรายวิชา</h1>
          <p className="text-sm text-gray-400 pl-3 mt-0.5">{courses.length} รายวิชา</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openAdd} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-sm transition text-sm">
            ➕ เพิ่มวิชาใหม่
          </button>
          <button onClick={() => setShowDup(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-sm transition text-sm">
            📋 คัดลอกจากงานเก่า
          </button>
          <button onClick={doRecalc} className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-violet-700 shadow-sm transition text-sm">
            🔄 ซิงค์จำนวนผู้สมัคร
          </button>
          <button onClick={doEmergency} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-red-700 shadow-sm transition text-sm border-2 border-red-400">
            🚨 ปิดรับทั้งหมด
          </button>
        </div>
      </div>

      {/* Search + filter (เลือกปีงานจาก header bar ด้านบน) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาวิชา…"
            className="w-full pl-3 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100" />
        </div>
        <div className="flex gap-1.5">
          {[["all", "ทั้งหมด"], ["open", "เปิดรับ"], ["closed", "ปิดรับ"]].map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${statusFilter === k ? "bg-[#F15A24] text-white border-[#F15A24]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-[#fff5f0] to-[#fff9f6] border-b border-orange-100">
              <th className="px-5 py-3.5 text-xs font-bold text-[#F15A24] uppercase">วิชา / รายละเอียด</th>
              <th className="px-5 py-3.5 text-xs font-bold text-[#F15A24] uppercase text-center">ที่นั่ง</th>
              <th className="px-5 py-3.5 text-xs font-bold text-[#F15A24] uppercase text-center">รับสมัคร</th>
              <th className="px-5 py-3.5 text-xs font-bold text-[#F15A24] uppercase text-center">จำนวนสูงสุด</th>
              <th className="px-5 py-3.5 text-xs font-bold text-[#F15A24] uppercase text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((course) => <CourseRow key={course.id} course={course} onEdit={openEdit} onDelete={doDelete} onToggle={doToggle} onCapacity={doCapacity} onView={setViewCourse} />)}
            {filtered.length === 0 && <tr><td colSpan="5" className="py-16 text-center text-sm text-gray-400">ไม่พบรายวิชา</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map((course) => <CourseCardMobile key={course.id} course={course} onEdit={openEdit} onDelete={doDelete} onToggle={doToggle} onCapacity={doCapacity} onView={setViewCourse} />)}
        {filtered.length === 0 && <div className="bg-white rounded-2xl p-12 text-center text-sm text-gray-400 shadow-sm border border-gray-200">ไม่พบรายวิชา</div>}
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-blue-600 px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">📋 คัดลอกวิชาจากงานเก่า</h3>
            <p className="text-blue-100 text-xs mt-0.5">เลือกงานต้นทาง แล้วเลือกวิชาที่จะคัดลอกมางานปัจจุบัน</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
        </div>

        <div className="p-5 shrink-0 border-b border-gray-100">
          <label className="text-xs font-bold text-gray-500 block mb-1.5">เลือกงานต้นทาง</label>
          <select value={fromEvent} onChange={(e) => loadFrom(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 bg-gray-50 focus:bg-white focus:border-[#F15A24] outline-none">
            <option value="">— เลือกงาน —</option>
            {otherEvents.map((e) => <option key={e.id} value={e.id}>{e.name} {e.year}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {!fromEvent ? <div className="py-12 text-center text-gray-400 text-sm">เลือกงานต้นทางก่อน</div>
            : loading ? <div className="py-12 text-center text-gray-400 text-sm">กำลังโหลด…</div>
            : list.length === 0 ? <div className="py-12 text-center text-gray-400 text-sm">งานนี้ไม่มีวิชา</div>
            : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400">{pickedIds.length} / {list.length} วิชา</span>
                  <button onClick={toggleAll} className="text-xs text-[#F15A24] font-bold hover:underline">{list.every((c) => picked[c.id]) ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}</button>
                </div>
                <div className="space-y-2">
                  {list.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${picked[c.id] ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-100 hover:border-gray-300"}`}>
                      <input type="checkbox" checked={!!picked[c.id]} onChange={() => toggle(c.id)} className="w-4 h-4 accent-blue-600" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-800 text-sm truncate">{c.title}</div>
                        <div className="text-xs text-gray-400">{c.course_types?.label || "—"} · {c.price > 0 ? `฿${c.price}` : "ไม่มีค่าลงทะเบียน"} · รับ {c.capacity}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
        </div>

        <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-3 shrink-0">
          <button onClick={onClose} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
          <button onClick={doCopy} disabled={saving || pickedIds.length === 0} className="py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition text-sm disabled:opacity-50">{saving ? "กำลังคัดลอก…" : `คัดลอก ${pickedIds.length} วิชา`}</button>
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

function CourseRow({ course, onEdit, onDelete, onToggle, onCapacity, onView }) {
  const { taken, cap, pct, isFull } = seatInfo(course)
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const typeLabel = course.course_types?.label
  return (
    <tr className="hover:bg-gray-50/60 transition group">
      <td className="px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
            {course.image_url
              ? <img src={course.image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">📚</div>}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-gray-800 text-sm leading-snug">{course.title}</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {typeLabel && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-md font-bold">{typeLabel}</span>}
              {instructors.length > 0 && <span className="text-[10px] bg-gray-50 text-gray-500 border border-gray-100 px-1.5 py-0.5 rounded-md">👨‍🏫 {instructors.join(", ")}</span>}
              <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-md">{modeLabel(course)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1 font-bold">{course.price > 0 ? `฿${Number(course.price).toLocaleString()}` : "ไม่มีค่าลงทะเบียน"}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-sm font-bold ${isFull ? "text-red-600" : "text-gray-700"}`}>{taken} / {cap}</span>
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${isFull ? "bg-red-500" : pct >= 80 ? "bg-orange-400" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-gray-400">{pct}%</span>
        </div>
      </td>
      <td className="px-5 py-4 text-center">
        <button onClick={() => onToggle(course)} className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors ${course.is_open ? "bg-green-500" : "bg-gray-300"}`}>
          <span className={`inline-block w-5 h-5 transform bg-white rounded-full shadow-md transition-transform ${course.is_open ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <div className={`text-[10px] font-bold mt-1 ${course.is_open ? "text-green-600" : "text-gray-400"}`}>{course.is_open ? "เปิดรับ" : "ปิดรับ"}</div>
      </td>
      <td className="px-5 py-4 text-center">
        <input type="number" defaultValue={cap} onBlur={(e) => onCapacity(course, e.target.value)}
          className="w-16 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-bold focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] outline-none" />
      </td>
      <td className="px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={() => onView(course)} className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 text-xs font-bold transition">👁 ผู้สมัคร</button>
          <button onClick={() => onEdit(course)} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1.5 rounded-lg hover:bg-yellow-100 text-xs font-bold transition">✏️</button>
          <button onClick={() => onDelete(course)} className="bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-100 text-xs font-bold transition">🗑️</button>
        </div>
      </td>
    </tr>
  )
}

function modeLabel(course) {
  if (course.count_mode === "team") {
    const mn = course.min_members, mx = course.max_members
    if (mn && mx && mn !== mx) return `👪 ทีม ${mn}-${mx} คน`
    if (course.team_size === 2) return "👥 คู่"
    return `👪 ทีม ${course.team_size || mx || ""} คน`
  }
  return "👤 เดี่ยว"
}

function CourseCardMobile({ course, onEdit, onDelete, onToggle, onView }) {
  const { taken, cap, pct, isFull } = seatInfo(course)
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const unlimited = course.seat_mode === "unlimited"
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <div className="flex gap-3">
        {/* รูป */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
          {course.image_url ? <img src={course.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">📚</div>}
        </div>
        {/* ข้อมูล */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-800 text-base leading-snug">{course.title}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {course.course_types?.label && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-md font-bold">{course.course_types.label}</span>}
            <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-md font-bold">{modeLabel(course)}</span>
          </div>
          {instructors.length > 0 && <div className="text-xs text-gray-500 mt-1.5 truncate">👨‍🏫 {instructors.join(", ")}</div>}
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-lg font-extrabold text-[#F15A24]">{course.price > 0 ? `฿${Number(course.price).toLocaleString()}` : "ไม่มีค่าลงทะเบียน"}</span>
            <span className="text-[11px] text-gray-400">รับ {unlimited ? "ไม่จำกัด" : `${cap} ${course.count_mode === "team" ? "ทีม" : "คน"}`}</span>
          </div>
        </div>
        {/* toggle เปิดรับ */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button onClick={() => onToggle(course)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${course.is_open ? "bg-green-500" : "bg-gray-300"}`}>
            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${course.is_open ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className={`text-[10px] font-bold ${course.is_open ? "text-green-600" : "text-gray-400"}`}>{course.is_open ? "เปิดรับ" : "ปิดรับ"}</span>
        </div>
      </div>

      {/* แถบที่นั่ง — เต็มกว้าง */}
      <div className="mt-3">
        <div className="flex justify-between items-center text-xs mb-1">
          <span className="text-gray-500">ที่นั่ง: <span className={`font-bold ${isFull && !unlimited ? "text-red-600" : "text-gray-700"}`}>{taken} / {unlimited ? "∞" : cap}</span></span>
          {!unlimited && <span className={`font-bold ${isFull ? "text-red-600" : pct >= 80 ? "text-orange-500" : "text-green-600"}`}>{pct}%</span>}
        </div>
        {!unlimited && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${isFull ? "bg-red-500" : pct >= 80 ? "bg-orange-400" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* ปุ่ม ดู/แก้ไข/ลบ — แถวล่างชิดขวา */}
      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => onView(course)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition">👁 ผู้สมัคร</button>
        <button onClick={() => onEdit(course)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-bold hover:bg-yellow-100 transition">✏️ แก้ไข</button>
        <button onClick={() => onDelete(course)} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center text-sm hover:bg-red-100 transition">🗑️</button>
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
      instructor_names: f.instructor_text.split(",").map((s) => s.trim()).filter(Boolean),
    })
  }

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#F15A24] focus:ring-1 focus:ring-[#F15A24] text-sm transition"
  const labelCls = "text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[90vh] rounded-t-2xl">
        <div className={`${isEdit ? "bg-yellow-500" : "bg-[#F15A24]"} px-5 py-4 flex justify-between items-center shrink-0`}>
          <h3 className="font-bold text-white text-base">{isEdit ? "✏️ แก้ไขรายวิชา" : "➕ เพิ่มรายวิชาใหม่"}</h3>
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
              <div><label className={labelCls}>ระยะเวลา <span className="text-[10px] text-gray-400 font-normal">(คำนวณอัตโนมัติ)</span></label><input className={inputCls} placeholder="เช่น 5 วัน" value={f.duration || ""} onChange={(e) => set("duration", e.target.value)} /></div>
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
              <div><label className={labelCls}>Base ID (รหัสนำหน้าเลขประจำตัว)</label><input type="text" className={inputCls} placeholder="เช่น GAME, MUSIC, CODE" value={f.base_id || ""} onChange={(e) => set("base_id", e.target.value.toUpperCase())} /><p className="text-[11px] text-gray-400 mt-1">💡 ควรตั้งให้<b>ต่างกันทุกคอร์ส</b> เพื่อแยกรหัสนักเรียน เช่น GAME-001, MUSIC-001</p></div>
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
                  <option value="single">👤 เดี่ยว (1 คน)</option>
                  <option value="pair">👥 คู่ (2 คน)</option>
                  <option value="team">👪 ทีม (ช่วงจำนวนคน)</option>
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
            {f.count_choice === "team" && <p className="text-[11px] text-gray-400 -mt-2">💡 เช่น ต่ำสุด 1 มากสุด 4 → 1 ทีมมี 1-4 คนก็ได้ (ยืดหยุ่น)</p>}

            {/* การชำระเงิน */}
            <div>
              <label className={labelCls}>การรับชำระเงิน</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set("pay_mode", "paid")}
                  className={`p-3 rounded-xl border-2 text-left transition ${f.pay_mode === "paid" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="font-bold text-sm text-gray-800">💰 เสียเงิน</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">อัปสลิป → กันที่นั่งทันที</div>
                </button>
                <button type="button" onClick={() => set("pay_mode", "free")}
                  className={`p-3 rounded-xl border-2 text-left transition ${f.pay_mode === "free" ? "border-[#F15A24] bg-orange-50/40 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <div className="font-bold text-sm text-gray-800">🆓 ไม่เสียเงิน</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">สมัคร → แอดมินอนุมัติ</div>
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
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-gray-800">📎 ต้องแนบลิงก์ผลงาน</div>
                  <div className="text-[11px] text-gray-400">เปิดถ้าให้ผู้สมัครส่งลิงก์ผลงาน (เช่น การแข่งขัน)</div>
                </div>
                <button type="button" onClick={() => set("require_portfolio", !f.require_portfolio)}
                  className={`relative inline-flex items-center h-7 rounded-full w-12 shrink-0 transition-colors ${f.require_portfolio ? "bg-[#F15A24]" : "bg-gray-300"}`}>
                  <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transition-transform ${f.require_portfolio ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {f.require_portfolio && (
                <div className="mt-3">
                  <label className={labelCls}>หัวข้อ/คำอธิบายให้ผู้สมัคร</label>
                  <input className={inputCls} placeholder="เช่น แนบลิงก์ผลงาน (Google Drive / YouTube / Behance)" value={f.portfolio_label || ""} onChange={(e) => set("portfolio_label", e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">ข้อความนี้จะแสดงให้ผู้สมัครเห็นตอนกรอกลิงก์</p>
                </div>
              )}
            </div>

            {/* 5. รูปภาพประกอบ */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
              <label className="text-xs font-black text-blue-700 uppercase tracking-wide block mb-2">📸 รูปภาพประกอบ (อัปหลายรูปได้)</label>
              <input type="file" multiple accept="image/*" onChange={handleImageFiles} disabled={uploading}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 mb-3 disabled:opacity-50" />
              <div className="flex flex-wrap gap-2">
                {(f.image_urls || []).map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    <button type="button" onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow hover:bg-red-600">×</button>
                    {idx === 0 && <span className="absolute bottom-0 inset-x-0 bg-[#F15A24] text-white text-[8px] text-center rounded-b-lg">ปก</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* 6. QR ไลน์กลุ่ม */}
            <div className="bg-green-50/50 border border-green-100 rounded-xl p-4">
              <label className="text-xs font-black text-green-700 uppercase tracking-wide block mb-2">📲 QR ไลน์กลุ่ม (ถ้ามี)</label>
              <input type="file" accept="image/*" onChange={handleQrFile} disabled={uploading}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-green-100 file:text-green-700 disabled:opacity-50" />
              {f.line_qr_url && <img src={f.line_qr_url} alt="QR" className="h-20 w-auto rounded-lg border border-green-300 mt-2" />}
            </div>

            {/* 7. คำอธิบายย่อ */}
            <div><label className={labelCls}>คำอธิบายย่อ</label><textarea rows="2" className={`${inputCls} resize-none`} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></div>

            {/* 8. เนื้อหาครบถ้วน — แบ่งหัวข้อย่อย */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + " !mb-0"}>เนื้อหาครบถ้วน (แบ่งเป็นหัวข้อได้)</label>
                <button type="button" onClick={addSection} className="text-xs font-bold text-[#F15A24] hover:text-orange-600 flex items-center gap-1">
                  ＋ เพิ่มหัวข้อ
                </button>
              </div>
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 relative">
                    {sections.length > 1 && (
                      <button type="button" onClick={() => removeSection(idx)}
                        className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-red-50 text-red-500 border border-red-200 flex items-center justify-center text-xs hover:bg-red-100">×</button>
                    )}
                    <input className={`${inputCls} font-bold mb-2`} placeholder={`หัวข้อ ${idx + 1} (เช่น รายละเอียดวิชา / ประโยชน์ / กิจกรรม)`}
                      value={sec.heading} onChange={(e) => updateSection(idx, "heading", e.target.value)} />
                    <textarea rows="3" className={`${inputCls} resize-none`} placeholder="รายละเอียดของหัวข้อนี้…"
                      value={sec.body} onChange={(e) => updateSection(idx, "body", e.target.value)} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">💡 เว้นว่างได้ถ้าไม่ต้องการ · หัวข้อจะแสดงเป็นหมวดในหน้ารายละเอียดวิชา</p>
            </div>

            {/* เปิด/ปิดรับ */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div>
                <div className="font-bold text-sm text-gray-800">สถานะรับสมัคร</div>
                <div className="text-[11px] text-gray-400">เปิดให้ผู้ใช้เห็นและสมัครได้</div>
              </div>
              <button type="button" onClick={() => set("is_open", !f.is_open)}
                className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors ${f.is_open ? "bg-green-500" : "bg-gray-300"}`}>
                <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transition-transform ${f.is_open ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
          <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3 border-t border-gray-100 shrink-0">
            <button type="button" onClick={onClose} className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">ยกเลิก</button>
            <button type="submit" disabled={uploading} className={`py-3 text-white rounded-xl font-bold shadow-sm transition text-sm disabled:opacity-50 ${isEdit ? "bg-yellow-500 hover:bg-yellow-600" : "bg-[#F15A24] hover:bg-orange-600"}`}>
              {uploading ? "กำลังอัปโหลด…" : isEdit ? "💾 บันทึกการแก้ไข" : "✅ ยืนยันเพิ่มวิชา"}
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
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `ผู้สมัคร_${course.title}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[85vh] rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#F15A24] to-[#e04510] px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">ผู้สมัคร — {course.title}</h3>
            <p className="text-orange-100 text-xs mt-0.5">{rows.length}{rows.length !== allRows.length ? ` / ${allRows.length}` : ""} คน</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40">⬇ Export CSV</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Filter bar */}
        {allRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="text-xs text-gray-400 font-bold">กรอง:</span>
            <select value={fSchool} onChange={(e) => setFSchool(e.target.value)} className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F15A24] bg-white text-gray-700 max-w-[140px]">
              <option value="">ทุกโรงเรียน</option>
              {schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#F15A24] bg-white text-gray-700 max-w-[140px]">
              <option value="">ทุกสถานะ</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {(fSchool || fStatus) && (
              <button onClick={() => { setFSchool(""); setFStatus("") }} className="text-xs text-[#F15A24] font-bold hover:underline">ล้างตัวกรอง</button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {err ? <div className="py-16 text-center text-gray-400">โหลดไม่สำเร็จ: {err}</div>
            : regs === null ? <div className="py-16 text-center text-gray-400">กำลังโหลด…</div>
            : allRows.length === 0 ? <div className="py-16 text-center text-gray-400">ยังไม่มีผู้สมัคร</div>
            : rows.length === 0 ? <div className="py-16 text-center text-gray-400">ไม่พบผู้สมัครตามตัวกรอง</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 border-b border-gray-100">
                  <tr className="text-[10px] text-gray-400 uppercase">
                    <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left">โรงเรียน</th>
                    <th className="px-4 py-3 text-left">เบอร์โทร</th>
                    <th className="px-4 py-3 text-left">สถานะ</th>
                    <th className="px-4 py-3 text-center">เช็คอิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.school}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{r.phone}</td>
                      <td className="px-4 py-3 text-gray-600">{r.status}</td>
                      <td className={`px-4 py-3 text-center font-bold ${r.checkedIn ? "text-green-600" : "text-gray-300"}`}>{r.checkedIn ? "✓" : "—"}</td>
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