// ═══════════════════════════════════════════════════════════════════
// ตัวสร้างเกียรติบัตร PDF — วาดข้อความทับรูปพื้นหลัง แล้วฝังเป็นภาพลง PDF
// (ฝังเป็นภาพ ไม่ใช่ text → ไม่ต้องฝังฟอนต์ไทยใน PDF)
// ขนาดหน้า = สัดส่วนของรูปเทมเพลตจริง (ไม่ยัดลง A4 → ไม่ยืด ไม่บิด)
//
// ค่าที่เก็บใน event_settings (jsonb) — คีย์แบนระดับบนสุด:
//   cert_template_url : "url รูปพื้นหลัง"
//   cert_awards       : ["รางวัลชนะเลิศ", "รองชนะเลิศอันดับ 1", ...]
//   cert_fields       : {
//     name:   { x, y, size, color, weight, maxWidth },  // ชื่อผู้รับ
//     award:  { x, y, size, color, weight, maxWidth },  // ชื่อรางวัล
//     course: { x, y, size, color, weight, maxWidth },  // ชื่อคอร์ส
//     theme:  { x, y, size, color, weight, maxWidth },  // ชื่อทีม/ธีม (ว่าง = ไม่วาด)
//   }
//   x, y, maxWidth = เปอร์เซ็นต์ (0-100) ของความกว้าง/สูงใบ → ยืดหยุ่นกับทุกขนาดรูป
//   size           = พิกเซล อิงฐานรูปกว้าง 1000px แล้วสเกลตามรูปจริง
// ═══════════════════════════════════════════════════════════════════

// jsPDF โหลดแบบ dynamic import — ไม่ถ่วง bundle หน้าอื่น และไม่พึ่ง CDN
async function loadJsPDF() {
  const mod = await import("jspdf")
  return mod.jsPDF
}

// ค่า default ตำแหน่ง (อิงจากเทมเพลตตัวอย่าง CAMT) — admin ลากปรับได้ในหน้าออกเกียรติบัตร
export const DEFAULT_CERT_FIELDS = {
  name:   { x: 50, y: 47, size: 40, color: "#1e3a5f", weight: "normal", maxWidth: 80 },
  award:  { x: 50, y: 60, size: 26, color: "#1e3a5f", weight: "bold",   maxWidth: 80 },
  course: { x: 50, y: 68, size: 26, color: "#1e3a5f", weight: "bold",   maxWidth: 80 },
  theme:  { x: 50, y: 76, size: 22, color: "#1e3a5f", weight: "normal", maxWidth: 80 },
}

// ลำดับ + ป้ายกำกับของฟิลด์ (ใช้ทั้งตัววาดและ UI ตัวแก้ตำแหน่ง)
export const CERT_FIELD_KEYS = ["name", "award", "course", "theme"]
export const CERT_FIELD_LABELS = {
  name:   "ชื่อผู้รับ",
  award:  "ชื่อรางวัล",
  course: "ชื่อคอร์ส",
  theme:  "ชื่อทีม/ธีม",
}

// เติมค่าที่ขาดจาก default — กัน cert_fields เก่าใน DB ที่ยังไม่มี theme/maxWidth
export function normalizeCertFields(fields) {
  const out = {}
  for (const k of CERT_FIELD_KEYS) {
    out[k] = { ...DEFAULT_CERT_FIELDS[k], ...(fields?.[k] || {}) }
  }
  return out
}

// โหลดรูปเป็น Image element (รอโหลดเสร็จ)
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("โหลดรูปพื้นหลังไม่สำเร็จ"))
    img.src = url
  })
}

// รอให้ฟอนต์เว็บ (Sarabun) พร้อมก่อนวาด — ไม่งั้นใบแรกอาจได้ฟอนต์ fallback
async function waitFonts() {
  try { await document.fonts?.ready } catch { /* เบราว์เซอร์เก่า — ข้ามไป */ }
}

// ตัดข้อความยาวเป็นหลายบรรทัดให้ไม่เกิน maxPx (ตัดที่ช่องว่าง ถ้าไม่มีก็ตัดกลางคำ)
function wrapLines(ctx, text, maxPx) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ""
  for (const w of words) {
    const test = cur ? cur + " " + w : w
    if (ctx.measureText(test).width <= maxPx || !cur) { cur = test; continue }
    lines.push(cur); cur = w
  }
  if (cur) lines.push(cur)
  // คำเดี่ยวที่ยาวเกิน (ไทยไม่มีช่องว่าง) → ตัดทีละตัวอักษร
  const out = []
  for (const line of lines) {
    if (ctx.measureText(line).width <= maxPx) { out.push(line); continue }
    let buf = ""
    for (const ch of line) {
      if (ctx.measureText(buf + ch).width > maxPx && buf) { out.push(buf); buf = ch }
      else buf += ch
    }
    if (buf) out.push(buf)
  }
  return out.length ? out : [""]
}

