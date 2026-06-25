import { useState, useEffect, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchDashboardRegistrations } from "../../lib/supabase.js"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area,
} from "recharts"

const PIE_COLORS = ["#f15a24", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"]
const BAR_COLORS = ["#f15a24", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]

// สถานะระบบเรา
const STATUS_CFG = {
  confirmed: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "ยืนยันแล้ว" },
  approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "อนุมัติแล้ว" },
  slip_uploaded: { cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400", label: "รอตรวจสลิป" },
  submitted: { cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400", label: "รอพิจารณา" },
  pending_payment: { cls: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-400", label: "รอชำระเงิน" },
  waitlist: { cls: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "คิวสำรอง" },
  rejected: { cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", label: "ไม่ผ่าน" },
  expired: { cls: "bg-red-50 text-red-400 border-red-100", dot: "bg-red-300", label: "หมดเวลา" },
  held: { cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400", label: "กันที่นั่ง" },
}
const PAID_STATUSES = ["confirmed", "approved"]

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { cls: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: status || "-" }
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${c.cls}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />{c.label}</span>
}

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h3 className="font-semibold text-gray-700 text-sm">{title}</h3>{action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const TOOLTIP_STYLE = { borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,.10)", fontSize: "12px" }

export default function AdminDashboard() {
  const { event } = useOutletContext()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState("ALL")
  const [customDate, setCustomDate] = useState("")
  const [drill, setDrill] = useState(null)      // {title, list}
  const [drillSearch, setDrillSearch] = useState("")
  const [drillStatus, setDrillStatus] = useState("All")
  const [drillCourse, setDrillCourse] = useState("All")
  const [selectedUser, setSelectedUser] = useState(null)
  const [courseDetail, setCourseDetail] = useState(null)

  useEffect(() => {
    if (!event?.id) { setLoading(false); return }
    setLoading(true)
    fetchDashboardRegistrations(event.id)
      .then((data) => setRows((data || []).map((r) => ({ ...r, created: r.created_at ? new Date(r.created_at) : new Date() }))))
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
  }, [rows, timeFilter, customDate])

  const isPaid = (r) => PAID_STATUSES.includes(r.status)

  // unique users (by email)
  const uniqueUsers = useMemo(() => {
    const m = new Map()
    filtered.forEach((r) => { if (!m.has(r.submitter_email)) m.set(r.submitter_email, r) })
    return Array.from(m.values())
  }, [filtered])

  const stats = useMemo(() => {
    const totalIncome = filtered.filter(isPaid).reduce((s, r) => s + Number(r.price || 0), 0)
    const uniquePaid = new Set(filtered.filter(isPaid).map((r) => r.submitter_email)).size
    return {
      totalUsers: uniqueUsers.length,
      totalIncome,
      pendingSlips: filtered.filter((r) => r.status === "slip_uploaded").length,
      uniquePaid,
    }
  }, [filtered, uniqueUsers])

  const trendData = useMemo(() => {
    const t = {}
    filtered.forEach((r) => { const k = r.created.toLocaleDateString("en-GB"); t[k] = (t[k] || 0) + 1 })
    return Object.entries(t).map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date.split("/").reverse().join("-")) - new Date(b.date.split("/").reverse().join("-")))
  }, [filtered])

  const courseChartData = useMemo(() => {
    const m = {}
    filtered.filter(isPaid).forEach((r) => {
      if (!m[r.course_id]) m[r.course_id] = { fullName: r.course_name, courseId: r.course_id, Applicants: 0, TotalRevenue: 0 }
      m[r.course_id].Applicants++; m[r.course_id].TotalRevenue += Number(r.price || 0)
    })
    return Object.values(m).sort((a, b) => b.Applicants - a.Applicants)
  }, [filtered])

  const categoryData = useMemo(() => {
    const c = {}
    filtered.forEach((r) => { const k = r.course_category || "อื่นๆ"; c[k] = (c[k] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [filtered])

  const schoolRanking = useMemo(() => {
    const c = {}
    uniqueUsers.forEach((r) => { c[r.school] = (c[r.school] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [uniqueUsers])

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
    setCourseDetail({ courseName, regs, schools, grades, revenue: regs.reduce((s, r) => s + Number(r.price || 0), 0) })
  }

  // ประวัติการสมัครทุกวิชาของ user (จาก email)
  function openUser(r) {
    const txs = rows.filter((x) => x.submitter_email === r.submitter_email)
    setSelectedUser({ ...r, transactions: txs })
  }

  // drill helpers
  function drillDown(title, fn) { setDrill({ title, list: filtered.filter(fn) }); setDrillSearch(""); setDrillStatus("All"); setDrillCourse("All") }
  const drillList = useMemo(() => {
    if (!drill) return []
    return drill.list.filter((r) => {
      const q = drillSearch.toLowerCase()
      const ms = !q || (r.full_name || "").toLowerCase().includes(q) || (r.phone || "").includes(q)
      const mst = drillStatus === "All" || r.status === drillStatus
      const mc = drillCourse === "All" || r.course_name === drillCourse
      return ms && mst && mc
    })
  }, [drill, drillSearch, drillStatus, drillCourse])

  function exportXlsx(list, name) {
    // ใช้ CSV (เปิดใน Excel ได้ ไม่ต้องลง library เพิ่ม) — มี BOM รองรับภาษาไทย
    const cols = [
      ["วันที่สมัคร", (r) => r.created.toLocaleString("th-TH")],
      ["เลขประจำตัว", (r) => r.participant_code || "-"],
      ["ชื่อ-สกุล", (r) => r.full_name || "-"],
      ["ชื่อเล่น", (r) => r.nickname || "-"],
      ["ระดับชั้น", (r) => r.grade_level || "-"],
      ["โรงเรียน", (r) => r.school || "-"],
      ["จังหวัด", (r) => r.province || "-"],
      ["หมวดวิชา", (r) => r.course_category || "-"],
      ["วิชาที่สมัคร", (r) => r.course_name || "-"],
      ["ราคา", (r) => Number(r.price || 0)],
      ["สถานะ", (r) => STATUS_CFG[r.status]?.label || r.status],
      ["เบอร์โทร", (r) => r.phone || "-"],
      ["อีเมล", (r) => r.submitter_email || "-"],
      ["ผู้ปกครอง", (r) => r.parent_name || "-"],
      ["เบอร์ผู้ปกครอง", (r) => r.parent_phone || "-"],
    ]
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [cols.map(([h]) => esc(h)).join(",")]
    list.forEach((r) => lines.push(cols.map(([, fn]) => esc(fn(r))).join(",")))
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    const safe = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
    a.href = url; a.download = `${safe}_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  if (!event) return <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm border border-gray-200">ยังไม่มีงาน — สร้างงานในเมนูตั้งค่าเว็บ</div>
  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
      <div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /><span>กำลังโหลดข้อมูล…</span>
    </div>
  )

  const timeLabels = { TODAY: "วันนี้", WEEK: "สัปดาห์นี้", MONTH: "เดือนนี้", ALL: "ทั้งหมด" }
  const kpiCards = [
    { title: "ผู้สมัครทั้งหมด", value: stats.totalUsers.toLocaleString(), unit: "คน", color: "#3b82f6", bg: "#eff6ff", icon: "👥", onClick: () => drillDown("ผู้สมัครทั้งหมด", () => true) },
    { title: "รายได้รวม", value: stats.totalIncome.toLocaleString(), unit: "฿", color: "#10b981", bg: "#ecfdf5", icon: "💰", onClick: () => drillDown("ชำระแล้ว", isPaid) },
    { title: "Conversion", value: stats.totalUsers > 0 ? ((stats.uniquePaid / stats.totalUsers) * 100).toFixed(1) : 0, unit: "%", color: "#8b5cf6", bg: "#f5f3ff", icon: "📈", onClick: () => drillDown("ชำระแล้ว", isPaid) },
    { title: "รอตรวจสลิป", value: stats.pendingSlips.toLocaleString(), unit: "รายการ", color: "#f15a24", bg: "#fff7f5", icon: "⏳", onClick: () => drillDown("รอตรวจสลิป", (r) => r.status === "slip_uploaded") },
  ]
  const statusBadges = [
    { label: "คิวสำรอง", value: filtered.filter((r) => r.status === "waitlist").length, status: "waitlist", filter: (r) => r.status === "waitlist" },
    { label: "รอชำระ", value: filtered.filter((r) => r.status === "pending_payment").length, status: "pending_payment", filter: (r) => r.status === "pending_payment" },
    { label: "ไม่ผ่าน", value: filtered.filter((r) => r.status === "rejected").length, status: "rejected", filter: (r) => r.status === "rejected" },
  ]

  return (
    <div className="space-y-4 pb-20">
      {/* Header + filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800 leading-tight">📊 Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">{event.name} {event.year} — ภาพรวม & วิเคราะห์</p>
          </div>
          <button onClick={() => exportXlsx(filtered, `Dashboard_${timeLabels[timeFilter]}`)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap shrink-0">
            ⬇ <span className="hidden sm:inline">Export</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-xl gap-0.5">
            {Object.entries(timeLabels).map(([k, v]) => (
              <button key={k} onClick={() => setTimeFilter(k)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${timeFilter === k ? "bg-white text-[#f15a24] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{v}</button>
            ))}
          </div>
          <input type="date" value={customDate} onChange={(e) => { setCustomDate(e.target.value); setTimeFilter("CUSTOM") }}
            className={`flex-1 min-w-0 sm:flex-none px-3 py-1.5 rounded-xl text-xs border outline-none focus:ring-2 focus:ring-[#f15a24] transition ${timeFilter === "CUSTOM" ? "border-[#f15a24] bg-orange-50 text-[#f15a24] font-bold" : "border-gray-200 text-gray-600"}`} />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <button key={k.title} onClick={k.onClick}
            className="text-left rounded-2xl p-4 sm:p-5 border transition hover:shadow-md active:scale-[.98] relative overflow-hidden"
            style={{ backgroundColor: k.bg, borderColor: `${k.color}22` }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: k.color }}>{k.title}</p>
            <p className="text-2xl sm:text-3xl font-extrabold leading-none" style={{ color: k.color }}>
              {k.value}<span className="text-xs font-normal ml-1 opacity-60">{k.unit}</span>
            </p>
            <span className="absolute right-3 bottom-2 text-5xl opacity-10 select-none">{k.icon}</span>
          </button>
        ))}
      </div>

      {/* Status badges */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-400 mr-1 hidden sm:inline">สถานะอื่นๆ</span>
        {statusBadges.map((b) => (
          <button key={b.label} onClick={() => drillDown(b.label, b.filter)}
            className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-xs font-bold transition hover:shadow-sm active:scale-95 ${STATUS_CFG[b.status]?.cls || "bg-gray-100 text-gray-500 border-gray-200"}`}>
            {b.label}<span className="bg-black/10 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none">{b.value}</span>
          </button>
        ))}
        <p className="text-[11px] text-gray-300 ml-auto hidden sm:block">คลิกการ์ดหรือ badge เพื่อดูรายชื่อ</p>
      </div>

      {/* Trend + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="📈 แนวโน้มการสมัคร" action={<span className="text-xs text-gray-400">{trendData.length} วัน</span>}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs><linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f15a24" stopOpacity={0.25} /><stop offset="95%" stopColor="#f15a24" stopOpacity={0} />
                  </linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" fontSize={10} tick={{ fill: "#9ca3af" }} />
                  <YAxis allowDecimals={false} fontSize={10} tick={{ fill: "#9ca3af" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="count" name="ผู้สมัคร" stroke="#f15a24" strokeWidth={2} fill="url(#grad1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
        <SectionCard title="🔥 ความนิยมตามหมวด">
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
        <SectionCard title="📍 5 จังหวัดมาแรง">
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
        <SectionCard title="🏫 อันดับโรงเรียน (Top 10)">
          <div className="overflow-y-auto max-h-56 space-y-1">
            {schoolRanking.map((s, i) => {
              const pct = Math.round((s.value / (schoolRanking[0]?.value || 1)) * 100)
              return (
                <div key={i} onClick={() => drillDown(`โรงเรียน: ${s.name}`, (r) => r.school === s.name)}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-orange-50/60 cursor-pointer transition">
                  <span className="text-xs font-bold text-gray-300 w-5 text-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 truncate mb-1">{s.name}</div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#f15a24] to-orange-300" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <span className="text-xs font-bold text-gray-500 shrink-0">{s.value} คน</span>
                </div>
              )
            })}
            {schoolRanking.length === 0 && <p className="text-center text-gray-300 text-sm py-8">ยังไม่มีข้อมูล</p>}
          </div>
        </SectionCard>
      </div>

      {/* กราฟความสนใจตามชั้นปี × หมวด */}
      <SectionCard title="🧩 ความสนใจตามชั้นปี (แยกตามหมวดวิชา)">
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

      {/* Course ranking */}
      <SectionCard title="🏆 อันดับวิชายอดฮิต" action={<span className="text-xs font-bold text-[#f15a24] bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">คลิกวิชาเพื่อดูรายละเอียด</span>}>
        <div className="overflow-y-auto max-h-80 -mx-5 px-5">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-gray-50">
              <tr className="text-[10px] text-gray-400 uppercase">
                <th className="py-2 text-center w-7">#</th><th className="py-2 text-left">วิชา</th>
                <th className="py-2 text-right pr-2">สมัคร</th><th className="py-2 text-right">รายได้</th>
              </tr>
            </thead>
            <tbody>
              {courseChartData.map((c, i) => (
                <tr key={i} onClick={() => openCourseDetail(c.courseId, c.fullName)}
                  className="border-b last:border-0 hover:bg-orange-50/50 cursor-pointer transition">
                  <td className="py-3 text-center font-bold text-gray-300">{i + 1}</td>
                  <td className="py-3 font-medium text-gray-700 max-w-[140px]"><span className="line-clamp-2 leading-snug">{c.fullName}</span></td>
                  <td className="py-3 text-right font-bold text-gray-600 pr-2 whitespace-nowrap">{c.Applicants} คน</td>
                  <td className="py-3 text-right font-bold text-[#f15a24] whitespace-nowrap">฿{c.TotalRevenue.toLocaleString()}</td>
                </tr>
              ))}
              {courseChartData.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-gray-300">ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Drill-down modal */}
      {drill && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && setDrill(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl flex flex-col max-h-[95dvh] sm:max-h-[90vh] shadow-2xl rounded-t-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#f15a24] to-[#e04510] px-5 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">{drill.title}</h3>
                <p className="text-orange-100 text-xs mt-0.5">พบ {drillList.length} จาก {drill.list.length} รายการ</p>
              </div>
              <button onClick={() => setDrill(null)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center">×</button>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input type="text" placeholder="🔍 ค้นหาชื่อ, เบอร์…" value={drillSearch} onChange={(e) => setDrillSearch(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#f15a24] text-xs bg-white" />
              <select value={drillCourse} onChange={(e) => setDrillCourse(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs outline-none focus:ring-2 focus:ring-[#f15a24]">
                <option value="All">📚 ทุกวิชา</option>
                {[...new Set(drill.list.map((i) => i.course_name))].sort().map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={drillStatus} onChange={(e) => setDrillStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs outline-none focus:ring-2 focus:ring-[#f15a24]">
                <option value="All">ทุกสถานะ</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs hidden sm:table">
                <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase sticky top-0 border-b border-gray-100">
                  <tr><th className="px-4 py-3 text-center w-10">#</th><th className="px-4 py-3">ชื่อ-สกุล</th><th className="px-4 py-3">ระดับชั้น</th><th className="px-4 py-3">วิชา</th><th className="px-4 py-3">จังหวัด</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">เบอร์</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {drillList.map((r, i) => (
                    <tr key={i} onClick={() => openUser(r)} className="hover:bg-orange-50/50 transition cursor-pointer">
                      <td className="px-4 py-3 text-center text-gray-300 font-bold">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.full_name} {r.nickname && <span className="text-gray-400 font-normal">({r.nickname})</span>}</td>
                      <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-bold text-[10px]">{r.grade_level}</span></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px]"><span className="line-clamp-1">{r.course_name}</span></td>
                      <td className="px-4 py-3 text-gray-500">{r.province}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{r.phone}</td>
                    </tr>
                  ))}
                  {drillList.length === 0 && <tr><td colSpan="7" className="py-16 text-center text-sm text-gray-300">ไม่พบข้อมูล</td></tr>}
                </tbody>
              </table>
              <div className="sm:hidden divide-y divide-gray-100">
                {drillList.map((r, i) => (
                  <div key={i} onClick={() => openUser(r)} className="p-4 cursor-pointer hover:bg-orange-50/50">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div className="font-bold text-gray-800 text-sm">{r.full_name}</div><StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-gray-500 line-clamp-1 mb-1">{r.course_name}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-400"><span>{r.grade_level}</span><span>{r.province}</span><span className="font-mono">{r.phone}</span></div>
                  </div>
                ))}
                {drillList.length === 0 && <div className="py-16 text-center text-sm text-gray-300">ไม่พบข้อมูล</div>}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/80 flex justify-between items-center shrink-0">
              <span className="text-xs text-gray-400">แสดง {drillList.length} / {drill.list.length}</span>
              <div className="flex gap-2">
                <button onClick={() => exportXlsx(drillList, drill.title)} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold transition">⬇ Export</button>
                <button onClick={() => setDrill(null)} className="px-5 py-2 bg-gray-800 hover:bg-black text-white rounded-xl text-sm font-bold transition">ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setSelectedUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-[#f15a24] to-orange-400 px-5 py-4 text-white flex justify-between items-start shrink-0">
              <div>
                <p className="text-xs opacity-75 mb-0.5">ข้อมูลผู้สมัคร</p>
                <h3 className="font-bold text-lg leading-tight">{selectedUser.full_name}</h3>
                {selectedUser.nickname && <p className="text-xs opacity-75">({selectedUser.nickname})</p>}
              </div>
              <button onClick={() => setSelectedUser(null)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center font-bold text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[["เลขประจำตัว", selectedUser.participant_code], ["ระดับชั้น", selectedUser.grade_level], ["โรงเรียน", selectedUser.school], ["จังหวัด", selectedUser.province], ["เบอร์โทร", selectedUser.phone], ["อีเมล", selectedUser.submitter_email], ["ผู้ปกครอง", selectedUser.parent_name], ["เบอร์ผู้ปกครอง", selectedUser.parent_phone]].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5 break-words">{val || "-"}</p>
                  </div>
                ))}
              </div>
              <hr className="border-gray-100" />
              {/* ประวัติการสมัครทุกวิชา */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">💳 ประวัติการสมัคร ({selectedUser.transactions?.length || 0})</p>
                {(selectedUser.transactions || []).map((tx, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 mb-2 border border-gray-100 flex justify-between items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-700 truncate">{tx.course_name}</p>
                      <p className="text-[10px] text-gray-400">{tx.created.toLocaleDateString("th-TH")} {Number(tx.price) > 0 ? `· ฿${Number(tx.price).toLocaleString()}` : "· ฟรี"}</p>
                    </div>
                    <StatusBadge status={tx.status} />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end">
              <button onClick={() => setSelectedUser(null)} className="px-5 py-2 bg-gray-800 hover:bg-black text-white rounded-xl text-sm font-bold transition">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Course Detail Modal */}
      {courseDetail && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setCourseDetail(null)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-2xl flex flex-col max-h-[92dvh] shadow-2xl rounded-t-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#f15a24] to-[#e04510] px-5 py-4 flex justify-between items-start shrink-0">
              <div>
                <p className="text-orange-200 text-[10px] uppercase tracking-widest mb-0.5">สรุปวิชา</p>
                <h3 className="text-base font-bold text-white leading-snug">{courseDetail.courseName}</h3>
              </div>
              <button onClick={() => setCourseDetail(null)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
              <div className="px-4 py-3 text-center"><p className="text-[10px] text-gray-400 mb-0.5">ผู้สมัคร</p><p className="text-lg font-extrabold text-emerald-600">{courseDetail.regs.length} <span className="text-xs font-normal">คน</span></p></div>
              <div className="px-4 py-3 text-center"><p className="text-[10px] text-gray-400 mb-0.5">รายได้รวม</p><p className="text-lg font-extrabold text-[#f15a24]">฿{courseDetail.revenue.toLocaleString()}</p></div>
              <div className="px-4 py-3 text-center"><p className="text-[10px] text-gray-400 mb-0.5">โรงเรียน</p><p className="text-lg font-extrabold text-violet-600">{courseDetail.schools.length} <span className="text-xs font-normal">แห่ง</span></p></div>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* ระดับชั้น */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">🎓 สัดส่วนระดับชั้น</p>
                <div className="flex flex-wrap gap-2">
                  {courseDetail.grades.map((g, i) => (
                    <span key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-orange-100 bg-orange-50 text-xs font-bold text-[#f15a24]">
                      {g.name} <span className="bg-[#f15a24] text-white rounded-full px-1.5 py-0.5 text-[10px]">{g.count}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* โรงเรียน */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">🏫 โรงเรียนที่สมัคร ({courseDetail.schools.length})</p>
                <div className="space-y-2">
                  {courseDetail.schools.map((s, i) => {
                    const pct = Math.round((s.count / (courseDetail.schools[0]?.count || 1)) * 100)
                    return (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 border border-transparent">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-black text-white bg-[#f15a24] w-5 h-5 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">{s.name}</span>
                          <span className="text-sm font-extrabold text-gray-700 shrink-0">{s.count} <span className="text-[10px] font-normal text-gray-400">คน</span></span>
                        </div>
                        <div className="ml-7">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5"><div className="h-full rounded-full bg-gradient-to-r from-[#f15a24] to-orange-300" style={{ width: `${pct}%` }} /></div>
                          {s.grades?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {s.grades.map((g, gi) => (
                                <span key={gi} className="inline-flex items-center gap-1 bg-white border border-orange-100 text-[#f15a24] text-[10px] font-bold px-2 py-0.5 rounded-full">{g.name} <span className="text-orange-300">×{g.count}</span></span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {courseDetail.schools.length === 0 && <p className="text-center text-gray-300 text-sm py-6">ยังไม่มีผู้สมัครที่ยืนยันแล้ว</p>}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/80 flex justify-between items-center shrink-0">
              <button onClick={() => exportXlsx(courseDetail.regs, `วิชา_${courseDetail.courseName}`)} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold transition">⬇ Export Excel</button>
              <button onClick={() => setCourseDetail(null)} className="px-5 py-2 bg-gray-800 hover:bg-black text-white rounded-xl text-sm font-bold transition">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}