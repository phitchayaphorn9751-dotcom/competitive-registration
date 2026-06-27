import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { fetchCoursesAdmin, checkInDaily, attendanceDaily, subscribeCheckins } from "../lib/supabase.js"

// เสียงตอบรับ
function playSound(type) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (type === "success") {
      osc.type = "sine"; osc.frequency.setValueAtTime(1200, ctx.currentTime)
      gain.gain.setValueAtTime(0.5, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.1)
    } else if (type === "error") {
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(150, ctx.currentTime)
      gain.gain.setValueAtTime(0.5, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.4)
    } else if (type === "warning") {
      osc.type = "square"; osc.frequency.setValueAtTime(300, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.2)
    }
  } catch (_) {}
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement("script")
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}

const QR_REGION_ID = "qr-reader-region"

export default function CheckInPage() {
  const navigate = useNavigate()
  let outlet = {}
  try { outlet = useOutletContext() || {} } catch (_) {}

  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState("")
  const [dates, setDates] = useState([])
  const [dateKey, setDateKey] = useState("")
  const [scanInput, setScanInput] = useState("")
  const [last, setLast] = useState(null)
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [scanning, setScanning] = useState(false)
  const inputRef = useRef(null)
  const scannerRef = useRef(null)
  const busyRef = useRef(false)

  // โหลดวิชา (ใช้ event จาก outlet ถ้ามี ไม่งั้นโหลดทั้งหมด)
  useEffect(() => {
    async function load() {
      try {
        const evId = outlet?.event?.id
        const list = await fetchCoursesAdmin(evId)
        const sorted = (list || []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""))
        setCourses(sorted)
      } catch (_) {}
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.event?.id])

  // คำนวณช่วงวันของวิชา
  useEffect(() => {
    if (!courseId) { setDates([]); setDateKey(""); return }
    const c = courses.find((x) => x.id === courseId)
    const out = []
    if (c?.start_date && c?.end_date) {
      let cur = new Date(c.start_date)
      const end = new Date(c.end_date)
      while (cur <= end) { out.push(new Date(cur).toISOString().split("T")[0]); cur.setDate(cur.getDate() + 1) }
    }
    const today = new Date().toISOString().split("T")[0]
    if (out.length === 0) out.push(today)
    setDates(out)
    setDateKey(out.includes(today) ? today : out[0])
  }, [courseId, courses])

  // โหลด log ของวิชา+วัน (refresh ทุก 5 วิ)
  const loadLogs = useCallback(async () => {
    if (!courseId || !dateKey) { setLogs([]); setTotal(0); return }
    try {
      const rows = await attendanceDaily(courseId, dateKey)
      setTotal(rows.length)
      setLogs(rows.slice(0, 15))
    } catch (_) {}
  }, [courseId, dateKey])

  useEffect(() => {
    loadLogs()
    if (!courseId || !dateKey) return
    // realtime — log เช็คอินขึ้นทันทีไม่ต้องรอ polling
    const ch = subscribeCheckins(() => loadLogs())
    return () => { ch.unsubscribe() }
  }, [courseId, dateKey, loadLogs])

  // ประมวลผลเช็คอิน
  async function process(token, method = "qr") {
    if (busyRef.current) return
    if (!courseId || !dateKey) { setCameraError("เลือกวิชาและวันก่อน"); return }
    busyRef.current = true
    try {
      const res = await checkInDaily(token.trim(), courseId, dateKey, method)
      if (!res?.ok) {
        playSound("error")
        const msg = res?.reason === "NOT_FOUND" ? "ไม่พบรหัสนี้"
          : res?.reason === "NOT_CONFIRMED" ? "ยังไม่ยืนยันการสมัคร"
          : res?.reason === "WRONG_COURSE" ? "ไม่ใช่ผู้สมัครวิชานี้"
          : "เช็คอินไม่สำเร็จ"
        setLast({ type: "error", msg, sub: res?.name || "" })
      } else if (res.duplicate) {
        playSound("warning")
        setLast({ type: "warning", msg: "เช็คอินไปแล้ว!", sub: `${res.name} · ${res.time || ""}` })
      } else {
        playSound("success")
        setLast({ type: "success", msg: "เช็คอินสำเร็จ!", sub: `${res.name}${res.school ? " · " + res.school : ""}` })
        loadLogs()
      }
    } catch (e) {
      playSound("error")
      setLast({ type: "error", msg: "เกิดข้อผิดพลาด", sub: e.message })
    } finally {
      setTimeout(() => { busyRef.current = false }, 800)
    }
  }

  function onManualSubmit(e) {
    e.preventDefault()
    const v = scanInput.trim()
    if (!v) return
    setScanInput(""); inputRef.current?.focus()
    process(v, "barcode")
  }

  // กล้องสแกน QR (html5-qrcode)
  async function openCamera() {
    if (!courseId || !dateKey) { setCameraError("เลือกวิชาและวันก่อนเริ่มสแกน"); setLast({ type: "error", msg: "เลือกวิชาและวันก่อน", sub: "" }); return }
    setCameraError(""); setCameraOpen(true)
  }

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear() } catch (_) {}
      scannerRef.current = null
    }
    setScanning(false); setCameraOpen(false)
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false
    async function start() {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js")
        if (cancelled) return
        const Html5Qrcode = window.Html5Qrcode
        const formats = window.Html5QrcodeSupportedFormats
        // รองรับทั้ง QR และบาร์โค้ด 1D (Code128/Code39/EAN)
        const supported = formats ? [
          formats.QR_CODE, formats.CODE_128, formats.CODE_39,
          formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.ITF,
        ] : undefined
        const scanner = new Html5Qrcode(QR_REGION_ID, supported ? { formatsToSupport: supported } : undefined)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // กรอบแนวนอน (กว้างกว่าสูง) — เหมาะกับบาร์โค้ด 1D
            qrbox: (vw, vh) => {
              const w = Math.floor(Math.min(vw, 320))
              return { width: w, height: Math.floor(w * 0.5) }
            },
            aspectRatio: 1.33,
          },
          (decoded) => { stopCamera(); process(decoded, "barcode") },
          () => {}
        )
        if (!cancelled) setScanning(true)
      } catch (err) {
        if (!cancelled) {
          setCameraError(err?.name === "NotAllowedError" ? "ไม่ได้รับอนุญาตใช้กล้อง กรุณาอนุญาตในเบราว์เซอร์" : "เปิดกล้องไม่สำเร็จ: " + (err?.message || ""))
          setScanning(false)
        }
      }
    }
    const t = setTimeout(start, 250)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  const selCourse = courses.find((c) => c.id === courseId)
  const dayIdx = dates.indexOf(dateKey)

  const SC = {
    success: { bg: "bg-green-50", border: "border-green-400", icon: "✅", iconBg: "bg-green-100", text: "text-green-700" },
    error:   { bg: "bg-red-50", border: "border-red-400", icon: "❌", iconBg: "bg-red-100", text: "text-red-700" },
    warning: { bg: "bg-amber-50", border: "border-amber-400", icon: "⚠️", iconBg: "bg-amber-100", text: "text-amber-700" },
    idle:    { bg: "bg-gray-50", border: "border-gray-300", icon: "📷", iconBg: "bg-gray-100", text: "text-gray-600" },
  }
  const sc = last ? SC[last.type] : SC.idle

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Sarabun', sans-serif" }}>
      <style>{`
        @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes logIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scanLine { 0%{top:0;opacity:1} 50%{top:calc(100% - 2px);opacity:.7} 100%{top:0;opacity:1} }
      `}</style>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1.5 h-7 bg-[#F15A24] rounded-full inline-block" />
            จุดเช็คอิน
          </h1>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" style={{ animation: "pulse2 1.5s ease-in-out infinite" }} />Live
            </span>
            <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-gray-500 hover:text-[#F15A24] font-medium">← กลับ</button>
          </div>
        </div>
        {selCourse && dateKey && (
          <p className="text-sm text-gray-500 -mt-3 mb-4 pl-4">
            {selCourse.title}
            {dayIdx >= 0 && <span className="ml-2 text-[#F15A24] font-bold">· Day {dayIdx + 1} — {new Date(dateKey).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}</span>}
          </p>
        )}

        {/* Setup */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>เลือกวิชา
            </label>
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setLast(null) }}
              className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-gray-50 focus:bg-white focus:border-[#F15A24] outline-none transition">
              <option value="">— กรุณาเลือกวิชา —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          {courseId && dates.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 bg-gray-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>เลือกวัน
                <span className="text-[10px] font-normal text-gray-400 normal-case">(ค่าเริ่มต้น = วันนี้)</span>
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map((d, idx) => (
                  <button key={d} onClick={() => { setDateKey(d); setLast(null) }}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl font-bold whitespace-nowrap border-2 transition shrink-0 text-xs ${dateKey === d ? "bg-[#F15A24] text-white border-[#F15A24] shadow-md" : "bg-white text-gray-500 border-gray-200 hover:border-orange-300"}`}>
                    <span className="text-[10px] font-normal opacity-70">Day</span>
                    <span className="text-sm font-black">{idx + 1}</span>
                    <span className="text-[10px] font-normal">{new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scanner area */}
        <div className={`relative rounded-2xl border-4 p-5 sm:p-8 text-center transition shadow-lg ${sc.bg} ${sc.border}`}>
          {courseId && dateKey && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/80 backdrop-blur rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-lg font-black text-gray-800">{total}</span><span className="text-xs text-gray-500 font-semibold">คนวันนี้</span>
            </div>
          )}
          <div className={`w-16 h-16 sm:w-20 sm:h-20 ${sc.iconBg} rounded-2xl flex items-center justify-center text-3xl sm:text-4xl mx-auto mb-4 shadow-inner`}>{sc.icon}</div>
          <div className={`mb-1 text-lg sm:text-2xl font-black ${sc.text} leading-tight`}>{last ? last.msg : "พร้อมสแกน"}</div>
          {last?.sub && <div className="text-sm text-gray-600 font-semibold mb-3">{last.sub}</div>}
          {!last && <p className="text-sm text-gray-400 mb-4">สแกน QR หรือยิงบาร์โค้ดเพื่อเช็คอิน</p>}

          {/* Manual / barcode input */}
          <form onSubmit={onManualSubmit} className="flex justify-center mt-3">
            <input ref={inputRef} type="text" value={scanInput} onChange={(e) => setScanInput(e.target.value)} autoFocus
              disabled={!courseId || !dateKey}
              placeholder={courseId && dateKey ? "พิมพ์รหัส 6 หลัก หรือยิงบาร์โค้ด" : "เลือกวิชาและวันก่อน"}
              className={`w-full max-w-sm px-4 py-3 text-center text-base font-bold border-2 rounded-xl outline-none transition placeholder:text-sm placeholder:font-normal ${!courseId || !dateKey ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed" : "bg-white border-gray-300 focus:border-[#F15A24] focus:ring-4 focus:ring-orange-100"}`} />
          </form>

          {/* Camera button */}
          <div className="mt-4 flex justify-center">
            <button onClick={openCamera} disabled={!courseId || !dateKey}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition shadow-md ${courseId && dateKey ? "bg-[#F15A24] hover:bg-orange-600 text-white active:scale-95" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
              📷 สแกนด้วยกล้องมือถือ
            </button>
          </div>
        </div>

        {/* Log */}
        <div className="mt-5">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 mb-3">
            ประวัติการเช็คอินวันนี้
            <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" style={{ animation: "pulse2 1.5s ease-in-out infinite" }} />Live
            </span>
            {total > 15 && <span className="ml-auto text-xs text-gray-400">แสดง 15 / {total} ล่าสุด</span>}
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <div className="text-4xl mb-3">📭</div>
                <div className="font-semibold text-sm">{courseId && dateKey ? "ยังไม่มีการเช็คอินในวันที่เลือก" : "เลือกวิชาและวันเพื่อดูประวัติ"}</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {logs.map((log, idx) => {
                  const t = log.scanned_at ? new Date(log.scanned_at) : new Date()
                  const timeStr = t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={log.participant_id + idx} className="px-4 py-3 flex items-center justify-between hover:bg-orange-50/50 transition" style={idx === 0 ? { animation: "logIn .3s ease" } : undefined}>
                      <div className="min-w-0">
                        <div className="font-bold text-gray-800 text-sm truncate">{log.full_name}</div>
                        {log.school && <div className="text-xs text-gray-400 truncate">{log.school}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${log.method === "barcode" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                          {log.method === "barcode" ? "📷 บาร์โค้ด" : "📱 QR"}
                        </span>
                        <span className="text-sm font-bold text-gray-700">{timeStr}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm bg-black rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-black/60 absolute top-0 inset-x-0 z-10">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                {scanning ? <><span className="w-2 h-2 bg-green-400 rounded-full inline-block" style={{ animation: "pulse2 1.5s infinite" }} />กำลังสแกน...</>
                  : <><span className="w-2 h-2 bg-yellow-400 rounded-full inline-block" />กำลังเปิดกล้อง...</>}
              </div>
              <button onClick={stopCamera} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-lg">✕</button>
            </div>
            <div id={QR_REGION_ID} className="w-full aspect-[3/4] bg-black" />
            {scanning && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56">
                  {["top-0 left-0 border-t-4 border-l-4 rounded-tl-lg","top-0 right-0 border-t-4 border-r-4 rounded-tr-lg","bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg","bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg"].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-[#F15A24] ${cls}`} />
                  ))}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-[#F15A24]/70" style={{ animation: "scanLine 1.5s ease-in-out infinite" }} />
                </div>
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
                <div className="text-4xl mb-3">📵</div>
                <p className="text-white font-bold text-sm mb-4">{cameraError}</p>
                <button onClick={stopCamera} className="px-6 py-2.5 bg-[#F15A24] text-white font-bold rounded-xl text-sm">ปิด</button>
              </div>
            )}
            {scanning && !cameraError && (
              <div className="absolute bottom-0 inset-x-0 py-3 bg-black/60 text-center">
                <p className="text-white/70 text-xs">จ่อ QR ในกรอบสีส้ม</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}