// วาดข้อความ 1 ใบลงบน canvas (คืน canvas)
// recipient = { full_name, course_title, award, theme_name }
function renderCanvas(bgImg, recipient, fields, fontFamily) {
  const canvas = document.createElement("canvas")
  // ใช้ขนาดรูปจริงเป็น canvas (คมชัดเท่าที่เทมเพลตให้ได้)
  canvas.width = bgImg.naturalWidth
  canvas.height = bgImg.naturalHeight
  const ctx = canvas.getContext("2d")
  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)

  // สเกลฟอนต์ตามความกว้างรูป (size อิง 1000px ฐาน)
  const scale = canvas.width / 1000

  const draw = (text, cfg) => {
    if (!text || !cfg) return
    const px = (cfg.x / 100) * canvas.width
    const py = (cfg.y / 100) * canvas.height
    const maxPx = ((cfg.maxWidth ?? 80) / 100) * canvas.width
    const weight = cfg.weight === "bold" ? "bold " : ""
    const baseSize = (cfg.size || 28) * scale

    // 1) ย่อฟอนต์ลงก่อน (สูงสุด 40%) ให้พอดีบรรทัดเดียว
    let size = baseSize
    const minSize = baseSize * 0.6
    ctx.font = `${weight}${size}px ${fontFamily}`
    while (ctx.measureText(text).width > maxPx && size > minSize) {
      size = Math.max(minSize, size - baseSize * 0.05)
      ctx.font = `${weight}${size}px ${fontFamily}`
    }
    // 2) ยังไม่พอ → ตัดหลายบรรทัด (จัดกึ่งกลางแนวตั้งรอบ y)
    const lines = wrapLines(ctx, text, maxPx)
    const lineH = size * 1.25
    const startY = py - ((lines.length - 1) * lineH) / 2

    ctx.fillStyle = cfg.color || "#1e3a5f"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    lines.forEach((line, i) => ctx.fillText(line, px, startY + i * lineH))
  }

  draw(recipient.full_name, fields.name)
  draw(recipient.award, fields.award)
  draw(recipient.course_title, fields.course)
  draw(recipient.theme_name, fields.theme)

  return canvas
}

// สร้าง PDF จากผู้รับหลายคน (1 คน = 1 หน้า) → คืน jsPDF doc
// recipients = [{ full_name, course_title, award, theme_name }]
// onProgress(done, total) — เรียกทุกใบ เอาไว้โชว์ความคืบหน้า
export async function generateCertificatePDF({
  templateUrl, recipients, fields, fontFamily = "'Sarabun', sans-serif", onProgress,
}) {
  if (!templateUrl) throw new Error("ยังไม่ได้ตั้งรูปพื้นหลังเกียรติบัตร")
  if (!recipients?.length) throw new Error("ไม่มีรายชื่อผู้รับ")

  const f = normalizeCertFields(fields)
  await waitFonts()
  const bgImg = await loadImage(templateUrl)
  const jsPDF = await loadJsPDF()

  // ขนาดหน้า = สัดส่วนรูปจริง (หน่วย px) → รูปไม่ถูกยืดให้พอดี A4
  const w = bgImg.naturalWidth
  const h = bgImg.naturalHeight
  const doc = new jsPDF({
    orientation: w >= h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    compress: true,
  })

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) doc.addPage([w, h], w >= h ? "landscape" : "portrait")
    const canvas = renderCanvas(bgImg, recipients[i], f, fontFamily)
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h)
    onProgress?.(i + 1, recipients.length)
    // คืน main thread ให้ UI อัปเดตได้ระหว่างทำใบเยอะๆ
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0))
  }
  return doc
}

// สร้าง preview ใบเดียว → คืน dataURL (สำหรับโชว์บนหน้าจอ)
export async function previewCertificate({
  templateUrl, recipient, fields, fontFamily = "'Sarabun', sans-serif",
}) {
  if (!templateUrl) throw new Error("ยังไม่ได้ตั้งรูปพื้นหลัง")
  await waitFonts()
  const bgImg = await loadImage(templateUrl)
  const canvas = renderCanvas(bgImg, recipient, normalizeCertFields(fields), fontFamily)
  return canvas.toDataURL("image/jpeg", 0.9)
}

// ชื่อไฟล์ปลอดภัยสำหรับดาวน์โหลด (ตัดอักขระที่ Windows ห้าม)
export function safeFileName(text, max = 40) {
  return String(text || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, max) || "certificate"
}
