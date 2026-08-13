// ═══════════════════════════════════════════════════════════════════
// ตัวสร้างเกียรติบัตร PDF — วาดข้อความทับรูปพื้นหลัง แล้วฝังเป็นภาพลง PDF
// (ฝังเป็นภาพ ไม่ใช่ text → ไม่ต้องฝังฟอนต์ไทยใน PDF)
// ขนาดหน้า = สัดส่วนของรูปเทมเพลตจริง (ไม่ยัดลง A4 → ไม่ยืด ไม่บิด)
//
// มี 5 เทมเพลต แต่ละอันมีรูปและตำแหน่งข้อความของตัวเอง
// เก็บใน event_settings.cert_templates:
//   {
//     training:    { url, fields },   // อบรม/workshop
//     participant: { url, fields },   // แข่งขัน — ผู้เข้าร่วม
//     winner1:     { url, fields },   // แข่งขัน — ชนะที่ 1
//     winner2:     { url, fields },
//     winner3:     { url, fields },
//   }
//   fields = { name|award|course|theme: { x, y, size, color, weight, maxWidth } }
//   x, y, maxWidth = เปอร์เซ็นต์ (0-100) ของความกว้าง/สูงใบ
//   size           = พิกเซล อิงฐานรูปกว้าง 1000px แล้วสเกลตามรูปจริง
// ═══════════════════════════════════════════════════════════════════

// ฟอนต์บนใบเกียรติบัตร — LINE Seed Sans TH (self-host ใน public/fonts)
// ถ้ายังไม่ได้วางไฟล์ เบราว์เซอร์จะ fallback เป็น Sarabun เอง
export const CERT_FONT = "'LINE Seed Sans TH', 'Sarabun', sans-serif"

// jsPDF โหลดแบบ dynamic import — ไม่ถ่วง bundle หน้าอื่น และไม่พึ่ง CDN
async function loadJsPDF() {
  const mod = await import("jspdf")
  return mod.jsPDF
}

// ── เทมเพลต 6 แบบ ──────────────────────────────────────────────────
export const CERT_TEMPLATE_KEYS = ["training", "participant", "winner1", "winner2", "winner3", "advisor"]
export const CERT_TEMPLATE_LABELS = {
  training:    "อบรม",
  participant: "แข่งขัน — ผู้เข้าร่วม",
  winner1:     "แข่งขัน — ชนะที่ 1",
  winner2:     "แข่งขัน — ชนะที่ 2",
  winner3:     "แข่งขัน — ชนะที่ 3",
  advisor:     "ครูที่ปรึกษา",
}
// เทมเพลตเริ่มต้นของแถวรางวัลลำดับที่ N (แถวที่ 4 ขึ้นไปใช้ของชนะที่ 3)
const WINNER_TEMPLATE_KEYS = ["winner1", "winner2", "winner3"]
export function winnerKeyOf(rowIndex) {
  return WINNER_TEMPLATE_KEYS[Math.min(rowIndex, WINNER_TEMPLATE_KEYS.length - 1)]
}

// ค่า default ตำแหน่ง (อิงจากเทมเพลตตัวอย่าง CAMT) — admin ลากปรับได้ในหน้าออกเกียรติบัตร
// วาดแค่ 2 อย่าง: ชื่อผู้รับ + ชื่อคอร์ส — ส่วนชื่อรางวัลอยู่ในรูปเทมเพลตแต่ละแบบอยู่แล้ว
// align: center = x คือจุดกึ่งกลางข้อความ · left = x คือขอบซ้าย · right = x คือขอบขวา
// ชื่อคน = กึ่งกลาง · ชื่อคอร์ส = ชิดซ้าย เพราะแต่ละคอร์สยาวไม่เท่ากัน
// ถ้าใช้กึ่งกลาง หัวข้อความจะขยับตามความยาวชื่อ ทำให้แต่ละใบไม่ตรงกัน
export const DEFAULT_CERT_FIELDS = {
  name:   { x: 50, y: 47, size: 40, color: "#1e3a5f", weight: "normal", maxWidth: 80, align: "center" },
  course: { x: 30, y: 60, size: 26, color: "#1e3a5f", weight: "bold",   maxWidth: 65, align: "left" },
}

