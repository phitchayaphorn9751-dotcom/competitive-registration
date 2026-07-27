// ───────────────────────────────────────────────────────────
// บัญชี "เช็คอินอย่างเดียว" — เข้าระบบได้เฉพาะหน้า Check-in
// ใช้บัญชีกลางร่วมกัน (อีเมล+รหัสผ่านชุดเดียว) แจกทีมงานเช็คอิน
// เพิ่ม/แก้อีเมลได้ที่นี่ หรือผ่าน env VITE_CHECKIN_EMAILS (คั่นด้วย ,)
// ───────────────────────────────────────────────────────────

const DEFAULT_CHECKIN_EMAILS = ["checkin@camt.info"]

const envList = (import.meta.env?.VITE_CHECKIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const CHECKIN_EMAILS = (envList.length ? envList : DEFAULT_CHECKIN_EMAILS).map((e) => e.toLowerCase())

// เป็นบัญชีเช็คอินอย่างเดียวไหม (ดูจากอีเมลใน session — ไม่ต้องยิง RPC เพิ่ม)
export function isCheckinOnly(session) {
  const email = (session?.user?.email || "").trim().toLowerCase()
  return !!email && CHECKIN_EMAILS.includes(email)
}
