import { createContext, useContext, useState, useCallback } from "react"

const DialogContext = createContext(null)

// ใช้สีตามธีม: เขียว=สำเร็จ/ถูก, แดง=ผิด/ลบ, ฟ้า=ข้อมูล/เน้น, ส้ม=ปุ่มหลัก
const TONE = {
  success: { ring: "border-green-200", bar: "bg-green-500", icon: "✅", btn: "bg-green-600 hover:bg-green-700" },
  error:   { ring: "border-red-200", bar: "bg-red-500", icon: "⚠️", btn: "bg-red-600 hover:bg-red-700" },
  info:    { ring: "border-blue-200", bar: "bg-blue-500", icon: "ℹ️", btn: "bg-blue-600 hover:bg-blue-700" },
  warn:    { ring: "border-orange-200", bar: "bg-[#F15A24]", icon: "🔔", btn: "bg-[#F15A24] hover:bg-orange-600" },
  danger:  { ring: "border-red-200", bar: "bg-red-500", icon: "🗑️", btn: "bg-red-600 hover:bg-red-700" },
}

export function DialogProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  // toast — แจ้งเตือนมุมจอ หายเอง
  const toast = useCallback((message, tone = "success") => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

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

  return (
    <DialogContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => {
          const tone = TONE[t.tone] || TONE.success
          return (
            <div key={t.id}
              className={`pointer-events-auto bg-white rounded-xl shadow-lg border ${tone.ring} overflow-hidden max-w-md w-full sm:w-auto animate-[slideDown_0.2s_ease-out]`}>
              <div className="flex items-center gap-3 pl-4 pr-3 py-3">
                <span className="text-lg shrink-0">{tone.icon}</span>
                <p className="text-sm text-gray-700 font-medium flex-1">{t.message}</p>
                <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="text-gray-300 hover:text-gray-500 text-lg leading-none shrink-0">×</button>
              </div>
              <div className={`h-1 ${tone.bar}`} />
            </div>
          )
        })}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4"
          onClick={() => closeConfirm(false)}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-sm shadow-2xl overflow-hidden rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className={`h-1.5 ${(TONE[confirmState.tone] || TONE.warn).bar}`} />
            <div className="p-5 sm:p-6 text-center">
              <div className="text-4xl mb-3">{(TONE[confirmState.tone] || TONE.warn).icon}</div>
              <h3 className="font-bold text-gray-800 text-lg mb-2">{confirmState.title}</h3>
              {confirmState.message && <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{confirmState.message}</p>}
            </div>
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-2 gap-3">
              <button onClick={() => closeConfirm(false)}
                className="py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition text-sm">
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