// ลำดับ + ป้ายกำกับของฟิลด์ (ใช้ทั้งตัววาดและ UI ตัวแก้ตำแหน่ง)
export const CERT_FIELD_KEYS = ["name", "course"]
export const CERT_FIELD_LABELS = {
  name:   "ชื่อผู้รับ",
  course: "ชื่อคอร์ส",
}

// เติมค่าที่ขาดจาก default — กัน cert_fields เก่าใน DB ที่ยังไม่มี theme/maxWidth
export function normalizeCertFields(fields) {
  const out = {}
  for (const k of CERT_FIELD_KEYS) {
    out[k] = { ...DEFAULT_CERT_FIELDS[k], ...(fields?.[k] || {}) }
  }
  return out
}

// เติมเทมเพลตให้ครบ 5 ช่อง — รองรับข้อมูลเก่าที่มีรูป/ตำแหน่งเดียว (cert_template_url + cert_fields)
export function normalizeCertTemplates(raw, legacyUrl = "", legacyFields = null) {
  const out = {}
  for (const k of CERT_TEMPLATE_KEYS) {
    const t = raw?.[k] || {}
    out[k] = {
      url: t.url || legacyUrl || "",
      fields: normalizeCertFields(t.fields || legacyFields),
    }
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

// ตัดคำนำหน้าชื่อออกก่อนพิมพ์ลงใบ — ในใบเกียรติบัตรใช้แค่ชื่อ-สกุล
// (ชุดคำนำหน้าเดียวกับหน้านำเข้าผู้สมัคร · เรียงยาว→สั้น กัน "นาง" ไปตัดหน้า "นางสาว")
const TITLE_PREFIXES = [
  "เด็กชาย", "เด็กหญิง", "นางสาว", "นาง", "นาย",
  "ด.ช.", "ด.ญ.", "ด.ช", "ด.ญ", "น.ส.", "น.ส",
  "Master", "Mrs.", "Miss", "Mr.", "Ms.", "Mrs", "Mr", "Ms",
]
export function stripTitle(fullName) {
  const s = String(fullName || "").trim()
  if (!s) return ""
  for (const pre of TITLE_PREFIXES) {
    if (s.startsWith(pre)) {
      const rest = s.slice(pre.length).trim()
      if (rest) return rest        // เหลือแต่คำนำหน้าล้วน → คืนของเดิม ไม่ตัดจนว่าง
    }
  }
  return s
}

// รอให้ฟอนต์เว็บพร้อมก่อนวาด — ไม่งั้นใบแรกอาจได้ฟอนต์ fallback
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
  canvas.width = bgImg.naturalWidth
  canvas.height = bgImg.naturalHeight
  const ctx = canvas.getContext("2d")
  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)

  const scale = canvas.width / 1000   // สเกลฟอนต์ตามความกว้างรูป (size อิง 1000px ฐาน)

  const draw = (text, cfg) => {
    if (!text || !cfg) return
    const align = cfg.align || "center"
    const px = (cfg.x / 100) * canvas.width
    const py = (cfg.y / 100) * canvas.height
    // ชิดซ้าย/ขวา — กรอบกว้างสุดคือระยะจาก x ไปถึงขอบใบด้านนั้น หรือ maxWidth แล้วแต่อันไหนน้อยกว่า
    const roomPx = align === "left" ? canvas.width - px : align === "right" ? px : canvas.width
    const maxPx = Math.min(((cfg.maxWidth ?? 80) / 100) * canvas.width, roomPx)
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
    ctx.textAlign = align
    ctx.textBaseline = "middle"
    lines.forEach((line, i) => ctx.fillText(line, px, startY + i * lineH))
  }

  draw(stripTitle(recipient.full_name), fields.name)
  draw(recipient.course_title, fields.course)

  return canvas
}

