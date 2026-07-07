// ═══════════════════════════════════════════════════════════════════
// ตัวสร้างเกียรติบัตร PDF — วาดข้อความ 3 จุด (ชื่อ/รางวัล/คอร์ส) ทับรูปพื้นหลัง
// ใช้ jsPDF จาก CDN (โหลดตอนใช้งาน — ไม่ต้อง npm install, ไม่พัง build)
// แนวนอน (landscape) A4
//
// cert_config (เก็บใน event_settings):
//   {
//     template_url: "url รูปพื้นหลัง",
//     awards: ["รางวัลชนะเลิศ", "รองชนะเลิศอันดับ 1", ...],  // dropdown
//     fields: {
//       name:   { x, y, size, color, weight },   // ชื่อคน
//       award:  { x, y, size, color, weight },   // ชื่อรางวัล
//       course: { x, y, size, color, weight },   // ชื่อคอร์ส
//     }
//   }
//   x,y = เปอร์เซ็นต์ (0-100) ของความกว้าง/สูงใบ → ยืดหยุ่นกับทุกขนาดรูป
// ═══════════════════════════════════════════════════════════════════

// โหลด jsPDF จาก CDN ครั้งเดียว (cache ไว้) — คืน constructor jsPDF
let _jsPDFPromise = null
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF)
  if (_jsPDFPromise) return _jsPDFPromise
  _jsPDFPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
    s.onload = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF)
      else reject(new Error("โหลด jsPDF ไม่สำเร็จ"))
    }
    s.onerror = () => reject(new Error("โหลด jsPDF จาก CDN ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต"))
    document.head.appendChild(s)
  })
  return _jsPDFPromise
}

// ค่า default ตำแหน่ง (อิงจากเทมเพลตตัวอย่าง CAMT) — admin ปรับได้ภายหลัง
export const DEFAULT_CERT_FIELDS = {
  name:   { x: 50, y: 47, size: 40, color: "#1e3a5f", weight: "normal" },
  award:  { x: 50, y: 60, size: 26, color: "#1e3a5f", weight: "bold" },
  course: { x: 50, y: 60, size: 26, color: "#1e3a5f", weight: "bold" },
}

export const DEFAULT_AWARDS = [
  "รางวัลชนะเลิศ",
  "รางวัลรองชนะเลิศอันดับ 1",
  "รางวัลรองชนะเลิศอันดับ 2",
  "รางวัลชมเชย",
  "เข้าร่วมกิจกรรม",
]

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

// วาดข้อความ 1 ใบลงบน canvas (คืน canvas)
// recipient = { full_name, course_title, award }
async function renderCanvas(bgImg, recipient, fields, fontFamily) {
  const canvas = document.createElement("canvas")
  // ใช้ขนาดรูปจริงเป็น canvas (คมชัด)
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
    ctx.fillStyle = cfg.color || "#1e3a5f"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const weight = cfg.weight === "bold" ? "bold " : ""
    ctx.font = `${weight}${(cfg.size || 28) * scale}px ${fontFamily}`
    ctx.fillText(text, px, py)
  }

  draw(recipient.full_name, fields.name)
  draw(recipient.award, fields.award)
  draw(recipient.course_title, fields.course)

  return canvas
}

// สร้าง PDF จากผู้รับหลายคน (1 คน = 1 หน้า) → คืน jsPDF doc
// recipients = [{ full_name, course_title, award }]
export async function generateCertificatePDF({ templateUrl, recipients, fields, fontFamily = "'Sarabun', sans-serif" }) {
  if (!templateUrl) throw new Error("ยังไม่ได้ตั้งรูปพื้นหลังเกียรติบัตร")
  if (!recipients?.length) throw new Error("ไม่มีรายชื่อผู้รับ")

  const bgImg = await loadImage(templateUrl)
  const jsPDF = await loadJsPDF()
  const isLandscape = bgImg.naturalWidth >= bgImg.naturalHeight
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) doc.addPage()
    const canvas = await renderCanvas(bgImg, recipients[i], fields, fontFamily)
    const imgData = canvas.toDataURL("image/jpeg", 0.92)
    doc.addImage(imgData, "JPEG", 0, 0, pageW, pageH)
  }
  return doc
}

// สร้าง + โหลด PDF ทันที (1 ไฟล์รวมทุกคน)
export async function downloadCertificatePDF(opts, filename = "certificates.pdf") {
  const doc = await generateCertificatePDF(opts)
  doc.save(filename)
}

// สร้าง preview ใบเดียว → คืน dataURL (สำหรับโชว์บนหน้าจอ)
export async function previewCertificate({ templateUrl, recipient, fields, fontFamily = "'Sarabun', sans-serif" }) {
  if (!templateUrl) throw new Error("ยังไม่ได้ตั้งรูปพื้นหลัง")
  const bgImg = await loadImage(templateUrl)
  const canvas = await renderCanvas(bgImg, recipient, fields, fontFamily)
  return canvas.toDataURL("image/jpeg", 0.9)
}