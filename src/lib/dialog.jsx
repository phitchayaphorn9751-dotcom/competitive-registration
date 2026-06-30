import { createContext, useContext, useState, useCallback } from "react"

const DialogContext = createContext(null)

// ใช้สีตามธีม: เขียว=สำเร็จ/ถูก, แดง=ผิด/ลบ, ฟ้า=ข้อมูล/เน้น, ส้ม=ปุ่มหลัก
const TONE = {
  success: { ring: "border-emerald-200", bar: "bg-emerald-500", icon: "✅", btn: "bg-emerald-600 hover:bg-emerald-700" },
  error:   { ring: "border-rose-200", bar: "bg-rose-500", icon: "⚠️", btn: "bg-rose-600 hover:bg-rose-700" },
  info:    { ring: "border-sky-200", bar: "bg-sky-500", icon: "ℹ️", btn: "bg-sky-600 hover:bg-sky-700" },
  warn:    { ring: "border-orange-200", bar: "bg-[#F15A24]", icon: "🔔", btn: "bg-[#F15A24] hover:bg-orange-600" },
  danger:  { ring: "border-rose-200", bar: "bg-rose-500", icon: "🗑️", btn: "bg-rose-600 hover:bg-rose-700" },
}

export function DialogProvider({ children }) {
  const [popups, setPopups] = useState([])   // toast → pop up กลางจอ
  const [confirmState, setConfirmState] = useState(null)

  // toast (เดิม) → แสดงเป็น pop up กลางจอ
  // success หายเองใน 2.5 วิ / error+warn+danger ไม่หายเอง ต้องกดปิด (ให้เห็นชัด)
  const toast = useCallback((message, tone = "success") => {
    const id = Date.now() + Math.random()
    setPopups((prev) => [...prev, { id, message, tone }])
    // เฉพาะข้อความสำเร็จ/ข้อมูล → หายเอง ; error/เตือน/ลบ → ค้างไว้ให้กดรับรู้
    if (tone === "success" || tone === "info") {
      setTimeout(() => setPopups((prev) => prev.filter((t) => t.id !== id)), 2500)
    }
  }, [])

  function closePopup(id) {
    setPopups((prev) => prev.filter((t) => t.id !== id))
  }

  // confirm — modal ยืนยัน คืน Promise<boolean>
  const confirm = useCallback((opts) => {
    const o = typeof opts === "string" ? { message: opts } : opts
    return new Promise((resolve) => {
      setConfirmState({
        title: o.title || "ยืนยันการทำรายการ",
        message: o.message || "",
        confirmText: o.confirmText || "ยืนยัน",
        cancelText: o.cancelText || "ยกเลิก",
        tone: o.tone || "warn",
        resolve,
      })
    })
  }, [])

  function closeConfirm(result) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  // แสดง pop up ตัวบนสุด (ทีละอัน — ถ้ามีหลายอันซ้อน แสดงล่าสุด)
  const activePopup = popups[popups.length - 1]

  return (
    <DialogContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast → Pop up กลางจอ */}
      {activePopup && (() => {
        const tone = TONE[activePopup.tone] || TONE.success
        return (
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fade-in_0.15s_ease-out]"
            onClick={() => closePopup(activePopup.id)}>
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-[slideDown_0.2s_ease-out]"
              onClick={(e) => e.stopPropagation()}>
              <div className={`h-1.5 ${tone.bar}`} />
              <div className="p-5 sm:p-6 text-center">
                <div className="text-4xl mb-3">{tone.icon}</div>
                <p className="text-sm sm:text-base text-slate-700 font-medium leading-relaxed whitespace-pre-line">{activePopup.message}</p>
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                <button onClick={() => closePopup(activePopup.id)}
                  className={`w-full py-3 text-white rounded-xl font-bold shadow-sm transition text-sm ${tone.btn}`}>
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4"
          onClick={() => closeConfirm(false)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-sm shadow-2xl overflow-hidden rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className={`h-1.5 ${(TONE[confirmState.tone] || TONE.warn).bar}`} />
            <div className="p-5 sm:p-6 text-center">
              <div className="text-4xl mb-3">{(TONE[confirmState.tone] || TONE.warn).icon}</div>
              <h3 className="font-bold text-slate-800 text-lg mb-2">{confirmState.title}</h3>
              {confirmState.message && <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">{confirmState.message}</p>}
            </div>
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-2 gap-3">
              <button onClick={() => closeConfirm(false)}
                className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">
                {confirmState.cancelText}
              </button>
              <button onClick={() => closeConfirm(true)}
                className={`py-3 text-white rounded-xl font-bold shadow-sm transition text-sm ${(TONE[confirmState.tone] || TONE.warn).btn}`}>
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

// hook ใช้ในหน้าต่างๆ — { toast, confirm }
export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    // fallback กันพังถ้าลืมหุ้ม Provider
    return {
      toast: (m) => console.log("toast:", m),
      confirm: (o) => Promise.resolve(window.confirm(typeof o === "string" ? o : o.message)),
    }
  }
  return ctx
}