// ═══════════════════════════════════════════════════════════════════
// จัดตำแหน่งอัตโนมัติ — สแกนพิกเซลของรูปเทมเพลตเพื่อเดาว่าควรวางข้อความตรงไหน
// หลักการ: แถวไหนไม่มี "หมึก" (สีต่างจากพื้นหลัง) = ที่ว่าง · แถวที่มีหมึกติดกัน = 1 บรรทัด
// ไม่ได้อ่านว่าข้อความเขียนว่าอะไร (ไม่มี OCR) — ดูแค่ว่ามีอะไรอยู่ตรงไหน
// เป็นค่าเริ่มต้นให้ปรับต่อ ไม่ใช่คำตอบสุดท้าย
// ═══════════════════════════════════════════════════════════════════
export function autoLayoutFields(bgImg) {
  const W = 600
  const H = Math.max(1, Math.round(bgImg.naturalHeight * (W / bgImg.naturalWidth)))
  const c = document.createElement("canvas")
  c.width = W; c.height = H
  const ctx = c.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(bgImg, 0, 0, W, H)
  const px = ctx.getImageData(0, 0, W, H).data

  const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
  // สีพื้น = ค่ากลางของ 4 มุม (เทมเพลตส่วนใหญ่มุมเป็นพื้นเปล่า)
  const corners = [at(2, 2), at(W - 3, 2), at(2, H - 3), at(W - 3, H - 3)]
  const bg = [0, 1, 2].map((ch) => Math.round(corners.reduce((s, p) => s + p[ch], 0) / 4))
  const isInk = (x, y) => {
    const [r, g, b] = at(x, y)
    return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 90
  }

  // สแกนทีละแถว — นับหมึก + จำขอบซ้าย/ขวาของหมึกในแถวนั้น
  const rows = []
  for (let y = 0; y < H; y++) {
    let n = 0, min = W, max = 0
    for (let x = 0; x < W; x++) {
      if (!isInk(x, y)) continue
      n++; if (x < min) min = x; if (x > max) max = x
    }
    rows.push({ n, min, max, ink: n > W * 0.012 })   // กันจุด noise เล็กๆ
  }

  // จัดกลุ่มแถวติดกันเป็น "บรรทัดข้อความ" และ "ช่องว่าง"
  const bands = []
  let cur = null
  for (let y = 0; y < H; y++) {
    const t = rows[y].ink ? "line" : "gap"
    if (!cur || cur.type !== t) { cur = { type: t, y0: y, y1: y }; bands.push(cur) }
    else cur.y1 = y
  }
  bands.forEach((b) => {
    b.h = b.y1 - b.y0 + 1
    b.mid = (b.y0 + b.y1) / 2
    if (b.type === "line") {
      const rs = rows.slice(b.y0, b.y1 + 1).filter((r) => r.ink)
      b.min = Math.min(...rs.map((r) => r.min))
      b.max = Math.max(...rs.map((r) => r.max))
    }
  })

  const inMid = (b) => b.mid > H * 0.2 && b.mid < H * 0.9   // ตัดหัวกระดาษกับลายเซ็นท้ายใบออก
  const pctY = (v) => Math.round((v / H) * 1000) / 10
  const pctX = (v) => Math.round((v / W) * 1000) / 10
  const sizeOf = (h) => Math.max(14, Math.min(90, Math.round(h * (1000 / W) * 0.55)))

  const out = { ...DEFAULT_CERT_FIELDS }

  // ── ชื่อผู้รับ: ช่องว่างที่สูงที่สุดกลางใบ ──
  const gaps = bands.filter((b) => b.type === "gap" && inMid(b) && b.h > H * 0.03)
    .sort((a, b) => b.h - a.h)
  if (gaps.length) {
    const g = gaps[0]
    out.name = { ...out.name, x: 50, y: pctY(g.mid), size: sizeOf(g.h), align: "center", maxWidth: 80 }
  }

  // ── ชื่อคอร์ส: หาบรรทัดที่มีข้อความแล้วเหลือที่ว่างด้านขวา → วางต่อท้าย ──
  // (เช่น เทมเพลตพิมพ์ว่า "การแข่งขัน" ไว้ แล้วเว้นที่ให้เติมชื่อรายการ)
  const tail = bands
    .filter((b) => b.type === "line" && inMid(b) && b.mid > (gaps[0]?.mid ?? 0))
    .find((b) => b.max < W * 0.72 && b.min > W * 0.05)
  if (tail) {
    out.course = {
      ...out.course,
      x: pctX(tail.max + W * 0.015),          // เว้นวรรคเล็กน้อยจากตัวสุดท้าย
      y: pctY(tail.mid),
      size: sizeOf(tail.h * 1.35),            // ความสูงบรรทัด ≈ 1.35 เท่าของตัวอักษร
      align: "left",
      maxWidth: 90,
    }
  } else {
    // ไม่เจอบรรทัดให้ต่อท้าย → ใช้ช่องว่างรองลงมา แต่ยังชิดซ้ายไว้
    // (ชื่อคอร์สยาวไม่เท่ากัน ถ้ากึ่งกลางหัวข้อความจะขยับทุกใบ)
    const g2 = gaps.filter((g) => g.mid > (gaps[0]?.mid ?? 0))[0] || gaps[1]
    if (g2) out.course = { ...out.course, x: 20, y: pctY(g2.mid), size: sizeOf(g2.h), align: "left", maxWidth: 70 }
  }

  return out
}

