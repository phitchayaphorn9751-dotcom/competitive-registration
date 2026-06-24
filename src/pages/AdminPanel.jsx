import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  getSession, isAdminUser, isSuperAdmin, signOut,
  fetchRegistrations, confirmRegistration, releaseSeat,
  fetchAllEvents, saveEvent, fetchCourseTypes,
  fetchCoursesAdmin, saveCourse, deleteCourse,
  toggleCourseOpen, updateCapacity, emergencyCloseAll,
  fetchDashboardStats, fetchAttendanceByCourse,
  fetchCourseParticipants,
  listAdmins, addAdmin, removeAdmin,
  fetchSettings, updateSettings,
} from "../lib/supabase.js"
import { LangToggle } from "../lib/i18n.jsx"
import AdminCourses from "./admin/AdminCourses.jsx"
import AdminApplicants from "./admin/AdminApplicants.jsx"
import AdminDashboard from "./admin/AdminDashboard.jsx"

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "▦" },
  { key: "regs", label: "จัดการการสมัคร", icon: "👥" },
  { key: "users", label: "จัดการผู้ใช้งาน", icon: "👤", superOnly: true },
  { key: "courses", label: "จัดการรายวิชา", icon: "⚙" },
  { key: "checkin", label: "จุดสแกน (Check-In)", icon: "▣", route: "/checkin" },
  { key: "attendance", label: "สรุปการมาเรียน", icon: "▤" },
  { key: "settings", label: "ตั้งค่าเว็บ", icon: "⚙" },
]

