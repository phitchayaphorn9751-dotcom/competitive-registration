import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { fetchDashboardStats, fetchAttendanceByCourse } from "../../lib/supabase.js"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid,
} from "recharts"

const ORANGE = "#F15A24"
const PIE_COLORS = ["#2f9e44", "#f08c00", "#7048e8", "#1971c2", "#868e96"]

export default function AdminDashboard() {
  const { event } = useOutletContext()
  const [stats, setStats] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!event?.id) { setLoading(false); return }
    setLoading(true)
    Promise.all([fetchDashboardStats(event.id), fetchAttendanceByCourse(event.id)])
      .then(([s, a]) => { setStats(s); setAttendance(a || []) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [event])

  if (!event) return <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm border border-gray-200">ยังไม่มีงาน — สร้างงานในเมนู "จัดการรายวิชา"</div>
  if (loading) return (
    <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-2 border-[#F15A24] border-t-transparent rounded-full animate-spin" /></div>
  )
  if (err) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
      <p className="text-red-600 font-bold mb-1">โหลด Dashboard ไม่สำเร็จ</p>
      <p className="text-sm text-red-500">{err}</p>
      <p className="text-xs text-gray-400 mt-2">ถ้าเพิ่งติดตั้ง อาจยังไม่ได้รัน admin_features.sql ใน Supabase</p>
    </div>
  )
  if (!stats) return <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm border">ยังไม่มีข้อมูลสรุป</div>

  const fillPct = stats.total_capacity > 0 ? Math.round((stats.total_taken / stats.total_capacity) * 100) : 0

  const cards = [
    { label: "คอร์สทั้งหมด", value: stats.total_courses, sub: `เปิดรับ ${stats.open_courses}`, icon: "📚", color: "from-orange-400 to-orange-500" },
    { label: "ที่นั่งถูกจอง", value: `${stats.total_taken}/${stats.total_capacity}`, sub: `${fillPct}% เต็ม`, icon: "🪑", color: "from-blue-400 to-blue-500" },
    { label: "การสมัครทั้งหมด", value: stats.total_registrations, sub: `ยืนยันแล้ว ${stats.confirmed}`, icon: "📝", color: "from-green-400 to-green-500" },
    { label: "รอดำเนินการ", value: stats.pending, sub: `คิวสำรอง ${stats.waitlist}`, icon: "⏳", color: "from-amber-400 to-amber-500" },
    { label: "ผู้เข้าร่วม", value: stats.total_participants, sub: `เช็คอินแล้ว ${stats.checked_in}`, icon: "👥", color: "from-purple-400 to-purple-500" },
    { label: "รายได้ (ยืนยันแล้ว)", value: `฿${(stats.total_revenue || 0).toLocaleString()}`, sub: "จากสลิปที่ตรวจแล้ว", icon: "💰", color: "from-rose-400 to-rose-500" },
  ]

  // กราฟแท่ง: เช็คอินรายคอร์ส
  const barData = attendance.map((a) => ({
    name: a.title.length > 12 ? a.title.slice(0, 12) + "…" : a.title,
    fullName: a.title,
    ผู้เข้าร่วม: Number(a.total_participants) || 0,
    เช็คอิน: Number(a.checked_in) || 0,
  }))

  // กราฟวงกลม: สัดส่วนสถานะ
  const pieData = [
    { name: "ยืนยันแล้ว", value: stats.confirmed || 0 },
    { name: "รอดำเนินการ", value: stats.pending || 0 },
    { name: "คิวสำรอง", value: stats.waitlist || 0 },
  ].filter((d) => d.value > 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800 border-l-4 border-[#F15A24] pl-3 leading-tight">Dashboard</h1>
        <p className="text-sm text-gray-400 pl-3 mt-0.5">ภาพรวม {event.name} {event.year}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${c.color}`} />
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium mb-1">{c.label}</p>
                <p className="text-xl sm:text-2xl font-black text-gray-800 leading-none">{c.value}</p>
                <p className="text-[11px] text-gray-400 mt-1.5">{c.sub}</p>
              </div>
              <span className="text-2xl opacity-80 shrink-0 ml-2">{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Seat fill progress */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-gray-700">อัตราการเต็มของที่นั่ง</span>
          <span className={`text-sm font-black ${fillPct >= 90 ? "text-red-500" : fillPct >= 70 ? "text-orange-500" : "text-green-600"}`}>{fillPct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${fillPct >= 90 ? "bg-red-500" : fillPct >= 70 ? "bg-orange-400" : "bg-green-500"}`} style={{ width: `${fillPct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{stats.total_taken} จาก {stats.total_capacity} ที่นั่ง</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar chart: check-in per course */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">เช็คอินรายคอร์ส</h3>
          {barData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">ยังไม่มีข้อมูล</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, barData.length * 48)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f1" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#999" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#666" }} width={90} />
                <Tooltip formatter={(v, n) => [v, n]} labelFormatter={(_, p) => p?.[0]?.payload?.fullName || ""}
                  contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ผู้เข้าร่วม" fill="#dbe4ff" radius={[0, 4, 4, 0]} />
                <Bar dataKey="เช็คอิน" fill={ORANGE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart: status breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">สัดส่วนสถานะการสมัคร</h3>
          {pieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">ยังไม่มีข้อมูล</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} label={(e) => e.value}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}