// โหลดรูปจาก URL แล้ววิเคราะห์ตำแหน่งให้ (ใช้จากหน้าแอดมิน)
export async function autoLayoutFromUrl(templateUrl) {
  if (!templateUrl) throw new Error("ยังไม่มีรูปเทมเพลตให้วิเคราะห์")
  const img = await loadImage(templateUrl)
  return autoLayoutFields(img)
}

// สร้าง PDF จากผู้รับหลายคน (1 คน = 1 หน้า) → คืน jsPDF doc
// templates  = { key: {url, fields} } (ผ่าน normalizeCertTemplates มาแล้ว)
// recipients = [{ full_name, course_title, award, theme_name, templateKey }]
// แต่ละหน้าใช้ขนาดตามรูปของเทมเพลตตัวเอง → ผสมหลายแบบในไฟล์เดียวได้
export async function generateCertificatePDF({
  templates, recipients, fontFamily = CERT_FONT, onProgress,
}) {
  if (!recipients?.length) throw new Error("ไม่มีรายชื่อผู้รับ")

  await waitFonts()
  const jsPDF = await loadJsPDF()
  const imgCache = new Map()
  const getImg = async (url) => {
    if (!imgCache.has(url)) imgCache.set(url, await loadImage(url))
    return imgCache.get(url)
  }

  let doc = null
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]
    const t = templates?.[r.templateKey] || templates?.participant
    if (!t?.url) {
      throw new Error(`ยังไม่ได้ตั้งรูปพื้นหลังของเทมเพลต "${CERT_TEMPLATE_LABELS[r.templateKey] || r.templateKey}"`)
    }
    const img = await getImg(t.url)
    const w = img.naturalWidth
    const h = img.naturalHeight
    const orientation = w >= h ? "landscape" : "portrait"

    if (!doc) doc = new jsPDF({ orientation, unit: "px", format: [w, h], compress: true })
    else doc.addPage([w, h], orientation)

    const canvas = renderCanvas(img, r, normalizeCertFields(t.fields), fontFamily)
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h)
    onProgress?.(i + 1, recipients.length)
    // คืน main thread ให้ UI อัปเดตได้ระหว่างทำใบเยอะๆ
    if (i % 5 === 4) await new Promise((res) => setTimeout(res, 0))
  }
  return doc
}

// สร้าง preview ใบเดียว → คืน dataURL (สำหรับโชว์บนหน้าจอ)
export async function previewCertificate({
  templateUrl, recipient, fields, fontFamily = CERT_FONT,
}) {
  if (!templateUrl) throw new Error("ยังไม่ได้ตั้งรูปพื้นหลังของเทมเพลตนี้")
  await waitFonts()
  const bgImg = await loadImage(templateUrl)
  const canvas = renderCanvas(bgImg, recipient, normalizeCertFields(fields), fontFamily)
  return canvas.toDataURL("image/jpeg", 0.9)
}

// ชื่อไฟล์ปลอดภัยสำหรับดาวน์โหลด (ตัดอักขระที่ Windows ห้าม)
export function safeFileName(text, max = 40) {
  return String(text || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, max) || "certificate"
}
