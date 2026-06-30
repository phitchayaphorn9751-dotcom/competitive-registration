// ───────────────────────────────────────────────────────────
// สีหมวดหมู่กลาง — ใช้ร่วมทุกหน้า
// admin เลือกสีจากจานนี้ที่หน้า settings → เก็บ key (เช่น "orange") ใน course_types.color
// ทุกหน้าเรียก catColor(course.course_types) เพื่อได้ class เดียวกันเสมอ
// ───────────────────────────────────────────────────────────

// จานสี 10 สี (key → class ครบชุด)
export const CATEGORY_COLORS = [
  { key: "orange",  label: "ส้ม",     dot: "bg-[#F15A24]", bg: "bg-orange-100",  text: "text-orange-700",  ring: "ring-orange-400" },
  { key: "sky",     label: "ฟ้า",     dot: "bg-sky-500",   bg: "bg-sky-100",     text: "text-sky-700",     ring: "ring-sky-400" },
  { key: "emerald", label: "เขียว",   dot: "bg-emerald-500", bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-400" },
  { key: "violet",  label: "ม่วง",    dot: "bg-violet-500", bg: "bg-violet-100",  text: "text-violet-700",  ring: "ring-violet-400" },
  { key: "pink",    label: "ชมพู",    dot: "bg-pink-500",  bg: "bg-pink-100",    text: "text-pink-700",    ring: "ring-pink-400" },
  { key: "cyan",    label: "เขียวน้ำทะเล", dot: "bg-cyan-500", bg: "bg-cyan-100", text: "text-cyan-700",   ring: "ring-cyan-400" },
  { key: "amber",   label: "เหลือง",  dot: "bg-amber-500", bg: "bg-amber-100",   text: "text-amber-700",   ring: "ring-amber-400" },
  { key: "indigo",  label: "คราม",    dot: "bg-indigo-500", bg: "bg-indigo-100", text: "text-indigo-700",  ring: "ring-indigo-400" },
  { key: "teal",    label: "เขียวมิ้นต์", dot: "bg-teal-500", bg: "bg-teal-100",  text: "text-teal-700",    ring: "ring-teal-400" },
  { key: "rose",    label: "แดงกุหลาบ", dot: "bg-rose-500", bg: "bg-rose-100",   text: "text-rose-700",    ring: "ring-rose-400" },
]

// map key → config (เร็วกว่า find ทุกครั้ง)
const BY_KEY = Object.fromEntries(CATEGORY_COLORS.map((c) => [c.key, c]))

// hash ชื่อ → สี (ใช้สำรอง กรณีหมวดยังไม่ได้ตั้งสี — ข้อมูลเก่า)
function hashColor(name) {
  if (!name) return CATEGORY_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length]
}

// ── ฟังก์ชันหลัก: รับ course_types object (หรือ {color,label}) → คืน config สี ──
// ใช้ color จาก DB ก่อน ถ้าไม่มีค่อย hash จากชื่อ (กันหน้าเก่าพัง)
// รองรับทั้ง object {color,label} และ string (ชื่อหมวดเฉยๆ — จะ hash ตามชื่อ)
export function catColor(type) {
  if (!type) return CATEGORY_COLORS[0]
  if (typeof type === "string") return hashColor(type)
  const key = type.color
  if (key && BY_KEY[key]) return BY_KEY[key]
  return hashColor(type.label || "")
}

// แปลง key สี → config (สำหรับหน้าที่มีแค่ color key เช่น จาก RPC)
export function colorByKey(key) {
  if (key && BY_KEY[key]) return BY_KEY[key]
  return null
}