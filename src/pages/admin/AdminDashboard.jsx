import { useState, useEffect, useMemo, Fragment } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchDashboardRegistrations, fetchDashboardCourses } from "../../lib/supabase.js"
import { Ico } from "../../lib/icons.jsx"
import { catColor } from "../../lib/categoryColors.js"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area,
} from "recharts"

// จานสีกราฟ — โทนธีม CAMT (ส้ม นำ + สีรอง)
const PIE_COLORS = ["#F15A24", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"]
const BAR_COLORS = ["#F15A24", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]

// สถานะระบบเรา — โทนธีม (sky/emerald/amber/violet/rose)
const STATUS_CFG = {
  confirmed: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "ยืนยันแล้ว" },
  approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "อนุมัติแล้ว" },
  slip_uploaded: { cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-400", label: "รอตรวจสลิป" },
  submitted: { cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-400", label: "รอพิจารณา" },
  pending_payment: { cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "รอชำระเงิน" },
  waitlist: { cls: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "คิวสำรอง" },
  rejected: { cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", label: "ไม่ผ่าน" },
  expired: { cls: "bg-rose-50 text-rose-400 border-rose-100", dot: "bg-rose-300", label: "หมดเวลา" },
  held: { cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400", label: "กันที่นั่ง" },
}
const PAID_STATUSES = ["confirmed", "approved"]
// การ์ด "ผู้สมัครทั้งหมด" — นับทุกใบสมัครที่กันที่นั่งแล้ว (ยืนยัน/รอพิจารณา/รอตรวจสลิป/รอชำระ/กันที่นั่ง)
// ไม่รวม คิวสำรอง (ยังไม่ได้ที่นั่ง) · ไม่ผ่าน · หมดเวลา
const SEAT_HELD_STATUSES = ["confirmed", "approved", "slip_uploaded", "submitted", "pending_payment", "held"]

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400", label: status || "-" }
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${c.cls}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />{c.label}</span>
}

// ป้ายหมวด — ใช้สีกลางจาก categoryColors (hash ตามชื่อ ให้ตรงหน้าอื่น)
function catBadgeCls(name) {
  const cc = catColor(name)
  return `${cc.bg} ${cc.text} border-transparent`
}

// ── รวมแถวเป็น "ทีม/ธีม" ตาม reg_id ──
// วิชาทีม (count_mode==='team') ที่มี reg_id เดียวกัน = ทีมเดียว → รวมเป็น 1 กลุ่ม (มีสมาชิกหลายคน)
// วิชาเดี่ยว หรือไม่มี reg_id → กลุ่มละ 1 คน
// คงลำดับการสมัคร (เรียงตาม created ของแถวแรกในกลุ่ม)
function groupByTeam(list) {
  const groups = []
  const byReg = new Map()
  for (const r of list) {
    const isTeam = r.count_mode === "team"
    const key = isTeam && r.reg_id ? `reg:${r.reg_id}` : `solo:${r.participant_id || r.reg_id || Math.random()}`
    if (!byReg.has(key)) {
      const g = { key, isTeam, theme: r.theme_name || "", course_name: r.course_name || "", members: [], head: r }
      byReg.set(key, g)
      groups.push(g)
    }
    byReg.get(key).members.push(r)
  }
  return groups
}

function SectionCard({ title, icon: Icon, children, action, className = "", headerClassName = "" }) {
  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${className || "bg-white border-slate-200"}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${headerClassName || "border-slate-100"}`}>
        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-[#F15A24]" />}{title}</h3>{action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const TOOLTIP_STYLE = { borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,.10)", fontSize: "12px" }

// map คอร์สจาก RPC dashboard_courses → รูปแบบที่ใช้ในการ์ด "จำนวนผู้สมัคร"
function mapDashCourse(c) {
  let sessions = []
  try { const raw = c.sessions; sessions = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw || "[]") : []) } catch { sessions = [] }
  let sCounts = {}
  try { const raw = c.session_counts; sCounts = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : (typeof raw === "string" ? JSON.parse(raw || "{}") : {}) } catch { sCounts = {} }
  const hasSessions = Array.isArray(sessions) && sessions.length > 0
  return {
    courseId: c.course_id, name: c.course_name, category: c.course_category || "อื่นๆ",
    capacity: Number(c.capacity || 0), seatMode: c.seat_mode || "", taken: Number(c.active_regs || 0), hasSessions,
    closed: c.is_open === false,
    sessions: hasSessions ? sessions.map((s) => ({
      id: s.id, label: s.label || "รอบ", capacity: Number(s.capacity || 0),
      taken: sCounts[s.id] != null ? Number(sCounts[s.id]) : (s.taken != null ? Number(s.taken) : 0),
    })) : [],
  }
}

// แถบปรอทที่นั่ง 1 เส้น (dim = คอร์สปิดรับ ทำเป็นสีเทา)
function renderSeatBar(taken, capacity, seatMode, keySuffix, label, dim = false) {
  const unlimited = seatMode === "unlimited" || capacity <= 0
  const pct = unlimited ? Math.min(85, Math.round(Math.log10(taken + 1) * 39)) : Math.min(100, Math.round((taken / capacity) * 100))
  const isOver = !unlimited && taken >= capacity
  const barColor = dim ? "bg-slate-300" : unlimited ? "bg-[#F15A24]" : isOver ? "bg-rose-500" : "bg-gradient-to-r from-[#F15A24] to-orange-300"
  return (
    <div key={keySuffix} className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {label && <div className="text-[11px] text-slate-400 font-medium truncate mb-0.5">{label}</div>}
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
      </div>
      <span className={`text-xs font-bold shrink-0 ${dim ? "text-slate-400" : isOver ? "text-rose-500" : "text-slate-500"}`}>
        {unlimited ? <span className="inline-flex items-center gap-1">{taken} <span className={dim ? "text-slate-400" : "text-[#F15A24]"}>· ∞</span></span> : `${taken}/${capacity}`}
      </span>
    </div>
  )
}

export default function AdminDashboard() {
  const { event } = useOutletContext()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState("ALL")
  const [customDate, setCustomDate] = useState("")
  const [catFilter, setCatFilter] = useState("ALL")  // กรองหมวด: ALL/Competition/Workshop
  const [drill, setDrill] = useState(null)      // {title, list}
  const [drillSearch, setDrillSearch] = useState("")
  const [drillStatus, setDrillStatus] = useState("All")
  const [drillCourse, setDrillCourse] = useState("All")
  const [expandedTeams, setExpandedTeams] = useState({})  // {groupKey: true} — ทีมที่กางดูสมาชิก
  const [selectedUser, setSelectedUser] = useState(null)
  const [courseDetail, setCourseDetail] = useState(null)
const [allCourses, setAllCourses] = useState([])  // ทุกวิชาในงาน (รวม 0 คน) — สำหรับ "จำนวนผู้สมัคร"
  const [showAllSchools, setShowAllSchools] = useState(false)  // ดูโรงเรียนทั้งหมด (ไม่จำกัด 10)
  const [exportOpen, setExportOpen] = useState(false)  // modal เลือกโหมด export
  const [exportSel, setExportSel] = useState("__combined")  // "__combined" | "__split" | ชื่อวิชา

  useEffect(() => {
    if (!event?.id) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetchDashboardRegistrations(event.id),
      fetchDashboardCourses(event.id).catch(() => []),
    ])
      .then(([regs, courses]) => {
        setRows((regs || []).map((r) => ({ ...r, created: r.created_at ? new Date(r.created_at) : new Date() })))
        setAllCourses(courses || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [event?.id])

  // time filter
  const filtered = useMemo(() => {
    const now = new Date()
    const sDay = new Date(now); sDay.setHours(0, 0, 0, 0)
    const sWk = new Date(now); sWk.setDate(now.getDate() - now.getDay())
    const sMo = new Date(now.getFullYear(), now.getMonth(), 1)
    return rows.filter((r) => {
      if (["expired"].includes(r.status)) return false
      if (catFilter !== "ALL" && (r.course_category || "อื่นๆ") !== catFilter) return false
      const t = r.created
      if (timeFilter === "TODAY") return t >= sDay
      if (timeFilter === "WEEK") return t >= sWk
      if (timeFilter === "MONTH") return t >= sMo
      if (timeFilter === "CUSTOM" && customDate) {
        const [y, m, d] = customDate.split("-")
        return t >= new Date(y, m - 1, d, 0, 0, 0) && t <= new Date(y, m - 1, d, 23, 59, 59)
      }
      return true
    })
  }, [rows, timeFilter, customDate, catFilter])

  // รายชื่อหมวดทั้งหมด (สำหรับตัวกรอง)
  const allCategories = useMemo(() => {
    const s = new Set()
    rows.forEach((r) => s.add(r.course_category || "อื่นๆ"))
    return Array.from(s).sort()
  }, [rows])

  const isPaid = (r) => PAID_STATUSES.includes(r.status)

  // unique users (by email)
  const uniqueUsers = useMemo(() => {
    const m = new Map()
    filtered.forEach((r) => { if (!m.has(r.submitter_email)) m.set(r.submitter_email, r) })
    return Array.from(m.values())
  }, [filtered])

  // จำนวนผู้สมัครวันนี้ (unique email) — ใช้เทียบใน KPI
  const todayUsers = useMemo(() => {
    const sDay = new Date(); sDay.setHours(0, 0, 0, 0)
    const s = new Set()
    filtered.forEach((r) => { if (r.created >= sDay) s.add(r.submitter_email) })
    return s.size
  }, [filtered])

  const stats = useMemo(() => {
    const paidRows = filtered.filter(isPaid)
    const uniquePaid = new Set(paidRows.map((r) => r.submitter_email)).size
    // รวมเป็น "ใบสมัคร" — ทีม (reg_id เดียว) = 1 ใบ, เดี่ยว = ต่อคน; ราคาต่อใบ = ราคาวิชา (แถวหัวหน้า) นับครั้งเดียว
    const regPrice = new Map()
    paidRows.forEach((r) => {
      const key = r.count_mode === "team" && r.reg_id ? `reg:${r.reg_id}` : `solo:${r.participant_id || r.reg_id}`
      regPrice.set(key, Math.max(regPrice.get(key) || 0, Number(r.price || 0)))
    })
    // นับเฉพาะใบที่มีรายได้จริง (ราคา > 0 = มีจ่าย/แนบสลิป) — ใบฟรีไม่นับ
    const paidVals = [...regPrice.values()].filter((v) => v > 0)
    const paidRegCount = paidVals.length
    const totalIncome = paidVals.reduce((s, v) => s + v, 0)  // Σ รายการสมัคร × ราคาวิชานั้น
    return {
      totalUsers: uniqueUsers.length,
      totalIncome,
      pendingSlips: filtered.filter((r) => r.status === "slip_uploaded").length,
      pendingPayment: filtered.filter((r) => r.status === "pending_payment").length,
      waitlist: filtered.filter((r) => r.status === "waitlist").length,
      uniquePaid,
      paidSeats: paidRows.length,
      paidRegCount,
    }
  }, [filtered, uniqueUsers])

  const trendData = useMemo(() => {
    const t = {}
    filtered.forEach((r) => { const k = r.created.toLocaleDateString("en-GB"); t[k] = (t[k] || 0) + 1 })
    return Object.entries(t).map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date.split("/").reverse().join("-")) - new Date(b.date.split("/").reverse().join("-")))
  }, [filtered])

  // จำนวนผู้สมัครแต่ละวิชา — ใช้ allCourses (ทุกวิชาที่เปิดรับ รวม 0 คน) จาก RPC dashboard_courses
  // กรองตามหมวด (catFilter) ให้สอดคล้องกับตัวกรองด้านบน + เฉพาะวิชาที่เปิดรับ (is_open)
  const seatsByCategory = useMemo(() => {
    const courses = (allCourses || [])
      .filter((c) => catFilter === "ALL" || (c.course_category || "อื่นๆ") === catFilter)
      .map(mapDashCourse)

    // จัดกลุ่มตามหมวด — วิชาเปิดขึ้นก่อน แล้วตามด้วยวิชาปิด (ในหมวดเดียวกัน)
    const catMap = {}
    courses.forEach((c) => {
      const k = c.category
      if (!catMap[k]) catMap[k] = []
      catMap[k].push(c)
    })
    return Object.entries(catMap).map(([category, list]) => ({
      category,
      courses: list.sort((a, b) => (a.closed === b.closed ? b.taken - a.taken : a.closed ? 1 : -1)),
    })).sort((a, b) => b.courses.length - a.courses.length)
  }, [allCourses, catFilter])

  const categoryData = useMemo(() => {
    const c = {}
    filtered.forEach((r) => { const k = r.course_category || "อื่นๆ"; c[k] = (c[k] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [filtered])


const schoolRanking = useMemo(() => {
    const c = {}
    uniqueUsers.forEach((r) => { if (r.school) c[r.school] = (c[r.school] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [uniqueUsers])
  const schoolRankingShown = showAllSchools ? schoolRanking : schoolRanking.slice(0, 10)

  const provinceData = useMemo(() => {
    const c = {}; const seen = new Map()
    filtered.filter(isPaid).forEach((r) => { if (!seen.has(r.submitter_email)) seen.set(r.submitter_email, r) })
    seen.forEach((r) => { c[r.province] = (c[r.province] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [filtered])

  // ความสนใจตามชั้นปี × หมวดวิชา (stacked bar)
  const gradeInterest = useMemo(() => {
    const SORT = ["ป.1","ป.2","ป.3","ป.4","ป.5","ป.6","ม.1","ม.2","ม.3","ม.4","ม.5","ม.6","ปวช.","ปวส.","ปี 1","ปี 2","ปี 3"]
    const grouped = {}; const cats = new Set()
    filtered.forEach((r) => {
      const grade = r.grade_level || "ไม่ระบุ"
      const cat = r.course_category || "อื่นๆ"
      cats.add(cat)
      if (!grouped[grade]) grouped[grade] = { name: grade }
      grouped[grade][cat] = (grouped[grade][cat] || 0) + 1
    })
    const data = Object.values(grouped).sort((a, b) => {
      let ia = SORT.findIndex((s) => a.name.startsWith(s)); let ib = SORT.findIndex((s) => b.name.startsWith(s))
      if (ia === -1) ia = 999; if (ib === -1) ib = 999
      return ia !== ib ? ia - ib : a.name.localeCompare(b.name)
    })
    return { data, categories: Array.from(cats) }
  }, [filtered])

  // course detail (กดวิชา → สรุปโรงเรียน/ชั้นปีในวิชานั้น)
  function openCourseDetail(courseId, courseName) {
    const regs = filtered.filter((r) => r.course_id === courseId && isPaid(r))
    const schoolMap = {}
    regs.forEach((r) => {
      const g = r.grade_level || "ไม่ระบุ"
      if (!schoolMap[r.school]) schoolMap[r.school] = { count: 0, grades: {} }
      schoolMap[r.school].count++; schoolMap[r.school].grades[g] = (schoolMap[r.school].grades[g] || 0) + 1
    })
    const schools = Object.entries(schoolMap).map(([name, v]) => ({
      name, count: v.count,
      grades: Object.entries(v.grades).map(([g, c]) => ({ name: g, count: c })).sort((a, b) => b.count - a.count),
    })).sort((a, b) => b.count - a.count)
    const gradeMap = {}
    regs.forEach((r) => { const g = r.grade_level || "ไม่ระบุ"; gradeMap[g] = (gradeMap[g] || 0) + 1 })
    const grades = Object.entries(gradeMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    // รายชื่อผู้สมัครทุกสถานะของวิชานี้ (สำหรับตารางรายชื่อใน popup)
    const allRegs = filtered.filter((r) => r.course_id === courseId)
    // สถิติสถานะ (สำหรับกรอบด้านบน popup)
    const isTeam = allRegs.some((r) => r.count_mode === "team")
    const teamSet = new Set(); allRegs.forEach((r) => { if (r.reg_id) teamSet.add(r.reg_id) })
    const themeCount = teamSet.size
    const approvedCount = allRegs.filter((r) => PAID_STATUSES.includes(r.status)).length
    const pendingCount = allRegs.filter((r) => ["slip_uploaded", "submitted", "pending_payment", "held"].includes(r.status)).length
    const waitlistCount = allRegs.filter((r) => r.status === "waitlist").length
    setCourseDetail({ courseName, regs, allRegs, schools, grades, revenue: regs.reduce((s, r) => s + Number(r.price || 0), 0), isTeam, themeCount, approvedCount, pendingCount, waitlistCount })
  }

  // ประวัติการสมัครทุกวิชาของ user (จาก email)
  function openUser(r) {
    const txs = rows.filter((x) => x.submitter_email === r.submitter_email)
    setSelectedUser({ ...r, transactions: txs })
  }

  // drill helpers
  function drillDown(title, fn) { setDrill({ title, list: filtered.filter(fn) }); setDrillSearch(""); setDrillStatus("All"); setDrillCourse("All"); setExpandedTeams({}) }
  const drillList = useMemo(() => {
    if (!drill) return []
    return drill.list.filter((r) => {
      const q = drillSearch.toLowerCase()
      const ms = !q || (r.full_name || "").toLowerCase().includes(q) || (r.phone || "").includes(q) || (r.theme_name || "").toLowerCase().includes(q)
      const mst = drillStatus === "All" || r.status === drillStatus
      const mc = drillCourse === "All" || r.course_name === drillCourse
      return ms && mst && mc
    })
  }, [drill, drillSearch, drillStatus, drillCourse])

  // จัดกลุ่มทีม (สำหรับแสดงใน drill — ทีมยุบ 1 แถว)
  const drillGroups = useMemo(() => groupByTeam(drillList), [drillList])

  // ── Export CSV — แยก section ตามวิชา ──
  const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`

  // จัดกลุ่มรายชื่อตามวิชา — เรียงตามหมวด แล้วชื่อวิชา
  function groupByCourse(list) {
    const map = new Map()
    for (const r of list) {
      const key = r.course_id != null ? `id:${r.course_id}` : `name:${r.course_name || "-"}`
      if (!map.has(key)) map.set(key, { courseName: r.course_name || "(ไม่ระบุวิชา)", category: r.course_category || "อื่นๆ", regs: [] })
      map.get(key).regs.push(r)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.category.localeCompare(b.category, "th") || a.courseName.localeCompare(b.courseName, "th"))
  }

  // สร้างบรรทัด CSV ของ 1 วิชา (section header + column header + rows)
  // วิชาทีม (count_mode==='team') → เพิ่มคอลัมน์ ธีม/ชื่อธีม นำหน้า (เขียนแถวแรกของทีมเท่านั้น)
  function buildCourseSection(courseName, regs) {
    const isTeam = regs[0]?.count_mode === "team"
    const groups = groupByTeam(regs)
    const personCols = (r) => [
      r.participant_code || "-",
      r.full_name || "-",
      r.nickname || "-",
      r.grade_level || "-",
      r.school || "-",
      r.province || "-",
      r.phone || "-",
      STATUS_CFG[r.status]?.label || r.status || "-",
    ]
    const lines = []
    if (isTeam) {
      lines.push(csvEscape(`=== ${courseName} (${groups.length} ธีม · ${regs.length} คน) ===`))
      lines.push(["ธีม", "ชื่อธีม", "#", "รหัส", "ชื่อ-สกุล", "ชื่อเล่น", "ระดับชั้น", "โรงเรียน", "จังหวัด", "เบอร์", "สถานะ"].map(csvEscape).join(","))
      groups.forEach((g, gi) => {
        g.members.forEach((r, mi) => {
          lines.push([
            mi === 0 ? gi + 1 : "",           // เลขธีม (แถวแรกของทีม)
            mi === 0 ? (g.theme || "") : "",   // ชื่อธีม (แถวแรกของทีม)
            mi + 1,                            // ลำดับคนในทีม
            ...personCols(r),
          ].map(csvEscape).join(","))
        })
      })
    } else {
      lines.push(csvEscape(`=== ${courseName} (${regs.length} คน) ===`))
      lines.push(["#", "รหัส", "ชื่อ-สกุล", "ชื่อเล่น", "ระดับชั้น", "โรงเรียน", "จังหวัด", "เบอร์", "สถานะ"].map(csvEscape).join(","))
      let n = 0
      groups.forEach((g) => {
        g.members.forEach((r) => {
          n += 1
          lines.push([n, ...personCols(r)].map(csvEscape).join(","))
        })
      })
    }
    return lines
  }

  function downloadCsv(lines, name) {
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    const safe = String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60)
    a.href = url; a.download = `${safe}_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // \u0e23\u0e27\u0e21\u0e17\u0e38\u0e01\u0e27\u0e34\u0e0a\u0e32\u0e40\u0e1b\u0e47\u0e19\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e14\u0e35\u0e22\u0e27 \u2014 \u0e41\u0e15\u0e48\u0e25\u0e30 section \u0e04\u0e31\u0e48\u0e19\u0e14\u0e49\u0e27\u0e22\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e27\u0e48\u0e32\u0e07
  function exportCombined(list, name) {
    const courses = groupByCourse(list)
    const lines = []
    courses.forEach((c, i) => {
      if (i > 0) lines.push("")
      lines.push(...buildCourseSection(c.courseName, c.regs))
    })
    downloadCsv(lines, name)
  }

  // \u0e41\u0e22\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e25\u0e30\u0e27\u0e34\u0e0a\u0e32 \u2014 \u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e2b\u0e25\u0e32\u0e22\u0e44\u0e1f\u0e25\u0e4c (\u0e2b\u0e19\u0e48\u0e27\u0e07\u0e01\u0e31\u0e19 browser \u0e1a\u0e25\u0e47\u0e2d\u0e01)
  function exportSplit(list) {
    const courses = groupByCourse(list)
    courses.forEach((c, i) => {
      setTimeout(() => downloadCsv(buildCourseSection(c.courseName, c.regs), c.courseName), i * 350)
    })
  }

  if (!event) return <div className="bg-white rounded-2xl p-12 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีงาน — สร้างงานในเมนูตั้งค่าเว็บ</div>
  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
      <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /><span>กำลังโหลดข้อมูล…</span>
    </div>
  )

  const timeLabels = { TODAY: "วันนี้", WEEK: "สัปดาห์นี้", MONTH: "เดือนนี้", ALL: "ทั้งหมด" }
  // นับทุกใบสมัครที่กันที่นั่งแล้ว (คอนเฟิร์ม + รอพิจารณา/รอตรวจ/รอชำระ/กันที่นั่ง) — ไม่ unique
  const seatHeldCount = filtered.filter((r) => SEAT_HELD_STATUSES.includes(r.status)).length
  const kpiCards = [
    { title: "ผู้สมัครทั้งหมด", value: seatHeldCount.toLocaleString(), unit: "คน", sub: todayUsers > 0 ? `+${todayUsers} วันนี้` : "ยังไม่มีวันนี้", color: "sky", icon: "users", onClick: () => drillDown("ผู้สมัครทั้งหมด", (r) => SEAT_HELD_STATUSES.includes(r.status)) },
    { title: "รายได้รวม", value: stats.totalIncome.toLocaleString(), unit: "฿", sub: `${stats.paidRegCount.toLocaleString()} ใบ`, color: "emerald", icon: "money", onClick: () => drillDown("ชำระแล้ว", isPaid) },
    { title: "คิวสำรอง", value: stats.waitlist.toLocaleString(), unit: "รายการ", sub: stats.waitlist > 0 ? "รอที่นั่งว่าง" : "ไม่มีคิวสำรอง", color: "violet", icon: "clock", onClick: () => drillDown("คิวสำรอง", (r) => r.status === "waitlist") },
    { title: "รอตรวจสลิป", value: stats.pendingSlips.toLocaleString(), unit: "รายการ", sub: stats.pendingSlips > 0 ? "ต้องรีบตรวจ" : "เคลียร์หมดแล้ว", color: "orange", icon: "receipt", onClick: () => drillDown("รอตรวจสลิป", (r) => r.status === "slip_uploaded") },
  ]
  const KPI_STYLE = {
    sky: { bg: "bg-sky-50", border: "border-sky-100", text: "text-sky-600", icon: "text-sky-500" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600", icon: "text-emerald-500" },
    violet: { bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-600", icon: "text-violet-500" },
    orange: { bg: "bg-orange-50", border: "border-orange-100", text: "text-[#F15A24]", icon: "text-[#F15A24]" },
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header + filter */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Ico.chart className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">Dashboard</h1>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{event.name} {event.year} — ภาพรวม & วิเคราะห์</p>
            </div>
          </div>
          <button onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap shrink-0">
            <Ico.download className="w-4 h-4 text-[#F15A24]" /> <span className="hidden sm:inline">Export</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
            {Object.entries(timeLabels).map(([k, v]) => (
              <button key={k} onClick={() => setTimeFilter(k)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${timeFilter === k ? "bg-white text-[#F15A24] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{v}</button>
            ))}
          </div>
          <input type="date" value={customDate} onChange={(e) => { setCustomDate(e.target.value); setTimeFilter("CUSTOM") }}
            className={`flex-1 min-w-0 sm:flex-none px-3 py-1.5 rounded-xl text-xs border outline-none focus:ring-2 focus:ring-[#F15A24] transition ${timeFilter === "CUSTOM" ? "border-[#F15A24] bg-orange-50 text-[#F15A24] font-bold" : "border-slate-200 text-slate-600"}`} />
        </div>

        {/* ตัวกรองหมวด — กรองทั้ง Dashboard */}
        {allCategories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">หมวด:</span>
            <button onClick={() => setCatFilter("ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${catFilter === "ALL" ? "bg-[#F15A24] text-white border-[#F15A24]" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
              ทั้งหมด
            </button>
            {allCategories.map((cat) => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${catFilter === cat ? "bg-[#F15A24] text-white border-[#F15A24]" : catBadgeCls(cat) + " hover:opacity-80"}`}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => {
          const st = KPI_STYLE[k.color]
          const I = Ico[k.icon]
          return (
            <button key={k.title} onClick={k.onClick}
              className={`text-left rounded-2xl p-4 sm:p-5 border transition hover:shadow-md active:scale-[.98] relative overflow-hidden ${st.bg} ${st.border}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${st.text}`}>{k.title}</p>
              <p className={`text-2xl sm:text-3xl font-extrabold leading-none ${st.text}`}>
                {k.value}<span className="text-xs font-normal ml-1 opacity-60">{k.unit}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">{k.sub}</p>
              <span className={`absolute right-3 bottom-3 opacity-15 ${st.icon}`}><I className="w-10 h-10" /></span>
            </button>
          )
        })}
      </div>

      {/* ⭐ จำนวนผู้สมัคร (แยกหมวด + แยกรอบ) + วิชาปิดรับด้านล่าง */}
      {seatsByCategory.length > 0 && (
        <SectionCard title="จำนวนผู้สมัคร" icon={Ico.chart} action={<span className="text-xs text-slate-400">แยกตามหมวด</span>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
            {seatsByCategory.map((grp) => (
              <div key={grp.category}>
                {/* หัวหมวด */}
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${catBadgeCls(grp.category)}`}>{grp.category}</span>
                  <span className="text-[11px] text-slate-400">{grp.courses.length} รายการ</span>
                </div>
                {/* รายการวิชาในหมวด (มีรอบ = แตกปรอทแต่ละรอบข้างใน) */}
                <div className="space-y-1">
                  {grp.courses.map((c) => (
                    <div key={c.courseId} onClick={() => openCourseDetail(c.courseId, c.name)}
                      className="px-2 py-2 rounded-xl hover:bg-orange-50/60 cursor-pointer transition">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium text-slate-700 truncate">{c.name}</span>
                        {c.closed && <span className="text-[9px] font-bold text-slate-400 border border-slate-200 rounded px-1 py-px shrink-0">ปิดรับสมัคร</span>}
                      </div>
                      {c.hasSessions
                        ? <div className="space-y-1.5 pl-1">{c.sessions.map((s) => renderSeatBar(s.taken, s.capacity, "", s.id, s.label))}</div>
                        : renderSeatBar(c.taken, c.capacity, c.seatMode, c.courseId, "")}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="📈 แนวโน้มการสมัคร (Registration Trend)" action={<span className="text-xs text-slate-400">{trendData.length} วัน</span>}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs><linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F15A24" stopOpacity={0.25} /><stop offset="95%" stopColor="#F15A24" stopOpacity={0} />
                  </linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" fontSize={10} tick={{ fill: "#9ca3af" }} />
                  <YAxis allowDecimals={false} fontSize={10} tick={{ fill: "#9ca3af" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="count" name="ผู้สมัคร" stroke="#F15A24" strokeWidth={2} fill="url(#grad1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
        <SectionCard title="ความนิยมตามหมวด" icon={Ico.fire}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={4} dataKey="value"
                  onClick={(d) => drillDown(`หมวด: ${d.name}`, (r) => (r.course_category || "อื่นๆ") === d.name)} cursor="pointer">
                  {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} /><Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Province + Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="5 จังหวัดมาแรง" icon={Ico.pin}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={provinceData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={80} fontSize={11} tick={{ fill: "#6b7280" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "transparent" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {provinceData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title={showAllSchools ? `อันดับโรงเรียน (ทั้งหมด ${schoolRanking.length})` : "อันดับโรงเรียน (Top 10)"} icon={Ico.school}
          action={schoolRanking.length > 10 && (
            <button onClick={() => setShowAllSchools((v) => !v)}
              className="text-xs font-bold text-[#F15A24] hover:bg-orange-50 px-2.5 py-1 rounded-lg transition">
              {showAllSchools ? "ย่อ Top 10" : `ดูทั้งหมด (${schoolRanking.length})`}
            </button>
          )}>
          <div className="overflow-y-auto max-h-56 space-y-1">
            {schoolRankingShown.map((s, i) => { 
              const pct = Math.round((s.value / (schoolRanking[0]?.value || 1)) * 100)
              return (
                <div key={i} onClick={() => drillDown(`โรงเรียน: ${s.name}`, (r) => r.school === s.name)}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-orange-50/60 cursor-pointer transition">
                  <span className="text-xs font-bold text-slate-300 w-5 text-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-700 truncate mb-1">{s.name}</div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#F15A24] to-orange-300" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <span className="text-xs font-bold text-slate-500 shrink-0">{s.value} คน</span>
                </div>
              )
            })}
            {schoolRanking.length === 0 && <p className="text-center text-slate-300 text-sm py-8">ยังไม่มีข้อมูล</p>}
          </div>
        </SectionCard>
      </div>

      {/* กราฟความสนใจตามชั้นปี × หมวด */}
      <SectionCard title="ความสนใจตามชั้นปี (แยกตามหมวดวิชา)" icon={Ico.puzzle}>
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="h-64 min-w-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeInterest.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" fontSize={10} interval={0} tick={{ fill: "#6b7280" }} />
                <YAxis allowDecimals={false} fontSize={10} tick={{ fill: "#9ca3af" }} />
                <Tooltip contentStyle={{ ...TOOLTIP_STYLE, fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                {gradeInterest.categories.map((cat, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} name={cat} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionCard>

      {/* Drill-down modal */}
      {drill && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && setDrill(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl flex flex-col max-h-[95dvh] sm:max-h-[90vh] shadow-2xl rounded-t-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">{drill.title}</h3>
                <p className="text-orange-100 text-xs mt-0.5">{drillGroups.length} ทีม/คน · {drillList.length} รายชื่อ</p>
              </div>
              <button onClick={() => setDrill(null)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative">
                <Ico.search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="ค้นหาชื่อ, ธีม, เบอร์…" value={drillSearch} onChange={(e) => setDrillSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#F15A24] text-xs bg-white" />
              </div>
              <select value={drillCourse} onChange={(e) => setDrillCourse(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:ring-2 focus:ring-[#F15A24]">
                <option value="All">ทุกวิชา</option>
                {[...new Set(drill.list.map((i) => i.course_name))].sort().map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={drillStatus} onChange={(e) => setDrillStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:ring-2 focus:ring-[#F15A24]">
                <option value="All">ทุกสถานะ</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="overflow-y-auto flex-1">
              {/* Desktop table */}
              <table className="w-full text-xs hidden sm:table">
                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase sticky top-0 border-b border-slate-100">
                  <tr><th className="px-4 py-3 text-center w-10">#</th><th className="px-4 py-3">ธีม / ชื่อ-สกุล</th><th className="px-4 py-3">ระดับชั้น</th><th className="px-4 py-3">วิชา</th><th className="px-4 py-3">จังหวัด</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">เบอร์</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {drillGroups.map((g, gi) => {
                    const head = g.head
                    const isExpanded = expandedTeams[g.key]
                    // ── ทีม (หลายคน) → 1 แถวยุบ คลิกกาง ──
                    if (g.isTeam && g.members.length > 1) {
                      return (
                        <Fragment key={g.key}>
                          <tr onClick={() => setExpandedTeams((p) => ({ ...p, [g.key]: !p[g.key] }))} className="hover:bg-orange-50/50 transition cursor-pointer bg-orange-50/20">
                            <td className="px-4 py-3 text-center text-slate-400 font-bold">{gi + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`transition-transform ${isExpanded ? "rotate-90" : ""} text-[#F15A24] font-bold`}>›</span>
                                <div>
                                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                    <Ico.users className="w-3.5 h-3.5 text-[#F15A24]" /> {g.theme || "(ไม่มีชื่อธีม)"}
                                  </div>
                                  <div className="text-[10px] text-slate-400">ทีม {g.members.length} คน · หัวหน้า {head.full_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className="bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-md font-bold text-[10px]">{head.grade_level}</span></td>
                            <td className="px-4 py-3 text-slate-600 max-w-[140px]"><span className="line-clamp-1">{head.course_name}</span></td>
                            <td className="px-4 py-3 text-slate-500">{head.province}</td>
                            <td className="px-4 py-3"><StatusBadge status={head.status} /></td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{head.phone}</td>
                          </tr>
                          {isExpanded && g.members.map((r, mi) => (
                            <tr key={g.key + "-" + mi} onClick={() => openUser(r)} className="hover:bg-orange-50/40 transition cursor-pointer bg-slate-50/40">
                              <td className="px-4 py-2.5 text-center text-slate-300 text-[10px]">{mi + 1}</td>
                              <td className="px-4 py-2.5 pl-10 font-medium text-slate-700">{r.full_name} {r.nickname && <span className="text-slate-400 font-normal">({r.nickname})</span>}</td>
                              <td className="px-4 py-2.5 text-slate-500">{r.grade_level}</td>
                              <td className="px-4 py-2.5 text-slate-400 text-[10px]">สมาชิกทีม</td>
                              <td className="px-4 py-2.5 text-slate-500">{r.province}</td>
                              <td className="px-4 py-2.5"></td>
                              <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.phone}</td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    }
                    // ── เดี่ยว (1 คน) → แถวปกติ ──
                    const r = head
                    return (
                      <tr key={g.key} onClick={() => openUser(r)} className="hover:bg-orange-50/50 transition cursor-pointer">
                        <td className="px-4 py-3 text-center text-slate-300 font-bold">{gi + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.full_name} {r.nickname && <span className="text-slate-400 font-normal">({r.nickname})</span>}</td>
                        <td className="px-4 py-3"><span className="bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-md font-bold text-[10px]">{r.grade_level}</span></td>
                        <td className="px-4 py-3 text-slate-600 max-w-[140px]"><span className="line-clamp-1">{r.course_name}</span></td>
                        <td className="px-4 py-3 text-slate-500">{r.province}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{r.phone}</td>
                      </tr>
                    )
                  })}
                  {drillGroups.length === 0 && <tr><td colSpan="7" className="py-16 text-center text-sm text-slate-300">ไม่พบข้อมูล</td></tr>}
                </tbody>
              </table>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {drillGroups.map((g, gi) => {
                  const head = g.head
                  const isExpanded = expandedTeams[g.key]
                  if (g.isTeam && g.members.length > 1) {
                    return (
                      <div key={g.key}>
                        <div onClick={() => setExpandedTeams((p) => ({ ...p, [g.key]: !p[g.key] }))} className="p-4 cursor-pointer hover:bg-orange-50/50 bg-orange-50/20">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              <span className={`transition-transform ${isExpanded ? "rotate-90" : ""} text-[#F15A24]`}>›</span>
                              <Ico.users className="w-3.5 h-3.5 text-[#F15A24]" /> {g.theme || "(ไม่มีชื่อธีม)"}
                            </div>
                            <StatusBadge status={head.status} />
                          </div>
                          <div className="text-xs text-slate-500 line-clamp-1 mb-1 pl-6">{head.course_name}</div>
                          <div className="text-[11px] text-slate-400 pl-6">ทีม {g.members.length} คน · หัวหน้า {head.full_name}</div>
                        </div>
                        {isExpanded && g.members.map((r, mi) => (
                          <div key={g.key + "-" + mi} onClick={() => openUser(r)} className="p-3 pl-8 cursor-pointer hover:bg-orange-50/40 bg-slate-50/40 border-t border-slate-50">
                            <div className="font-medium text-slate-700 text-sm">{mi + 1}. {r.full_name} {r.nickname && <span className="text-slate-400 font-normal text-xs">({r.nickname})</span>}</div>
                            <div className="flex flex-wrap gap-x-3 text-xs text-slate-400 mt-0.5"><span>{r.grade_level}</span><span className="font-mono">{r.phone}</span></div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  const r = head
                  return (
                    <div key={g.key} onClick={() => openUser(r)} className="p-4 cursor-pointer hover:bg-orange-50/50">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <div className="font-bold text-slate-800 text-sm">{r.full_name}</div><StatusBadge status={r.status} />
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1 mb-1">{r.course_name}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-slate-400"><span>{r.grade_level}</span><span>{r.province}</span><span className="font-mono">{r.phone}</span></div>
                    </div>
                  )
                })}
                {drillGroups.length === 0 && <div className="py-16 text-center text-sm text-slate-300">ไม่พบข้อมูล</div>}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-between items-center shrink-0">
              <span className="text-xs text-slate-400">{drillGroups.length} ทีม/คน · {drillList.length} รายชื่อ</span>
              <div className="flex gap-2">
                <button onClick={() => exportCombined(drillList, drill.title)} className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F15A24] rounded-xl text-sm font-bold transition"><Ico.download className="w-4 h-4" /> Export</button>
                <button onClick={() => setDrill(null)} className="px-5 py-2 bg-[#F15A24] hover:bg-[#c44215] text-white rounded-xl text-sm font-bold transition">ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setSelectedUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 text-white flex justify-between items-start shrink-0">
              <div>
                <p className="text-xs opacity-75 mb-0.5">ข้อมูลผู้สมัคร</p>
                <h3 className="font-bold text-lg leading-tight">{selectedUser.full_name}</h3>
                {selectedUser.nickname && <p className="text-xs opacity-75">({selectedUser.nickname})</p>}
              </div>
              <button onClick={() => setSelectedUser(null)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center font-bold text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[["เลขประจำตัว", selectedUser.participant_code], ["ระดับชั้น", selectedUser.grade_level], ["โรงเรียน", selectedUser.school], ["จังหวัด", selectedUser.province], ["เบอร์โทร", selectedUser.phone], ["อีเมล", selectedUser.submitter_email], ["ผู้ปกครอง", selectedUser.parent_name], ["เบอร์ผู้ปกครอง", selectedUser.parent_phone]].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-slate-800 mt-0.5 break-words">{val || "-"}</p>
                  </div>
                ))}
              </div>
              <hr className="border-slate-100" />
              {/* ประวัติการสมัครทุกวิชา */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Ico.card className="w-3.5 h-3.5 text-[#F15A24]" /> ประวัติการสมัคร ({selectedUser.transactions?.length || 0})</p>
                {(selectedUser.transactions || []).map((tx, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 mb-2 border border-slate-100 flex justify-between items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">{tx.course_name}</p>
                      <p className="text-[10px] text-slate-400">{tx.created.toLocaleDateString("th-TH")} {Number(tx.price) > 0 ? `· ฿${Number(tx.price).toLocaleString()}` : "· ฟรี"}</p>
                    </div>
                    <StatusBadge status={tx.status} />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end">
              <button onClick={() => setSelectedUser(null)} className="px-5 py-2 bg-[#F15A24] hover:bg-[#c44215] text-white rounded-xl text-sm font-bold transition">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Course Detail Modal */}
      {courseDetail && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setCourseDetail(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl flex flex-col max-h-[92dvh] shadow-2xl rounded-t-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-start gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-orange-200 text-[10px] uppercase tracking-widest mb-0.5">สรุปวิชา</p>
                <h3 className="text-base font-bold text-white leading-snug">{courseDetail.courseName}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => exportCombined(courseDetail.regs, `วิชา_${courseDetail.courseName}`)} className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-bold transition"><Ico.download className="w-4 h-4" /> Export</button>
                <button onClick={() => setCourseDetail(null)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
              </div>
            </div>
            <div className={`grid ${courseDetail.isTeam ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"} divide-x divide-slate-100 border-b border-slate-100 shrink-0`}>
              {courseDetail.isTeam && <div className="px-3 py-3 text-center"><p className="text-[10px] text-slate-400 mb-0.5">ธีม</p><p className="text-base font-extrabold text-violet-600">{courseDetail.themeCount}</p></div>}
              <div className="px-3 py-3 text-center"><p className="text-[10px] text-slate-400 mb-0.5">ผู้สมัคร</p><p className="text-base font-extrabold text-slate-700">{courseDetail.allRegs.length}</p></div>
              <div className="px-3 py-3 text-center"><p className="text-[10px] text-slate-400 mb-0.5">อนุมัติแล้ว</p><p className="text-base font-extrabold text-emerald-600">{courseDetail.approvedCount}</p></div>
              <div className="px-3 py-3 text-center"><p className="text-[10px] text-slate-400 mb-0.5">รอพิจารณา</p><p className="text-base font-extrabold text-sky-600">{courseDetail.pendingCount}</p></div>
              <div className="px-3 py-3 text-center"><p className="text-[10px] text-slate-400 mb-0.5">คิวสำรอง</p><p className="text-base font-extrabold text-slate-400">{courseDetail.waitlistCount}</p></div>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Ico.users className="w-3.5 h-3.5 text-[#F15A24]" /> รายชื่อผู้สมัคร ({courseDetail.allRegs.length})</p>
              {courseDetail.allRegs.length === 0 ? (
                <p className="text-center text-slate-300 text-sm py-6">ยังไม่มีผู้สมัคร</p>
              ) : (() => {
                // จัดกลุ่มตามธีม (ถ้าไม่มีธีม → ไม่มีคอลัมน์ธีม)
                const groupMap = {}
                courseDetail.allRegs.forEach((r) => {
                  const key = (r.theme_name || "").trim()
                  if (!groupMap[key]) groupMap[key] = []
                  groupMap[key].push(r)
                })
                const hasThemes = Object.keys(groupMap).some((k) => k !== "")
                const themeGroups = Object.entries(groupMap).map(([name, members]) => ({ name, members })).sort((a, b) => b.members.length - a.members.length)
                return (
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider">
                          {hasThemes && <th className="text-center font-bold px-2 py-2 w-10">ธีม</th>}
                          {hasThemes && <th className="text-left font-bold px-2 py-2">ชื่อธีม</th>}
                          <th className="text-left font-bold px-2 py-2">สมาชิก</th>
                          <th className="text-left font-bold px-2 py-2">โรงเรียน</th>
                          <th className="text-left font-bold px-2 py-2">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hasThemes
                          ? themeGroups.flatMap((g, gi) => g.members.map((r, mi) => (
                              <tr key={r.id || `${gi}-${mi}`} className="border-t border-slate-100 align-top">
                                {mi === 0 && <td rowSpan={g.members.length} className="px-2 py-2 text-center font-black text-[#F15A24] border-r border-slate-100">{gi + 1}</td>}
                                {mi === 0 && <td rowSpan={g.members.length} className="px-2 py-2 font-semibold text-slate-700 border-r border-slate-100 align-top w-36 break-words">{g.name || "(ไม่มีชื่อธีม)"}</td>}
                                <td className="px-2 py-2 text-slate-700 whitespace-nowrap">{r.full_name || "ไม่ระบุ"}</td>
                                <td className="px-2 py-2 text-slate-500 break-words">{r.school || "ไม่ระบุ"}</td>
                                <td className="px-2 py-2"><StatusBadge status={r.status} /></td>
                              </tr>
                            )))
                          : courseDetail.allRegs.map((r, i) => (
                              <tr key={r.id || i} className="border-t border-slate-100">
                                <td className="px-2 py-2 text-slate-700 whitespace-nowrap">{r.full_name || "ไม่ระบุ"}</td>
                                <td className="px-2 py-2 text-slate-500 break-words">{r.school || "ไม่ระบุ"}</td>
                                <td className="px-2 py-2"><StatusBadge status={r.status} /></td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end items-center shrink-0">
              <button onClick={() => setCourseDetail(null)} className="px-5 py-2 bg-[#F15A24] hover:bg-[#c44215] text-white rounded-xl text-sm font-bold transition">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Export modal — ลิสต์เดียว: รวม / แยก / เลือกวิชาเดียว */}
      {exportOpen && (() => {
        const courses = groupByCourse(filtered)
        // ตัวเลือกพิเศษด้านบน + รายวิชาด้านล่าง
        const specials = [
          { key: "__combined", title: "รวมทุกวิชา (1 ไฟล์)", desc: "แยก section ตามวิชาในไฟล์เดียว", run: () => exportCombined(filtered, `Dashboard_${timeLabels[timeFilter]}`) },
          { key: "__split", title: "แยกไฟล์ทุกวิชา", desc: `ดาวน์โหลด ${courses.length} ไฟล์ (ไฟล์ละวิชา)`, run: () => exportSplit(filtered) },
        ]
        const courseOpts = courses.map((c) => ({
          key: c.courseName, title: c.courseName, desc: `${c.regs.length} คน · 1 ไฟล์`,
          run: () => exportCombined(c.regs, `วิชา_${c.courseName}`),
        }))
        const allOpts = [...specials, ...courseOpts]
        const runExport = () => {
          const sel = allOpts.find((o) => o.key === exportSel) || specials[0]
          sel.run(); setExportOpen(false)
        }
        const Row = (o) => (
          <button key={o.key} onClick={() => setExportSel(o.key)}
            className={`w-full text-left rounded-xl border p-3 transition flex items-start gap-3 ${exportSel === o.key ? "border-[#F15A24] bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${exportSel === o.key ? "border-[#F15A24]" : "border-slate-300"}`}>
              {exportSel === o.key && <span className="w-2 h-2 rounded-full bg-[#F15A24]" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800 truncate">{o.title}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{o.desc}</span>
            </span>
          </button>
        )
        return (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setExportOpen(false)}>
            <div className="bg-white w-full sm:rounded-2xl sm:max-w-md flex flex-col max-h-[85dvh] sm:max-h-[80vh] shadow-2xl rounded-t-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-[#F15A24] to-amber-500 px-5 py-4 flex justify-between items-center shrink-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2"><Ico.download className="w-4 h-4" /> Export ข้อมูล</h3>
                <button onClick={() => setExportOpen(false)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
              </div>
              <div className="p-4 space-y-2 overflow-y-auto flex-1">
                {specials.map(Row)}
                {courseOpts.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 pb-0.5">
                    <span className="text-[11px] font-bold text-slate-400">เลือกเฉพาะวิชา</span>
                    <span className="h-px bg-slate-100 flex-1" />
                  </div>
                )}
                {courseOpts.map(Row)}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2 shrink-0">
                <button onClick={() => setExportOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition">ยกเลิก</button>
                <button onClick={runExport}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#F15A24] hover:bg-[#c44215] text-white rounded-xl text-sm font-bold transition"><Ico.download className="w-4 h-4" /> Export</button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}