export default function AdminPanel() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [isSuper, setIsSuper] = useState(false)
  const [event, setEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [view, setView] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 900 : true
  )

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 900)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) { navigate("/login"); return }
      if (!(await isAdminUser())) { await signOut(); navigate("/login"); return }
      setSession(s)
      setIsSuper(await isSuperAdmin())
      const evs = await fetchAllEvents()
      setEvents(evs || [])
      setEvent(evs?.[0] || null)
    })
  }, [navigate])

  async function handleLogout() {
    await signOut()
    navigate("/login")
  }

  function go(item) {
    if (item.route) { navigate(item.route); return }
    setView(item.key)
    setSidebarOpen(false)
  }

  if (!session) return null

  const visibleNav = NAV.filter((n) => !n.superOnly || isSuper)
  const showSidebar = isDesktop || sidebarOpen

  return (
    <div style={st.shell}>
      {sidebarOpen && !isDesktop && <div style={st.overlay} onClick={() => setSidebarOpen(false)} />}
      <aside style={{ ...st.sidebar, ...(showSidebar ? st.sidebarOpen : {}), ...(isDesktop ? st.sidebarStatic : {}) }}>
        <div style={st.brandBox}>
          <div style={st.brandIcon}>🎓</div>
          <div>
            <div style={st.brandTitle}>ADMIN PANEL</div>
            <div style={st.brandTag}>{event ? `${event.name} ${event.year}` : "—"}</div>
          </div>
        </div>
        <div style={st.navLabel}>เมนูหลัก</div>
        <nav>
          {visibleNav.map((item) => (
            <button
              key={item.key}
              style={{ ...st.navItem, ...(view === item.key ? st.navActive : {}) }}
              onClick={() => go(item)}
            >
              <span style={st.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button style={st.logoutBtn} onClick={handleLogout}>⎋ ออกจากระบบ</button>
      </aside>

      <div style={{ ...st.contentWrap, ...(isDesktop ? { marginLeft: SIDEBAR_W } : {}) }}>
        <header style={st.topbar}>
          {!isDesktop && <button style={st.hamburger} onClick={() => setSidebarOpen(true)}>☰</button>}
          <div style={st.crumb}>
            <span style={st.crumbRoot}>Admin</span>
            <span style={st.crumbSep}>/</span>
            <span>{NAV.find((n) => n.key === view)?.label}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {events.length > 1 && (
              <select
                style={st.eventSwitch}
                value={event?.id || ""}
                onChange={(e) => setEvent(events.find((x) => x.id === e.target.value))}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name} {ev.year}</option>
                ))}
              </select>
            )}
            <LangToggle style={{ background: "var(--orange)", borderColor: "var(--orange)" }} />
          </div>
        </header>

        <main style={st.main}>
          {view === "dashboard" && <AdminDashboard event={event} />}
          {view === "regs" && <AdminApplicants session={session} />}
          {view === "users" && <UserManagement />}
          {view === "courses" && <AdminCourses event={event} />}
          {view === "attendance" && <Attendance event={event} />}
          {view === "settings" && <SiteSettings />}
        </main>
      </div>
    </div>
  )
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ event }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!event) { setLoading(false); return }
    setLoading(true)
    fetchDashboardStats(event.id)
      .then(setStats)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [event])

  if (!event) return <Empty>ยังไม่มีงาน — สร้างงานในเมนู “จัดการรายวิชา”</Empty>
  if (loading) return <Empty>กำลังโหลด…</Empty>
  if (err) return (
    <Empty>
      โหลด Dashboard ไม่สำเร็จ: {err}
      <div style={{ fontSize: 13, marginTop: 8 }}>
        ถ้าเพิ่งติดตั้ง อาจยังไม่ได้รัน admin_features.sql ใน Supabase
      </div>
    </Empty>
  )
  if (!stats) return <Empty>ยังไม่มีข้อมูลสรุป</Empty>

  const fillPct = stats.total_capacity > 0
    ? Math.round((stats.total_taken / stats.total_capacity) * 100) : 0

  const cards = [
    { label: "คอร์สทั้งหมด", value: stats.total_courses, sub: `เปิดรับ ${stats.open_courses}`, color: "var(--orange)" },
    { label: "ที่นั่งถูกจอง", value: `${stats.total_taken}/${stats.total_capacity}`, sub: `${fillPct}% เต็ม`, color: "#1971c2" },
    { label: "การสมัครทั้งหมด", value: stats.total_registrations, sub: `ยืนยันแล้ว ${stats.confirmed}`, color: "#2f9e44" },
    { label: "รอดำเนินการ", value: stats.pending, sub: `คิวสำรอง ${stats.waitlist}`, color: "var(--amber)" },
    { label: "ผู้เข้าร่วม", value: stats.total_participants, sub: `เช็คอินแล้ว ${stats.checked_in}`, color: "#7048e8" },
    { label: "รายได้ (ยืนยันแล้ว)", value: `฿${(stats.total_revenue || 0).toLocaleString()}`, sub: "จากสลิปที่ตรวจแล้ว", color: "#c44a08" },
  ]

  return (
    <div>
      <PageTitle title="Dashboard" subtitle={`ภาพรวม ${event.name} ${event.year}`} />
      <div style={st.statGrid}>
        {cards.map((c) => (
          <div key={c.label} style={st.statCard}>
            <div style={{ ...st.statBar, background: c.color }} />
            <div style={st.statLabel}>{c.label}</div>
            <div style={st.statValue}>{c.value}</div>
            <div style={st.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// REGISTRATIONS
// ============================================================
function Registrations({ session }) {
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setRegs(await fetchRegistrations() || [])
    } catch (e) { setMsg("โหลดข้อมูลไม่สำเร็จ: " + e.message) }
    finally { setLoading(false) }
  }

  async function handleConfirm(id) {
    try { await confirmRegistration(id, session.user.id); setMsg("ยืนยันแล้ว ออก QR เรียบร้อย"); load() }
    catch (e) { setMsg("ยืนยันไม่สำเร็จ: " + e.message) }
  }

  async function handleRelease(id) {
    if (!confirm("คืนที่นั่งรายการนี้? (ใช้ตอนตีกลับ/ยกเลิก/รีฟันด์)")) return
    try { await releaseSeat(id); setMsg("คืนที่นั่งเรียบร้อย"); load() }
    catch (e) { setMsg("คืนที่นั่งไม่สำเร็จ: " + e.message) }
  }

  const FILTERS = ["all", "pending_payment", "slip_uploaded", "submitted", "confirmed", "approved", "waitlist", "expired"]
  const filtered = filter === "all" ? regs : regs.filter((r) => r.status === filter)

  return (
    <div>
      <PageTitle title="จัดการการสมัคร" subtitle={`${regs.length} รายการ`} />
      {msg && <Banner onClose={() => setMsg(null)}>{msg}</Banner>}
      <div style={st.chipRow}>
        {FILTERS.map((f) => (
          <button key={f}
            style={{ ...st.chip, ...(filter === f ? st.chipActive : {}) }}
            onClick={() => setFilter(f)}>
            {statusLabel(f)}{f !== "all" && ` (${regs.filter((r) => r.status === f).length})`}
          </button>
        ))}
      </div>
      {loading ? <Empty>กำลังโหลด…</Empty>
        : filtered.length === 0 ? <Empty>ไม่มีรายการในสถานะนี้</Empty>
        : <div style={st.cardGrid}>
            {filtered.map((r) => <RegCard key={r.id} reg={r} onConfirm={handleConfirm} onRelease={handleRelease} />)}
          </div>}
    </div>
  )
}

function RegCard({ reg, onConfirm, onRelease }) {
  const payment = reg.payments?.[0]
  const advisors = reg.advisors || []
  const canConfirm = ["slip_uploaded", "submitted", "approved"].includes(reg.status)
  const canRelease = ["confirmed", "approved", "pending_payment", "slip_uploaded"].includes(reg.status)
  const checkedIn = reg.participants?.filter((p) => (p.checkins?.length || 0) > 0).length || 0
  const total = reg.participants?.length || 0

  return (
    <div style={st.regCard}>
      <div style={st.regTop}>
        <div>
          <div style={st.regCourse}>{reg.courses?.title || "—"}</div>
          <div style={st.regEmail}>{reg.submitter_email}</div>
        </div>
        <span style={{ ...st.badge, background: statusColor(reg.status) }}>
          {statusLabel(reg.status)}{reg.status === "waitlist" && reg.waitlist_pos ? ` #${reg.waitlist_pos}` : ""}
        </span>
      </div>
      <div style={st.regParts}>
        {reg.participants?.map((p) => (
          <div key={p.id} style={st.regPartRow}>
            <span>{(p.checkins?.length || 0) > 0 && <span style={st.check}>✓ </span>}{p.full_name}</span>
            <span style={st.regSchool}>{p.school || ""}</span>
          </div>
        ))}
      </div>
      {advisors.length > 0 && (
        <div style={st.advisor}>ครูที่ปรึกษา: <b>{advisors.map((a) => a.full_name).join(", ")}</b></div>
      )}
      {(reg.status === "confirmed" || reg.status === "approved") && (
        <div style={st.checkinInfo}>เช็คอินแล้ว {checkedIn}/{total} คน</div>
      )}
      {payment?.slip_url && (
        <a href={payment.slip_url} target="_blank" rel="noreferrer" style={st.slip}>
          ดูสลิป (฿{payment.amount?.toLocaleString()})
        </a>
      )}
      <div style={st.regActions}>
        {canConfirm && <button style={st.btnGreen} onClick={() => onConfirm(reg.id)}>ยืนยัน + ออก QR</button>}
        {canRelease && <button style={st.btnOutline} onClick={() => onRelease(reg.id)}>คืนที่นั่ง</button>}
      </div>
    </div>
  )
}

// ============================================================
// COURSE MANAGEMENT
// ============================================================
function CourseManagement({ event, onEventsChange }) {
  const [events, setEvents] = useState([])
  const [types, setTypes] = useState([])
  const [selEvent, setSelEvent] = useState(event?.id || "")
  const [courses, setCourses] = useState([])
  const [msg, setMsg] = useState(null)
  const [editCourse, setEditCourse] = useState(null)
  const [editEvent, setEditEvent] = useState(null)
  // ฟีเจอร์ใหม่: ค้นหา/กรอง + ดูผู้สมัคร
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all") // all | open | closed
  const [viewCourse, setViewCourse] = useState(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (event?.id) { setSelEvent(event.id); loadCourses(event.id) } }, [event])

  async function init() {
    try {
      const [evs, ct] = await Promise.all([fetchAllEvents(), fetchCourseTypes()])
      setEvents(evs || []); setTypes(ct || [])
      const id = event?.id || evs?.[0]?.id
      if (id) { setSelEvent(id); loadCourses(id) }
    } catch (e) { setMsg("โหลดไม่สำเร็จ: " + e.message) }
  }
  async function loadCourses(id) {
    try { setCourses(await fetchCoursesAdmin(id) || []) }
    catch (e) { setMsg("โหลดคอร์สไม่สำเร็จ: " + e.message) }
  }
  function pick(id) { setSelEvent(id); loadCourses(id) }

  async function doSaveEvent(ev) {
    try { await saveEvent(ev); setEditEvent(null); setMsg("บันทึกงานแล้ว")
      const evs = await fetchAllEvents(); setEvents(evs); onEventsChange?.(evs) }
    catch (e) { setMsg("บันทึกงานไม่สำเร็จ: " + e.message) }
  }
  async function doSaveCourse(c) {
    try { await saveCourse({ ...c, event_id: selEvent }); setEditCourse(null); setMsg("บันทึกคอร์สแล้ว"); loadCourses(selEvent) }
    catch (e) { setMsg("บันทึกคอร์สไม่สำเร็จ: " + e.message) }
  }
  async function doDelete(id) {
    if (!confirm("ลบคอร์สนี้? ลบไม่ได้ถ้ามีผู้สมัครแล้ว")) return
    try { await deleteCourse(id); setMsg("ลบคอร์สแล้ว"); loadCourses(selEvent) }
    catch (e) { setMsg("ลบไม่สำเร็จ (อาจมีผู้สมัครอยู่)") }
  }
  async function doToggle(c) {
    try { await toggleCourseOpen(c.id, !c.is_open); loadCourses(selEvent) }
    catch (e) { setMsg("เปลี่ยนสถานะไม่สำเร็จ: " + e.message) }
  }
  async function doCapacity(c, val) {
    try { await updateCapacity(c.id, val); loadCourses(selEvent) }
    catch (e) {
      const m = e.message?.includes("CAPACITY_BELOW_TAKEN")
        ? "ตั้งที่นั่งต่ำกว่าที่จองไปแล้วไม่ได้" : e.message
      setMsg(m); loadCourses(selEvent)
    }
  }
  async function doEmergency() {
    if (!confirm("ปิดรับสมัครทุกคอร์สในงานนี้? ใช้กรณีฉุกเฉินเท่านั้น")) return
    try { const n = await emergencyCloseAll(selEvent); setMsg(`ปิดรับสมัครแล้ว ${n} คอร์ส`); loadCourses(selEvent) }
    catch (e) { setMsg("ทำไม่สำเร็จ: " + e.message) }
  }

  const blank = {
    title: "", description: "", count_mode: "person", team_size: 2,
    capacity: 30, price: 0, bank_account: "", image_url: "",
    type_id: types[0]?.id || "", instructor_names: [], form_schema: [],
  }

  // กรองคอร์สตามคำค้น + สถานะเปิด/ปิด
  const shown = courses.filter((c) => {
    const q = search.trim().toLowerCase()
    const matchQ = !q || c.title?.toLowerCase().includes(q)
      || (c.course_types?.label || "").toLowerCase().includes(q)
    const matchS = statusFilter === "all"
      || (statusFilter === "open" && c.is_open)
      || (statusFilter === "closed" && !c.is_open)
    return matchQ && matchS
  })

  return (
    <div>
      <div style={st.titleRow}>
        <PageTitle title="จัดการรายวิชา" subtitle={`${courses.length} รายวิชา`} />
        <div style={st.titleActions}>
          <button style={st.btnGreen} onClick={() => setEditCourse(blank)}>+ เพิ่มวิชาใหม่</button>
          <button style={st.btnDanger} onClick={doEmergency}>⚠ Emergency Close All</button>
        </div>
      </div>
      {msg && <Banner onClose={() => setMsg(null)}>{msg}</Banner>}

      <div style={st.eventRow}>
        {events.map((ev) => (
          <div key={ev.id} style={{ ...st.eventChip, ...(selEvent === ev.id ? st.eventChipActive : {}) }}>
            <button style={st.eventChipBtn} onClick={() => pick(ev.id)}>{ev.name} ({ev.year}) · {statusLabel(ev.status)}</button>
            <button style={st.editLink} onClick={() => setEditEvent(ev)}>แก้</button>
          </div>
        ))}
        <button style={st.addEvent} onClick={() => setEditEvent({ name: "", year: new Date().getFullYear(), status: "draft" })}>+ เพิ่มงาน</button>
      </div>

      {/* ค้นหา + กรอง */}
      <div style={st.searchRow}>
        <input style={st.searchInput} placeholder="🔍 ค้นหาชื่อวิชา หรือ ประเภท…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={st.segRow}>
          {[["all", "ทั้งหมด"], ["open", "เปิดรับ"], ["closed", "ปิด"]].map(([k, l]) => (
            <button key={k}
              style={{ ...st.seg, ...(statusFilter === k ? st.segActive : {}) }}
              onClick={() => setStatusFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {editEvent && <EventForm ev={editEvent} onSave={doSaveEvent} onCancel={() => setEditEvent(null)} />}
      {editCourse && <CourseForm course={editCourse} types={types} onSave={doSaveCourse} onCancel={() => setEditCourse(null)} />}

      <div style={st.tableWrap}>
        <div style={st.tableHead}>
          <div style={st.thCourse}>วิชา / รายละเอียด</div>
          <div style={st.thCenter}>ที่นั่ง</div>
          <div style={st.thCenter}>รับสมัคร</div>
          <div style={st.thCenter}>จำนวนสูงสุด</div>
          <div style={st.thCenter}>จัดการ</div>
        </div>
        {shown.length === 0 ? <Empty>{courses.length === 0 ? "ยังไม่มีรายวิชาในงานนี้" : "ไม่พบวิชาที่ตรงกับการค้นหา"}</Empty> :
          shown.map((c) => (
            <CourseRow key={c.id} course={c}
              onEdit={() => setEditCourse({
                ...c,
                instructor_names: (c.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean),
              })}
              onDelete={() => doDelete(c.id)}
              onToggle={() => doToggle(c)}
              onCapacity={(v) => doCapacity(c, v)}
              onView={() => setViewCourse(c)} />
          ))}
      </div>

      {viewCourse && <ParticipantsModal course={viewCourse} onClose={() => setViewCourse(null)} />}
    </div>
  )
}

// ดูรายชื่อผู้สมัครในคอร์ส + export CSV
function ParticipantsModal({ course, onClose }) {
  const [regs, setRegs] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetchCourseParticipants(course.id).then(setRegs).catch((e) => setErr(e.message))
  }, [course])

  // แปลงเป็นแถวคน (1 participant = 1 แถว)
  const rows = []
  ;(regs || []).forEach((r) => {
    (r.participants || []).forEach((p) => {
      rows.push({
        course: course.title,
        name: p.full_name,
        school: p.school || "",
        grade: p.grade_level || "",
        phone: p.phone || "",
        email: r.submitter_email || "",
        advisor: r.advisors?.[0]?.full_name || "",
        status: statusLabel(r.status),
        checkedIn: (p.checkins?.length || 0) > 0 ? "เช็คอินแล้ว" : "ยังไม่",
      })
    })
  })

  function exportCsv() {
    const headers = ["คอร์ส", "ชื่อ-สกุล", "โรงเรียน", "ระดับชั้น", "เบอร์โทร", "อีเมลผู้สมัคร", "ครูที่ปรึกษา", "สถานะ", "เช็คอิน"]
    const lines = [headers.join(",")]
    rows.forEach((r) => {
      const vals = [r.course, r.name, r.school, r.grade, r.phone, r.email, r.advisor, r.status, r.checkedIn]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(vals.join(","))
    })
    // BOM กัน Excel อ่านภาษาไทยเพี้ยน
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ผู้สมัคร_${course.title}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={st.modalOverlay} onClick={onClose}>
      <div style={st.modal} onClick={(e) => e.stopPropagation()}>
        <div style={st.modalHead}>
          <div>
            <div style={st.modalTitle}>ผู้สมัคร — {course.title}</div>
            <div style={st.modalSub}>{rows.length} คน</div>
          </div>
          <div style={st.modalActions}>
            <button style={st.btnGreen} onClick={exportCsv} disabled={rows.length === 0}>⬇ Export CSV</button>
            <button style={st.modalClose} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={st.modalBody}>
          {err ? <Empty>โหลดไม่สำเร็จ: {err}</Empty>
            : regs === null ? <Empty>กำลังโหลด…</Empty>
            : rows.length === 0 ? <Empty>ยังไม่มีผู้สมัคร</Empty>
            : (
              <table style={st.tbl}>
                <thead>
                  <tr>
                    <th style={st.th}>ชื่อ-สกุล</th>
                    <th style={st.th}>โรงเรียน</th>
                    <th style={st.th}>เบอร์โทร</th>
                    <th style={st.th}>สถานะ</th>
                    <th style={st.th}>เช็คอิน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={st.tblRow}>
                      <td style={st.td}>{r.name}</td>
                      <td style={st.td}>{r.school}</td>
                      <td style={st.td}>{r.phone}</td>
                      <td style={st.td}>{r.status}</td>
                      <td style={{ ...st.td, color: r.checkedIn === "เช็คอินแล้ว" ? "var(--green)" : "var(--muted)" }}>{r.checkedIn}</td>
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

function CourseRow({ course, onEdit, onDelete, onToggle, onCapacity, onView }) {
  const [cap, setCap] = useState(course.capacity)
  useEffect(() => { setCap(course.capacity) }, [course.capacity])
  const taken = course.seats_taken || 0
  const pct = course.capacity > 0 ? Math.round((taken / course.capacity) * 100) : 0
  const full = taken >= course.capacity
  const instructors = (course.course_instructors || []).map((ci) => ci.instructors?.full_name).filter(Boolean)
  const days = (course.course_days || []).map((d) => d.day_date).sort()

  function commitCap() {
    const v = Number(cap)
    if (v !== course.capacity && v >= 0) onCapacity(v)
  }

  return (
    <div style={st.tr}>
      <div style={st.tdCourse}>
        <div style={st.courseThumb}>
          {course.image_url
            ? <img src={course.image_url} alt="" style={st.thumbImg} />
            : <div style={st.thumbPlaceholder}>{course.title?.[0] || "?"}</div>}
        </div>
        <div style={st.courseInfo}>
          <div style={st.courseTitle}>{course.title}</div>
          <div style={st.tagRow}>
            <span style={st.typeTag}>{course.course_types?.label || "คอร์ส"}</span>
            {instructors.length > 0 && <span style={st.instTag}>👨‍🏫 {instructors.join(", ")}</span>}
          </div>
          <div style={st.tagRow}>
            {days.length > 0 && <span style={st.dayTag}>📅 {days[0]}{days.length > 1 ? ` +${days.length - 1}` : ""}</span>}
            <span style={st.priceMini}>{course.price > 0 ? `฿${course.price.toLocaleString()}` : "ฟรี"}</span>
            <span style={st.modeMini}>{course.count_mode === "team" ? `ทีม ${course.team_size}` : "เดี่ยว"}</span>
          </div>
        </div>
      </div>

      <div style={st.tdCenter}>
        <div style={st.seatNum}>{taken} / {course.capacity}</div>
        <div style={st.bar}><div style={{ ...st.barFill, width: `${pct}%`, background: full ? "var(--red)" : "var(--orange)" }} /></div>
        <div style={st.pctText}>{pct}%</div>
      </div>

      <div style={st.tdCenter}>
        <button
          onClick={onToggle}
          style={{ ...st.toggle, background: course.is_open ? "var(--green)" : "#ccc" }}
          title={course.is_open ? "เปิดรับสมัคร" : "ปิดรับสมัคร"}>
          <span style={{ ...st.knob, transform: course.is_open ? "translateX(20px)" : "translateX(0)" }} />
        </button>
        <div style={st.toggleLabel}>{course.is_open ? "เปิด" : "ปิด"}</div>
      </div>

      <div style={st.tdCenter}>
        <input type="number" min={0} value={cap}
          onChange={(e) => setCap(e.target.value)}
          onBlur={commitCap}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
          style={st.capInput} />
      </div>

      <div style={st.tdCenter}>
        <div style={st.rowActions}>
          <button style={st.viewBtn} onClick={onView}>👁 ผู้สมัคร</button>
          <button style={st.editBtn} onClick={onEdit}>✎ แก้ไข</button>
          <button style={st.delBtn} onClick={onDelete}>🗑</button>
        </div>
      </div>
    </div>
  )
}

function EventForm({ ev, onSave, onCancel }) {
  const [f, setF] = useState(ev)
  return (
    <div style={st.formBox}>
      <div style={st.formGrid}>
        <Field label="ชื่องาน"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="ปี"><input type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} /></Field>
        <Field label="สถานะ">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="draft">ร่าง (ยังไม่เปิด)</option>
            <option value="open">เปิดรับสมัคร</option>
            <option value="closed">ปิดแล้ว</option>
          </select>
        </Field>
      </div>
      <div style={st.formActions}>
        <button style={st.btnGreen} onClick={() => onSave(f)}>บันทึกงาน</button>
        <button style={st.btnOutline} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

function CourseForm({ course, types, onSave, onCancel }) {
  const [f, setF] = useState({ ...course, instructor_text: (course.instructor_names || []).join(", ") })
  const set = (k, v) => setF({ ...f, [k]: v })
  function submit() {
    onSave({ ...f, instructor_names: f.instructor_text.split(",").map((s) => s.trim()).filter(Boolean) })
  }
  return (
    <div style={st.formBox}>
      <Field label="ชื่อคอร์ส"><input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="รายละเอียด"><textarea rows={2} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="ผู้สอน (คั่นด้วยจุลภาค ,)"><input value={f.instructor_text} placeholder="อ.สมชาย, ดร.สมหญิง" onChange={(e) => set("instructor_text", e.target.value)} /></Field>
      <Field label="ลิงก์รูปคอร์ส (ถ้ามี)"><input value={f.image_url || ""} placeholder="https://…" onChange={(e) => set("image_url", e.target.value)} /></Field>
      <div style={st.formGrid}>
        <Field label="ประเภท">
          <select value={f.type_id || ""} onChange={(e) => set("type_id", e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="รูปแบบ">
          <select value={f.count_mode} onChange={(e) => set("count_mode", e.target.value)}>
            <option value="person">เดี่ยว (1 คน)</option>
            <option value="team">ทีม</option>
          </select>
        </Field>
        {f.count_mode === "team" && (
          <Field label="คนต่อทีม"><input type="number" min={2} value={f.team_size} onChange={(e) => set("team_size", e.target.value)} /></Field>
        )}
      </div>
      <div style={st.formGrid}>
        <Field label="จำนวนที่นั่ง"><input type="number" min={0} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
        <Field label="ราคา (0 = ฟรี)"><input type="number" min={0} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="เปิดรับสมัคร?">
          <select value={f.is_open ? "1" : "0"} onChange={(e) => set("is_open", e.target.value === "1")}>
            <option value="1">เปิด</option><option value="0">ปิด</option>
          </select>
        </Field>
      </div>
      <Field label="เลขบัญชีรับโอน (ถ้ามีค่าใช้จ่าย)"><input value={f.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} /></Field>
      <div style={st.formActions}>
        <button style={st.btnGreen} onClick={submit}>บันทึกคอร์ส</button>
        <button style={st.btnOutline} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

// ============================================================
// USER MANAGEMENT (admins)
// ============================================================
function UserManagement() {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("staff")

  useEffect(() => { load() }, [])
  async function load() {
    try { setLoading(true); setAdmins(await listAdmins() || []) }
    catch (e) { setMsg("โหลดไม่สำเร็จ: " + e.message) }
    finally { setLoading(false) }
  }
  async function doAdd() {
    if (!newEmail.trim()) return setMsg("กรอกอีเมลก่อน")
    try {
      await addAdmin(newEmail.trim(), newRole)
      setMsg("เพิ่มแอดมินแล้ว"); setNewEmail(""); load()
    } catch (e) {
      const m = e.message?.includes("USER_NOT_FOUND_IN_AUTH")
        ? "ไม่พบผู้ใช้นี้ — ต้องสมัครบัญชีใน Supabase Auth ก่อน"
        : e.message?.includes("NOT_SUPER_ADMIN") ? "เฉพาะ super admin เท่านั้น" : e.message
      setMsg(m)
    }
  }
  async function doRemove(id) {
    if (!confirm("ลบสิทธิ์แอดมินคนนี้?")) return
    try { await removeAdmin(id); setMsg("ลบแล้ว"); load() }
    catch (e) {
      const m = e.message?.includes("CANNOT_REMOVE_LAST_SUPER") ? "ลบ super admin คนสุดท้ายไม่ได้" : e.message
      setMsg(m)
    }
  }

  return (
    <div>
      <PageTitle title="จัดการผู้ใช้งาน" subtitle="สิทธิ์เจ้าหน้าที่เข้าระบบแอดมิน" />
      {msg && <Banner onClose={() => setMsg(null)}>{msg}</Banner>}

      <div style={st.formBox}>
        <div style={st.addAdminRow}>
          <Field label="อีเมล (ต้องสมัคร Auth ใน Supabase ก่อน)">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="staff@example.com" />
          </Field>
          <Field label="สิทธิ์">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="staff">Staff (ทั่วไป)</option>
              <option value="super">Super (จัดการแอดมินได้)</option>
            </select>
          </Field>
          <button style={{ ...st.btnGreen, alignSelf: "end" }} onClick={doAdd}>เพิ่มแอดมิน</button>
        </div>
      </div>

      {loading ? <Empty>กำลังโหลด…</Empty> : (
        <div style={st.tableWrap}>
          <div style={{ ...st.tableHead, gridTemplateColumns: "2fr 1fr 1fr auto" }}>
            <div>อีเมล</div><div style={st.thCenter}>สิทธิ์</div>
            <div style={st.thCenter}>เพิ่มเมื่อ</div><div style={st.thCenter}>จัดการ</div>
          </div>
          {admins.map((a) => (
            <div key={a.id} style={{ ...st.tr, gridTemplateColumns: "2fr 1fr 1fr auto" }}>
              <div style={st.adminEmail}>{a.email}</div>
              <div style={st.tdCenter}>
                <span style={{ ...st.badge, background: a.role === "super" ? "#7048e8" : "#868e96" }}>{a.role}</span>
              </div>
              <div style={{ ...st.tdCenter, fontSize: 13, color: "var(--muted)" }}>
                {a.created_at ? new Date(a.created_at).toLocaleDateString("th-TH") : "—"}
              </div>
              <div style={st.tdCenter}>
                <button style={st.delBtn} onClick={() => doRemove(a.id)}>ลบสิทธิ์</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// ATTENDANCE
// ============================================================
function Attendance({ event }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!event) { setLoading(false); return }
    setLoading(true)
    fetchAttendanceByCourse(event.id)
      .then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }, [event])

  if (!event) return <Empty>ยังไม่มีงาน</Empty>
  if (loading) return <Empty>กำลังโหลด…</Empty>
  if (err) return <Empty>โหลดไม่สำเร็จ: {err}</Empty>

  const totalP = rows.reduce((s, r) => s + Number(r.total_participants), 0)
  const totalC = rows.reduce((s, r) => s + Number(r.checked_in), 0)

  return (
    <div>
      <div style={st.titleRow}>
        <PageTitle title="สรุปการมาเรียน" subtitle={`เช็คอินรวม ${totalC}/${totalP} คน`} />
        <button style={st.btnGreen} disabled={rows.length === 0} onClick={() => {
          const headers = ["คอร์ส", "ผู้เข้าร่วม", "เช็คอินแล้ว", "อัตรา(%)"]
          const lines = [headers.join(",")]
          rows.forEach((r) => {
            const tp = Number(r.total_participants), ci = Number(r.checked_in)
            const pct = tp > 0 ? Math.round((ci / tp) * 100) : 0
            lines.push([r.title, tp, ci, pct].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
          })
          const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url; a.download = `สรุปการมาเรียน_${event.name}_${event.year}.csv`; a.click()
          URL.revokeObjectURL(url)
        }}>⬇ Export CSV</button>
      </div>
      <div style={st.tableWrap}>
        <div style={{ ...st.tableHead, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
          <div>คอร์ส</div><div style={st.thCenter}>ผู้เข้าร่วม</div>
          <div style={st.thCenter}>เช็คอินแล้ว</div><div style={st.thCenter}>อัตรา</div>
        </div>
        {rows.length === 0 ? <Empty>ยังไม่มีข้อมูล</Empty> :
          rows.map((r) => {
            const tp = Number(r.total_participants), ci = Number(r.checked_in)
            const pct = tp > 0 ? Math.round((ci / tp) * 100) : 0
            return (
              <div key={r.course_id} style={{ ...st.tr, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                <div style={st.courseTitle}>{r.title}</div>
                <div style={st.tdCenter}>{tp}</div>
                <div style={{ ...st.tdCenter, color: "var(--green)", fontWeight: 700 }}>{ci}</div>
                <div style={st.tdCenter}>
                  <div style={st.bar}><div style={{ ...st.barFill, width: `${pct}%`, background: "var(--green)" }} /></div>
                  <div style={st.pctText}>{pct}%</div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ============================================================
// SITE SETTINGS — ข้อมูลติดต่อที่แสดงบน navbar
// ============================================================
function SiteSettings() {
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings().then((s) => setForm({
      line_id: s.line_id || "",
      phone: s.phone || "",
      site_title: s.site_title || "",
      accommodation_url: s.accommodation_url || "",
    })).catch((e) => setMsg("โหลดไม่สำเร็จ: " + e.message))
  }, [])

  async function save() {
    setSaving(true); setMsg(null)
    try { await updateSettings(form); setMsg("บันทึกเรียบร้อย — ข้อมูลจะแสดงบนหน้าเว็บทันที") }
    catch (e) { setMsg("บันทึกไม่สำเร็จ: " + e.message) }
    finally { setSaving(false) }
  }

  if (!form) return <Empty>กำลังโหลด…</Empty>
  const set = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div>
      <PageTitle title="ตั้งค่าเว็บ" subtitle="ข้อมูลติดต่อที่แสดงบนแถบเมนูด้านบน" />
      {msg && <Banner onClose={() => setMsg(null)}>{msg}</Banner>}
      <div style={st.formBox}>
        <Field label="Line ID (เช่น @camtcmu)">
          <input value={form.line_id} onChange={(e) => set("line_id", e.target.value)} placeholder="@camtcmu" />
        </Field>
        <Field label="เบอร์โทรศัพท์">
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="063-525-0248" />
        </Field>
        <Field label="ชื่อเว็บ (แสดงบนโลโก้)">
          <input value={form.site_title} onChange={(e) => set("site_title", e.target.value)} placeholder="CAMT SUMMER COURSE" />
        </Field>
        <Field label="ลิงก์ที่พักแนะนำ (ถ้ามี)">
          <input value={form.accommodation_url} onChange={(e) => set("accommodation_url", e.target.value)} placeholder="https://…" />
        </Field>
        <div style={st.formActions}>
          <button style={st.btnGreen} onClick={save} disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// shared bits
// ============================================================
function PageTitle({ title, subtitle }) {
  return (
    <div style={st.pageTitle}>
      <div style={st.pageBar} />
      <div>
        <h1 style={st.h1}>{title}</h1>
        {subtitle && <div style={st.subtitle}>{subtitle}</div>}
      </div>
    </div>
  )
}
function Field({ label, children }) {
  return <label style={st.fieldWrap}><span style={st.fieldLabel}>{label}</span>{children}</label>
}
function Banner({ children, onClose }) {
  return <div style={st.banner}><span>{children}</span><button style={st.bannerX} onClick={onClose}>✕</button></div>
}
function Empty({ children }) {
  return <div style={st.empty}>{children}</div>
}

function statusLabel(s) {
  const map = {
    all: "ทั้งหมด", draft: "ร่าง", open: "เปิด", closed: "ปิด",
    pending_payment: "รอชำระ", slip_uploaded: "รอตรวจสลิป", confirmed: "ยืนยันแล้ว",
    submitted: "รอพิจารณา", approved: "อนุมัติแล้ว", rejected: "ไม่ผ่าน",
    slip_rejected: "สลิปไม่ผ่าน", waitlist: "คิวสำรอง", expired: "หมดเวลา", refunded: "คืนเงิน",
  }
  return map[s] || s
}
function statusColor(s) {
  const map = {
    pending_payment: "#f08c00", slip_uploaded: "#1971c2", confirmed: "#2f9e44",
    submitted: "#1971c2", approved: "#2f9e44", waitlist: "#7048e8", expired: "#868e96",
    rejected: "#e03131", slip_rejected: "#e03131", refunded: "#868e96",
  }
  return map[s] || "#868e96"
}

const SIDEBAR_W = 240
const st = {
  shell: { display: "flex", minHeight: "100vh", background: "#f4f2ef" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40, display: "block" },

  sidebar: {
    width: SIDEBAR_W, background: "linear-gradient(180deg, #8a3a06, #5c2604)",
    color: "#fff", padding: "24px 16px", display: "flex", flexDirection: "column",
    position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50,
    transform: "translateX(-100%)", transition: "transform 0.25s",
  },
  sidebarOpen: { transform: "translateX(0)" },
  sidebarStatic: { transform: "translateX(0)", boxShadow: "none" },
  brandBox: { display: "flex", alignItems: "center", gap: 12, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 20 },
  brandIcon: { fontSize: 28 },
  brandTitle: { fontWeight: 800, letterSpacing: 1, fontSize: 16 },
  brandTag: { fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 8, marginTop: 4, display: "inline-block" },
  navLabel: { fontSize: 11, textTransform: "uppercase", opacity: 0.6, letterSpacing: 1, marginBottom: 8 },
  navItem: { display: "flex", alignItems: "center", gap: 12, width: "100%", background: "transparent", border: "none", color: "rgba(255,255,255,0.85)", padding: "12px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: "left", marginBottom: 4 },
  navActive: { background: "#fff", color: "var(--orange-dark)" },
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  logoutBtn: { marginTop: "auto", background: "rgba(0,0,0,0.25)", color: "#fff", border: "none", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 14 },

  contentWrap: { flex: 1, marginLeft: 0, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { background: "#fff", borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 30 },
  hamburger: { background: "transparent", border: "none", fontSize: 22, color: "var(--text)" },
  crumb: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 },
  crumbRoot: { color: "var(--orange)" },
  crumbSep: { color: "var(--muted)" },
  eventSwitch: { marginLeft: "auto", width: "auto", maxWidth: 220, fontSize: 13, padding: "6px 10px" },
  main: { padding: "28px 20px", maxWidth: 1180, width: "100%", margin: "0 auto" },

  pageTitle: { display: "flex", gap: 12, marginBottom: 20 },
  pageBar: { width: 5, background: "var(--orange)", borderRadius: 4 },
  h1: { fontSize: 28, fontWeight: 800 },
  subtitle: { fontSize: 14, color: "var(--muted)" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 },
  titleActions: { display: "flex", gap: 10, flexWrap: "wrap" },

  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 16 },
  statCard: { background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 18, position: "relative", overflow: "hidden" },
  statBar: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  statLabel: { fontSize: 13, color: "var(--muted)", marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800 },
  statSub: { fontSize: 12, color: "var(--muted)", marginTop: 4 },

  chipRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 },
  chip: { background: "#fff", border: "1px solid var(--border)", padding: "8px 14px", borderRadius: 20, fontSize: 13, color: "var(--muted)" },
  chipActive: { background: "var(--orange)", color: "#fff", borderColor: "var(--orange)" },

  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: 16 },
  regCard: { background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 18 },
  regTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  regCourse: { fontWeight: 700, fontSize: 15 },
  regEmail: { fontSize: 13, color: "var(--muted)" },
  regParts: { borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 },
  regPartRow: { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" },
  regSchool: { color: "var(--muted)", fontSize: 13 },
  check: { color: "var(--green)", fontWeight: 800 },
  advisor: { fontSize: 13, background: "var(--orange-light)", padding: "6px 10px", borderRadius: 8, marginBottom: 8 },
  checkinInfo: { fontSize: 13, color: "var(--green)", fontWeight: 600, marginBottom: 8 },
  slip: { display: "inline-block", color: "var(--orange)", fontSize: 14, fontWeight: 600, marginBottom: 8 },
  regActions: { display: "flex", gap: 8 },

  badge: { color: "#fff", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 12, whiteSpace: "nowrap" },

  btnGreen: { background: "var(--green)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14 },
  btnOutline: { background: "#fff", color: "var(--red)", border: "1px solid var(--red)", padding: "10px 16px", borderRadius: 10, fontWeight: 600, fontSize: 14 },
  btnDanger: { background: "linear-gradient(90deg,#e8590c,#e03131)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14 },

  eventRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" },
  eventChip: { display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 20, overflow: "hidden", background: "#fff" },
  eventChipActive: { borderColor: "var(--orange)", background: "var(--orange-light)" },
  eventChipBtn: { background: "transparent", border: "none", padding: "8px 14px", fontSize: 13, fontWeight: 600 },
  editLink: { background: "transparent", border: "none", borderLeft: "1px solid var(--border)", padding: "8px 12px", fontSize: 12, color: "var(--orange)" },
  addEvent: { background: "#fff", border: "1px dashed var(--orange)", color: "var(--orange)", padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600 },

  tableWrap: { background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" },
  tableHead: { display: "grid", gridTemplateColumns: "3fr 1.2fr 1fr 1fr 1.2fr", gap: 12, padding: "14px 18px", background: "var(--orange-light)", fontSize: 13, fontWeight: 700, color: "var(--orange-dark)" },
  thCourse: {}, thCenter: { textAlign: "center" },
  tr: { display: "grid", gridTemplateColumns: "3fr 1.2fr 1fr 1fr 1.2fr", gap: 12, padding: "16px 18px", borderTop: "1px solid var(--border)", alignItems: "center" },
  tdCourse: { display: "flex", gap: 12, alignItems: "center", minWidth: 0 },
  tdCenter: { textAlign: "center" },
  courseThumb: { width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0 },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  thumbPlaceholder: { width: "100%", height: "100%", background: "linear-gradient(135deg,var(--orange),var(--orange-dark))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 },
  courseInfo: { minWidth: 0 },
  courseTitle: { fontWeight: 700, fontSize: 15, marginBottom: 4 },
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, alignItems: "center" },
  typeTag: { background: "var(--orange-light)", color: "var(--orange-dark)", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  instTag: { fontSize: 12, color: "var(--muted)" },
  dayTag: { background: "#ebfbee", color: "#2f9e44", padding: "2px 8px", borderRadius: 8, fontSize: 12 },
  priceMini: { fontSize: 13, fontWeight: 700, color: "var(--orange)" },
  modeMini: { fontSize: 12, color: "var(--muted)" },
  seatNum: { fontWeight: 800, fontSize: 14 },
  bar: { height: 6, background: "#eee", borderRadius: 4, overflow: "hidden", margin: "4px auto", maxWidth: 90 },
  barFill: { height: "100%", borderRadius: 4 },
  pctText: { fontSize: 12, color: "var(--muted)" },
  toggle: { width: 44, height: 24, borderRadius: 12, border: "none", position: "relative", cursor: "pointer", padding: 0 },
  knob: { position: "absolute", top: 2, left: 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "transform 0.2s" },
  toggleLabel: { fontSize: 12, color: "var(--muted)", marginTop: 4 },
  capInput: { width: 70, textAlign: "center", padding: "8px", margin: "0 auto" },
  rowActions: { display: "flex", gap: 6, justifyContent: "center" },
  editBtn: { background: "#fff8f0", color: "var(--orange-dark)", border: "1px solid var(--orange)", padding: "8px 12px", borderRadius: 8, fontWeight: 600, fontSize: 13 },
  delBtn: { background: "#fff5f5", color: "var(--red)", border: "1px solid #ffc9c9", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600 },

  formBox: { background: "#fff", border: "1px solid var(--orange)", borderRadius: 14, padding: 20, marginBottom: 20 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 },
  formActions: { display: "flex", gap: 10, marginTop: 14 },
  fieldWrap: { display: "block", marginBottom: 12 },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 },
  addAdminRow: { display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" },
  adminEmail: { fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" },

  banner: { background: "var(--orange-light)", color: "var(--orange-dark)", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  bannerX: { background: "transparent", border: "none", color: "var(--orange-dark)", fontSize: 16 },
  empty: { textAlign: "center", color: "var(--muted)", padding: "40px 0" },

  searchRow: { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  searchInput: { flex: "1 1 240px", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 },
  segRow: { display: "flex", gap: 4, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 4 },
  seg: { background: "transparent", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--muted)" },
  segActive: { background: "var(--orange)", color: "#fff" },
  viewBtn: { background: "#eef2ff", color: "#3b5bdb", border: "1px solid #bac8ff", padding: "8px 10px", borderRadius: 8, fontWeight: 600, fontSize: 13 },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--border)" },
  modalTitle: { fontWeight: 800, fontSize: 18 },
  modalSub: { fontSize: 13, color: "var(--muted)" },
  modalActions: { display: "flex", gap: 10, alignItems: "center" },
  modalClose: { background: "#f1f3f5", border: "none", width: 36, height: 36, borderRadius: 10, fontSize: 16 },
  modalBody: { padding: "8px 22px 22px", overflowY: "auto" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 8px", borderBottom: "2px solid var(--border)", color: "var(--muted)", fontSize: 13, position: "sticky", top: 0, background: "#fff" },
  tblRow: {},
  td: { padding: "10px 8px", borderBottom: "1px solid var(--border)" },
}