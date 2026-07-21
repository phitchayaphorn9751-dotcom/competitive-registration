import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { fetchCoursesAdmin, checkInDaily, attendanceDaily, subscribeCheckins } from "../lib/supabase.js"

const Ico = {
  scan:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>),
  back:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>),
  book:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  camera:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>),
  inbox:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>),
  qr:      (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/></svg>),
  check:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>),
  x:       (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>),
  warn:    (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>),
  layers:  (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>),
  clock:   (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>),
}

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
  const [category, setCategory] = useState("")
  const [courseId, setCourseId] = useState("")
  const [sessionId, setSessionId] = useState("")   // รอบที่แอดมินเปิดเช็คอิน (เฉพาะวิชาที่มีหลายรอบ)
  const [dates, setDates] = useState([])
  const [dateKey, setDateKey] = useState("")
  const [scanInput, setScanInput] = useState("")
  const [last, setLast] = useState(null)
  const [popupOpen, setPopupOpen] = useState(false)   // overlay แจ้งผลการสแกน
  const popupTimer = useRef(null)
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [scanning, setScanning] = useState(false)
  const inputRef = useRef(null)
  const scannerRef = useRef(null)
  const busyRef = useRef(false)

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

  const categories = [...new Set(courses.map((c) => c.course_types?.label).filter(Boolean))].sort()
  const filteredCourses = category ? courses.filter((c) => c.course_types?.label === category) : courses

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
    const ch = subscribeCheckins(() => loadLogs())
    return () => { ch.unsubscribe() }
  }, [courseId, dateKey, loadLogs])

  // แสดงผล + เด้ง popup · สำเร็จ = หายเอง 1.5 วิ, เคสอื่นค้างไว้จนแตะ/สแกนใหม่
  function showResult(obj) {
    if (popupTimer.current) { clearTimeout(popupTimer.current); popupTimer.current = null }
    setLast(obj)
    setPopupOpen(true)
    if (obj.type === "success") popupTimer.current = setTimeout(() => setPopupOpen(false), 1500)
  }

  async function process(token, method = "qr") {
    if (busyRef.current) return
    if (!courseId || !dateKey) { setCameraError("เลือกวิชาและวันก่อน"); return }
    // วิชามีหลายรอบ → ต้องเลือกรอบที่เปิดเช็คอินก่อน (บล็อกผิดรอบ)
    if (courseNeedsSession && !sessionId) {
      playSound("error")
      showResult({ type: "error", msg: "เลือกรอบที่เปิดเช็คอินก่อน", sub: "วิชานี้มีหลายรอบ" })
      return
    }
    busyRef.current = true
    try {
      const res = await checkInDaily(token.trim(), courseId, dateKey, method, sessionId || null)
      if (!res?.ok) {
        playSound("error")
        if (res?.reason === "WRONG_SESSION") {
          // เด็กอยู่คนละรอบกับที่แอดมินเปิด → บล็อก + บอกว่าเด็กอยู่รอบไหน
          const stuName = sessionLabelOf(res?.student_session)
          showResult({
            type: "error",
            msg: "ผิดรอบ! เช็คอินไม่ได้",
            sub: `${res.name || ""}${stuName ? ` — อยู่ ${stuName}` : ""}`,
            session: sessionLabelOf(res?.picked_session),
          })
        } else {
          const msg = res?.reason === "NOT_FOUND" ? "ไม่พบรหัสนี้"
            : res?.reason === "NOT_CONFIRMED" ? "ยังไม่ยืนยันการสมัคร"
            : res?.reason === "WRONG_COURSE" ? "ไม่ใช่ผู้สมัครวิชานี้"
            : "เช็คอินไม่สำเร็จ"
          showResult({ type: "error", msg, sub: res?.name || "" })
        }
      } else if (res.duplicate) {
        playSound("warning")
        showResult({ type: "warning", msg: "เช็คอินไปแล้ว!", sub: `${res.name} · ${res.time || ""}`, session: res.session_label || sessionOf(res) })
      } else {
        playSound("success")
        showResult({ type: "success", msg: "เช็คอินสำเร็จ!", sub: `${res.name}${res.school ? " · " + res.school : ""}`, session: res.session_label || sessionOf(res) })
        loadLogs()
      }
    } catch (e) {
      playSound("error")
      showResult({ type: "error", msg: "เกิดข้อผิดพลาด", sub: e.message })
    } finally {
      setTimeout(() => { busyRef.current = false }, 800)
    }
  }

  function sessionOf(res) {
    const c = courses.find((x) => x.id === courseId)
    if (!c || !Array.isArray(c.sessions) || c.sessions.length === 0) return ""
    const sid = res?.session_id
    if (!sid) return ""
    const s = c.sessions.find((x) => x.id === sid)
    return s ? (s.label || "รอบ") : ""
  }

  // หา label ของรอบจาก session id (ใช้แสดงตอน WRONG_SESSION — ทั้งรอบเด็กและรอบที่เปิด)
  function sessionLabelOf(sid) {
    if (!sid) return ""
    const c = courses.find((x) => x.id === courseId)
    if (!c || !Array.isArray(c.sessions)) return ""
    const s = c.sessions.find((x) => x.id === sid)
    return s ? (s.label || "รอบ") : ""
  }

  function onManualSubmit(e) {
    e.preventDefault()
    const v = scanInput.trim()
    if (!v) return
    setScanInput(""); inputRef.current?.focus()
    process(v, "barcode")
  }

  async function openCamera() {
    if (!courseId || !dateKey) { setCameraError("เลือกวิชาและวันก่อนเริ่มสแกน"); setLast({ type: "error", msg: "เลือกวิชาและวันก่อน", sub: "" }); return }
    // วิชามีหลายรอบ ต้องเลือกรอบก่อนเปิดกล้อง
    const c = courses.find((x) => x.id === courseId)
    const needsSession = c && Array.isArray(c.sessions) && c.sessions.length > 0
    if (needsSession && !sessionId) { setLast({ type: "error", msg: "เลือกรอบที่เปิดเช็คอินก่อน", sub: "วิชานี้มีหลายรอบ" }); return }
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
  const courseHasSessions = selCourse && Array.isArray(selCourse.sessions) && selCourse.sessions.length > 0
  // วิชานี้ต้องเลือกรอบก่อนสแกนไหม (มีหลายรอบ = ต้องเลือก)
  const courseNeedsSession = courseHasSessions
  const courseSessions = courseHasSessions ? selCourse.sessions : []
  // พร้อมสแกน = เลือกวิชา+วันแล้ว และถ้าวิชามีรอบต้องเลือกรอบด้วย
  const canScan = !!courseId && !!dateKey && (!courseNeedsSession || !!sessionId)

  const SC = {
    success: { bg: "bg-emerald-50", border: "border-emerald-400", Icon: Ico.check, iconBg: "bg-emerald-100", iconColor: "text-emerald-600", text: "text-emerald-700" },
    error:   { bg: "bg-rose-50", border: "border-rose-400", Icon: Ico.x, iconBg: "bg-rose-100", iconColor: "text-rose-600", text: "text-rose-700" },
    warning: { bg: "bg-amber-50", border: "border-amber-400", Icon: Ico.warn, iconBg: "bg-amber-100", iconColor: "text-amber-600", text: "text-amber-700" },
    idle:    { bg: "bg-slate-50", border: "border-slate-300", Icon: Ico.camera, iconBg: "bg-slate-100", iconColor: "text-slate-500", text: "text-slate-600" },
  }
  const sc = last ? SC[last.type] : SC.idle

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Sarabun', sans-serif" }}>
      <style>{`
        @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes logIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scanLine { 0%{top:0;opacity:1} 50%{top:calc(100% - 2px);opacity:.7} 100%{top:0;opacity:1} }
        @keyframes popIn { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Popup แจ้งผลการสแกน — สำเร็จหายเอง, เคสผิดค้างไว้ · แตะเพื่อปิด */}
      {popupOpen && last && (
        <div onClick={() => setPopupOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
          <div style={{ animation: "popIn .15s ease-out" }}
            className={`w-full max-w-sm rounded-3xl border-4 ${sc.bg} ${sc.border} shadow-2xl p-8 text-center`}>
            <div className={`w-20 h-20 ${sc.iconBg} ${sc.iconColor} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner`}>
              <sc.Icon className="w-10 h-10" />
            </div>
            <div className={`text-2xl font-black ${sc.text} leading-tight mb-1`}>{last.msg}</div>
            {last.sub && <div className="text-base text-slate-600 font-semibold mb-1">{last.sub}</div>}
            {last.session && (
              <div className="inline-flex items-center gap-1.5 bg-[#F15A24] text-white text-sm font-bold px-3 py-1 rounded-full mt-1">
                <Ico.clock className="w-3.5 h-3.5" /> {last.session}
              </div>
            )}
            {last.type !== "success" && <div className="mt-5 text-xs text-slate-400 font-semibold">แตะเพื่อปิด · สแกนคนถัดไปได้เลย</div>}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#F15A24] to-amber-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Ico.scan className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#F15A24] to-amber-500 bg-clip-text text-transparent leading-tight">จุดเช็คอิน</h1>
              <p className="text-slate-400 text-xs mt-0.5">Check-In Station</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" style={{ animation: "pulse2 1.5s ease-in-out infinite" }} />Live
            </span>
          </div>
        </div>
        {selCourse && dateKey && (
          <p className="text-sm text-slate-500 -mt-3 mb-4 pl-1">
            {selCourse.title}
            {dayIdx >= 0 && <span className="ml-2 text-[#F15A24] font-bold">· Day {dayIdx + 1} — {new Date(dateKey).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}</span>}
          </p>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>เลือกหมวดหมู่
            </label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setCourseId(""); setSessionId(""); setLast(null) }}
              className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100 outline-none transition">
              <option value="">— ทุกหมวดหมู่ —</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>เลือกวิชา
              {category && <span className="text-[10px] font-normal text-slate-400 normal-case">({filteredCourses.length} วิชาในหมวดนี้)</span>}
            </label>
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setSessionId(""); setLast(null) }}
              className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-[#F15A24] focus:ring-2 focus:ring-orange-100 outline-none transition">
              <option value="">— กรุณาเลือกวิชา —</option>
              {filteredCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          {courseHasSessions && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 bg-[#F15A24] text-white rounded-full flex items-center justify-center text-[10px] font-black">!</span>
                เลือกรอบที่เปิดเช็คอิน
                <span className="text-[10px] font-normal text-rose-500 normal-case">(ต้องเลือกก่อนสแกน — เด็กผิดรอบจะเช็คอินไม่ได้)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {courseSessions.map((s) => {
                  const active = sessionId === s.id
                  return (
                    <button key={s.id} type="button"
                      onClick={() => { setSessionId(s.id); setLast(null) }}
                      className={`flex flex-col items-start px-3.5 py-2 rounded-xl border-2 transition text-left ${active ? "bg-[#F15A24] text-white border-[#F15A24] shadow-md shadow-orange-500/20" : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"}`}>
                      <span className="text-sm font-bold">{s.label || "รอบ"}</span>
                      {s.time && <span className={`text-[10px] ${active ? "text-orange-100" : "text-slate-400"}`}>🕐 {s.time}</span>}
                    </button>
                  )
                })}
              </div>
              {!sessionId && (
                <p className="text-[11px] text-rose-500 font-bold mt-1.5 flex items-center gap-1">
                  <Ico.warn className="w-3 h-3" /> ยังไม่เลือกรอบ — สแกนไม่ได้จนกว่าจะเลือก
                </p>
              )}
            </div>
          )}

          {courseId && dates.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 bg-slate-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>เลือกวัน
                <span className="text-[10px] font-normal text-slate-400 normal-case">(ค่าเริ่มต้น = วันนี้)</span>
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map((d, idx) => (
                  <button key={d} onClick={() => { setDateKey(d); setLast(null) }}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl font-bold whitespace-nowrap border-2 transition shrink-0 text-xs ${dateKey === d ? "bg-[#F15A24] text-white border-[#F15A24] shadow-md shadow-orange-500/20" : "bg-white text-slate-500 border-slate-200 hover:border-orange-300"}`}>
                    <span className="text-[10px] font-normal opacity-70">Day</span>
                    <span className="text-sm font-black">{idx + 1}</span>
                    <span className="text-[10px] font-normal">{new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`relative rounded-2xl border-4 p-5 sm:p-8 text-center transition shadow-lg ${sc.bg} ${sc.border}`}>
          {courseId && dateKey && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/80 backdrop-blur rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-lg font-black text-slate-800">{total}</span><span className="text-xs text-slate-500 font-semibold">คนวันนี้</span>
            </div>
          )}
          <div className={`w-16 h-16 sm:w-20 sm:h-20 ${sc.iconBg} ${sc.iconColor} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner`}><sc.Icon className="w-8 h-8 sm:w-10 sm:h-10" /></div>
          <div className={`mb-1 text-lg sm:text-2xl font-black ${sc.text} leading-tight`}>{last ? last.msg : "พร้อมสแกน"}</div>
          {last?.sub && <div className="text-sm text-slate-600 font-semibold mb-1">{last.sub}</div>}
          {last?.session && (
            <div className="inline-flex items-center gap-1.5 bg-[#F15A24] text-white text-sm font-bold px-3 py-1 rounded-full mb-3">
              <Ico.clock className="w-3.5 h-3.5" /> {last.session}
            </div>
          )}
          {!last && <p className="text-sm text-slate-400 mb-4">สแกน QR หรือยิงบาร์โค้ดเพื่อเช็คอิน</p>}

          <form onSubmit={onManualSubmit} className="flex justify-center mt-3">
            <input ref={inputRef} type="text" value={scanInput} onChange={(e) => setScanInput(e.target.value)} autoFocus
              disabled={!canScan}
              placeholder={canScan ? "พิมพ์รหัส 6 หลัก หรือยิงบาร์โค้ด" : (courseNeedsSession && !sessionId ? "เลือกรอบที่เปิดเช็คอินก่อน" : "เลือกวิชาและวันก่อน")}
              className={`w-full max-w-sm px-4 py-3 text-center text-base font-bold border-2 rounded-xl outline-none transition placeholder:text-sm placeholder:font-normal ${!canScan ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" : "bg-white border-slate-300 focus:border-[#F15A24] focus:ring-4 focus:ring-orange-100"}`} />
          </form>

          <div className="mt-4 flex justify-center">
            <button onClick={openCamera} disabled={!canScan}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition shadow-md ${canScan ? "bg-[#F15A24] hover:bg-orange-600 text-white active:scale-95 shadow-orange-500/20" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
              <Ico.camera className="w-4 h-4" /> สแกนด้วยกล้องมือถือ
            </button>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 mb-3">
            ประวัติการเช็คอินวันนี้
            <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" style={{ animation: "pulse2 1.5s ease-in-out infinite" }} />Live
            </span>
            {total > 15 && <span className="ml-auto text-xs text-slate-400">แสดง 15 / {total} ล่าสุด</span>}
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3"><Ico.inbox className="w-7 h-7" /></div>
                <div className="font-semibold text-sm">{courseId && dateKey ? "ยังไม่มีการเช็คอินในวันที่เลือก" : "เลือกวิชาและวันเพื่อดูประวัติ"}</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {logs.map((log, idx) => {
                  const t = log.scanned_at ? new Date(log.scanned_at) : new Date()
                  const timeStr = t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={log.participant_id + idx} className="px-4 py-3 flex items-center justify-between hover:bg-orange-50/50 transition" style={idx === 0 ? { animation: "logIn .3s ease" } : undefined}>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{log.full_name}</div>
                        {log.school && <div className="text-xs text-slate-400 truncate">{log.school}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-bold ${log.method === "barcode" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                          {log.method === "barcode" ? <><Ico.camera className="w-3 h-3" /> บาร์โค้ด</> : <><Ico.qr className="w-3 h-3" /> QR</>}
                        </span>
                        <span className="text-sm font-bold text-slate-700">{timeStr}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm bg-black rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-black/60 absolute top-0 inset-x-0 z-10">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                {scanning ? <><span className="w-2 h-2 bg-green-400 rounded-full inline-block" style={{ animation: "pulse2 1.5s infinite" }} />กำลังสแกน...</>
                  : <><span className="w-2 h-2 bg-yellow-400 rounded-full inline-block" />กำลังเปิดกล้อง...</>}
              </div>
              <button onClick={stopCamera} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white"><Ico.x className="w-4 h-4" /></button>
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