import { createContext, useContext, useState, useEffect } from "react"

// ===== คำแปลทั้งระบบ =====
// โครงสร้าง: t[key] = { th, en }
const T = {
  // ---- ทั่วไป ----
  "common.home": { th: "หน้าหลัก", en: "Home" },
  "common.login": { th: "เข้าสู่ระบบ", en: "Log In" },
  "common.logout": { th: "ออกจากระบบ", en: "Log Out" },
  "common.back": { th: "กลับ", en: "Back" },
  "common.backHome": { th: "← กลับหน้าหลัก", en: "← Back to Home" },
  "common.save": { th: "บันทึก", en: "Save" },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.edit": { th: "แก้ไข", en: "Edit" },
  "common.delete": { th: "ลบ", en: "Delete" },
  "common.loading": { th: "กำลังโหลด…", en: "Loading…" },
  "common.search": { th: "ค้นหา", en: "Search" },
  "common.all": { th: "ทั้งหมด", en: "All" },
  "common.free": { th: "ฟรี", en: "Free" },
  "common.admin": { th: "แอดมิน", en: "Admin" },
  "common.contactLine": { th: "ติดต่อ Line", en: "Contact Line" },
  "common.phone": { th: "โทรศัพท์", en: "Phone" },

  // ---- HomePage ----
  "home.brandSmall": { th: "College of Arts, Media and Technology", en: "College of Arts, Media and Technology" },
  "home.openNow": { th: "เปิดรับสมัครแล้ว", en: "Now Open" },
  "home.heroSub": { th: "เปิดโลกเทคโนโลยี สร้างสรรค์นวัตกรรมสู่อนาคต", en: "Explore technology, create innovation for the future" },
  "home.foundCourses": { th: "พบ {n} คอร์ส", en: "{n} courses available" },
  "home.loadingCourses": { th: "กำลังโหลดคอร์ส…", en: "Loading courses…" },
  "home.noCourses": { th: "ยังไม่มีคอร์สที่เปิดรับสมัครในขณะนี้", en: "No courses open for registration yet" },
  "home.error": { th: "เกิดข้อผิดพลาด", en: "An error occurred" },
  "home.seats": { th: "ที่นั่ง", en: "Seats" },
  "home.full": { th: "เต็มแล้ว", en: "Full" },
  "home.seatsLeft": { th: "ว่าง {r} / {c}", en: "{r} / {c} left" },
  "home.register": { th: "ลงทะเบียน", en: "Register" },
  "home.team": { th: "สมัครเป็นทีม {n} คน", en: "Team of {n}" },

  // ---- LoginPage ----
  "login.title": { th: "เข้าสู่ระบบ", en: "Sign In" },
  "login.subtitle": { th: "กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ", en: "Please sign in to continue" },
  "login.signupTitle": { th: "สมัครสมาชิก", en: "Sign Up" },
  "login.signupSubtitle": { th: "สร้างบัญชีใหม่เพื่อเริ่มต้น", en: "Create a new account to get started" },
  "login.email": { th: "อีเมล", en: "Email" },
  "login.password": { th: "รหัสผ่าน", en: "Password" },
  "login.forgot": { th: "ลืมรหัสผ่าน?", en: "Forgot password?" },
  "login.submit": { th: "เข้าสู่ระบบ", en: "Sign In" },
  "login.submitSignup": { th: "สมัครสมาชิก", en: "Sign Up" },
  "login.processing": { th: "กำลังดำเนินการ…", en: "Processing…" },
  "login.orWith": { th: "หรือเข้าสู่ระบบด้วย", en: "Or sign in with" },
  "login.noAccount": { th: "ยังไม่มีบัญชีใช่หรือไม่?", en: "Don't have an account?" },
  "login.signupNew": { th: "สมัครสมาชิกใหม่", en: "Sign up" },
  "login.hasAccount": { th: "มีบัญชีอยู่แล้ว?", en: "Already have an account?" },
  "login.heroSub": { th: "มาร่วมค้นพบประสบการณ์การเรียนรู้แบบใหม่ กับโครงการค่ายฤดูร้อนที่ออกแบบมาสำหรับคุณ", en: "Discover a new learning experience with a summer camp designed for you" },
  // reset modal
  "login.resetTitle": { th: "🔑 รีเซ็ตรหัสผ่าน", en: "🔑 Reset Password" },
  "login.resetSub": { th: "ลิงก์สำหรับตั้งรหัสใหม่จะถูกส่งไปยังอีเมลของคุณ", en: "A password reset link will be sent to your email" },
  "login.resetEmailLabel": { th: "อีเมลที่ใช้สมัคร", en: "Registered email" },
  "login.resetSend": { th: "ส่งลิงก์", en: "Send link" },
  "login.resetSending": { th: "กำลังส่ง…", en: "Sending…" },
  "login.resetSent": { th: "ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว กรุณาตรวจกล่องจดหมาย", en: "Reset link sent to your email. Please check your inbox." },
  "login.resetClose": { th: "ปิด", en: "Close" },
  "login.errInvalid": { th: "อีเมลหรือรหัสผ่านไม่ถูกต้อง", en: "Invalid email or password" },
  "login.errExists": { th: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ", en: "This email is already registered. Please sign in." },
  "login.errPwShort": { th: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", en: "Password must be at least 6 characters" },
  "login.errEmail": { th: "รูปแบบอีเมลไม่ถูกต้อง", en: "Invalid email format" },
  "login.signupOk": { th: "สมัครสำเร็จ! ตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ", en: "Signed up! Check your email to confirm, then sign in." },

  // ---- SignUpPage (แยกหน้า) ----
  "signup.title": { th: "สร้างบัญชีใหม่", en: "Create Account" },
  "signup.subtitle": { th: "กรอกอีเมลและรหัสผ่านเพื่อเริ่มต้น", en: "Enter email and password to get started" },
  "signup.confirmPw": { th: "ยืนยันรหัสผ่าน", en: "Confirm Password" },
  "signup.confirmPwPlaceholder": { th: "กรอกรหัสผ่านอีกครั้ง", en: "Re-enter password" },
  "signup.pwPlaceholder": { th: "อย่างน้อย 6 ตัวอักษร", en: "At least 6 characters" },
  "signup.pwMismatch": { th: "รหัสผ่านไม่ตรงกัน", en: "Passwords do not match" },
  "signup.pwMatch": { th: "✅ รหัสผ่านตรงกัน", en: "✅ Passwords match" },
  "signup.pwNoMatch": { th: "❌ รหัสผ่านไม่ตรงกัน", en: "❌ Passwords do not match" },
  "signup.pwTooShort": { th: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร", en: "Password must be at least 6 characters" },
  "signup.emailUsed": { th: "อีเมลนี้ถูกใช้งานแล้ว", en: "This email is already in use" },
  "signup.strength": { th: "ความปลอดภัย", en: "Strength" },
  "signup.strengthWeak": { th: "สั้นเกินไป", en: "Too short" },
  "signup.strengthFair": { th: "พอใช้", en: "Fair" },
  "signup.strengthGood": { th: "ดี", en: "Good" },
  "signup.strengthStrong": { th: "แข็งแกร่ง", en: "Strong" },
  "signup.submit": { th: "สมัครสมาชิก", en: "Sign Up" },
  "signup.hasAccount": { th: "มีบัญชีอยู่แล้ว?", en: "Already have an account?" },
  "signup.loginNow": { th: "เข้าสู่ระบบเลย", en: "Sign in now" },

  // ---- MyRegistrationPage ----
  "myreg.title": { th: "การสมัครของฉัน", en: "My Registrations" },
  "myreg.addMore": { th: "+ สมัครเพิ่ม", en: "+ Register more" },
  "myreg.tabAll": { th: "ทั้งหมด", en: "All" },
  "myreg.tabActive": { th: "กำลังดำเนินการ", en: "Active" },
  "myreg.tabApproved": { th: "อนุมัติแล้ว", en: "Approved" },
  "myreg.tabPending": { th: "รอชำระ", en: "Pending payment" },
  "myreg.tabWaitlist": { th: "Waitlist", en: "Waitlist" },
  "myreg.empty": { th: "ยังไม่มีรายการสมัคร", en: "No registrations yet" },
  "myreg.emptySub": { th: "เริ่มสมัครคอร์สที่คุณสนใจได้เลย", en: "Start by registering for a course" },
  "myreg.viewCourses": { th: "ดูรายวิชาที่เปิดรับ →", en: "Browse courses →" },
  "myreg.noneInTab": { th: "ไม่มีรายการในหมวดนี้", en: "Nothing in this category" },
  "myreg.regId": { th: "รหัส", en: "ID" },
  "myreg.registeredOn": { th: "สมัครเมื่อ", en: "Registered" },
  "myreg.payNow": { th: "💳 ชำระเงิน", en: "💳 Pay now" },
  "myreg.showBarcode": { th: "🪪 บาร์โค้ดเช็คอิน", en: "🪪 Check-in barcode" },
  "myreg.checkinTitle": { th: "บัตรเช็คอิน", en: "Check-in Card" },
  "myreg.checkinSub": { th: "โปรดแสดงหน้านี้แก่เจ้าหน้าที่", en: "Show this to staff" },
  "myreg.closeWindow": { th: "ปิดหน้าต่าง", en: "Close" },
  // สถานะ
  "myreg.st.confirmed": { th: "ยืนยันแล้ว", en: "Confirmed" },
  "myreg.st.pending_review": { th: "รอตรวจสอบสลิป", en: "Reviewing slip" },
  "myreg.st.pending_payment": { th: "รอชำระเงิน", en: "Pending payment" },
  "myreg.st.held": { th: "รออนุมัติ", en: "Pending approval" },
  "myreg.st.waitlist": { th: "Waitlist", en: "Waitlist" },
  "myreg.st.cancelled": { th: "ยกเลิกแล้ว", en: "Cancelled" },
  "myreg.st.rejected": { th: "ไม่ผ่าน", en: "Rejected" },

  // ---- ProfilePage ----
  "profile.title": { th: "ลงทะเบียนประวัติสมาชิก", en: "Member Registration" },
  "profile.subtitle": { th: "กรุณากรอกข้อมูลให้ครบถ้วนเพื่อผลประโยชน์สูงสุดของคุณ", en: "Please complete all information for the best experience" },
  "profile.step1": { th: "ข้อมูลส่วนตัว", en: "Personal" },
  "profile.step2": { th: "ผู้ปกครอง", en: "Parent" },
  "profile.step3": { th: "ที่อยู่", en: "Address" },
  "profile.personalInfo": { th: "ข้อมูลส่วนตัว / Personal Information", en: "Personal Information" },
  "profile.parentInfo": { th: "ข้อมูลผู้ปกครอง / Parent Information", en: "Parent Information" },
  "profile.addressInfo": { th: "ที่อยู่ปัจจุบัน / Current Address", en: "Current Address" },
  "profile.nationality": { th: "สัญชาติ / NATIONALITY", en: "Nationality" },
  "profile.thai": { th: "TH สัญชาติไทย", en: "TH Thai" },
  "profile.foreign": { th: "🌏 ต่างชาติ", en: "🌏 Foreign" },
  "profile.nationalId": { th: "เลขบัตรประชาชน", en: "National ID" },
  "profile.passport": { th: "เลขพาสปอร์ต", en: "Passport No." },
  "profile.idPlaceholder": { th: "13 หลัก", en: "13 digits" },
  "profile.nickname": { th: "ชื่อเล่น / NICKNAME", en: "Nickname" },
  "profile.titleName": { th: "คำนำหน้า / TITLE", en: "Title" },
  "profile.firstName": { th: "ชื่อจริง / FIRST NAME", en: "First Name" },
  "profile.lastName": { th: "นามสกุล / LAST NAME", en: "Last Name" },
  "profile.age": { th: "อายุ / AGE", en: "Age" },
  "profile.grade": { th: "ระดับชั้น / GRADE", en: "Grade" },
  "profile.school": { th: "โรงเรียน / SCHOOL", en: "School" },
  "profile.schoolPlaceholder": { th: "พิมพ์ภาษาไทย เช่น ยุพราช, วัฒโนทัย…", en: "Type school name…" },
  "profile.phone": { th: "เบอร์โทรศัพท์ / PHONE", en: "Phone" },
  "profile.lineId": { th: "ID LINE", en: "LINE ID" },
  "profile.select": { th: "— เลือก —", en: "— Select —" },
  "profile.selectGrade": { th: "— เลือกระดับชั้น —", en: "— Select grade —" },
  "profile.parentTitle": { th: "คำนำหน้า / TITLE", en: "Title" },
  "profile.parentName": { th: "ชื่อ-นามสกุล ผู้ปกครอง / FULL NAME", en: "Parent Full Name" },
  "profile.relationship": { th: "ความสัมพันธ์ / RELATIONSHIP", en: "Relationship" },
  "profile.relationshipPlaceholder": { th: "เช่น บิดา, มารดา", en: "e.g. Father, Mother" },
  "profile.parentPhone": { th: "เบอร์โทรผู้ปกครอง / PARENT PHONE", en: "Parent Phone" },
  "profile.address": { th: "บ้านเลขที่, หมู่, ซอย, ถนน / ADDRESS", en: "Address" },
  "profile.addressPlaceholder": { th: "เช่น 99/9 หมู่ 1 ถ.พหลโยธิน", en: "e.g. 99/9 Moo 1 Phahonyothin Rd." },
  "profile.subdistrict": { th: "ตำบล / แขวง (พิมพ์เพื่อค้นหา) / SUBDISTRICT", en: "Subdistrict" },
  "profile.subdistrictPlaceholder": { th: "พิมพ์ตำบล เช่น เถิน…", en: "Type subdistrict…" },
  "profile.district": { th: "อำเภอ / เขต / DISTRICT", en: "District" },
  "profile.province": { th: "จังหวัด / PROVINCE", en: "Province" },
  "profile.zipcode": { th: "รหัสไปรษณีย์ / ZIPCODE", en: "Zipcode" },
  "profile.saveAndContinue": { th: "บันทึกและไปเลือกคอร์ส →", en: "Save and choose courses →" },
  "profile.saving": { th: "กำลังบันทึก…", en: "Saving…" },
  "profile.fillRequired": { th: "กรุณากรอกชื่อ-นามสกุลให้ครบ", en: "Please fill in your first and last name" },

  // ---- RegisterPage ----
  "reg.backToCourses": { th: "← กลับหน้าคอร์ส", en: "← Back to courses" },
  "reg.title": { th: "ยืนยันการสมัคร", en: "Confirm Registration" },
  "reg.applicant": { th: "ผู้สมัคร (จากประวัติของคุณ)", en: "Applicant (from your profile)" },
  "reg.editProfile": { th: "แก้ไขประวัติ", en: "Edit profile" },
  "reg.teamMembers": { th: "สมาชิกในทีม", en: "Team Members" },
  "reg.member": { th: "สมาชิกคนที่ {n}", en: "Member {n}" },
  "reg.memberName": { th: "ชื่อ-นามสกุล สมาชิก", en: "Member full name" },
  "reg.advisor": { th: "ครูที่ปรึกษา", en: "Advisor" },
  "reg.advisorName": { th: "ชื่อ-นามสกุล ครูที่ปรึกษา", en: "Advisor full name" },
  "reg.advisorPhone": { th: "เบอร์โทรครูที่ปรึกษา", en: "Advisor phone" },
  "reg.confirm": { th: "ยืนยันการสมัคร", en: "Confirm registration" },
  "reg.holding": { th: "กำลังกันที่นั่ง…", en: "Reserving seat…" },
  "reg.free": { th: "คอร์สนี้ไม่มีค่าใช้จ่าย (รอแอดมินอนุมัติ)", en: "This course is free (pending admin approval)" },
  "reg.needName": { th: "กรุณากรอกชื่อสมาชิกให้ครบทุกคน", en: "Please fill in all member names" },
  "reg.needAdvisor": { th: "กรุณากรอกชื่อครูที่ปรึกษา", en: "Please fill in the advisor name" },
  // payment
  "pay.title": { th: "ชำระเงิน", en: "Payment" },
  "pay.deadline": { th: "เหลือเวลาชำระเงิน", en: "Time left to pay" },
  "pay.expired": { th: "หมดเวลาชำระเงิน", en: "Payment time expired" },
  "pay.regId": { th: "รหัสใบสมัคร", en: "Registration ID" },
  "pay.amount": { th: "ยอดชำระ", en: "Amount" },
  "pay.baht": { th: "บาท", en: "THB" },
  "pay.bankInfo": { th: "ช่องทางการชำระเงิน", en: "Payment method" },
  "pay.accountNo": { th: "เลขที่บัญชี", en: "Account no." },
  "pay.accountName": { th: "ชื่อบัญชี", en: "Account name" },
  "pay.copy": { th: "คัดลอก", en: "Copy" },
  "pay.copied": { th: "คัดลอกแล้ว ✓", en: "Copied ✓" },
  "pay.uploadSlip": { th: "อัปโหลดสลิปโอนเงิน", en: "Upload payment slip" },
  "pay.tapSelect": { th: "แตะเพื่อเลือกสลิป", en: "Tap to select slip" },
  "pay.fileTypes": { th: "รองรับ JPG, PNG ขนาดไม่เกิน 5MB", en: "JPG, PNG up to 5MB" },
  "pay.selected": { th: "เลือกไฟล์แล้ว", en: "File selected" },
  "pay.tapChange": { th: "แตะเพื่อเปลี่ยนไฟล์", en: "Tap to change file" },
  "pay.submit": { th: "ยืนยันการโอนเงิน →", en: "Confirm payment →" },
  "pay.sending": { th: "กำลังส่ง…", en: "Sending…" },
  "pay.warn": { th: "ระบบล็อคที่นั่งให้ท่าน 30 นาที หากเกินเวลาต้องสมัครใหม่", en: "Seat held for 30 minutes. Re-register if expired." },
  "pay.successTitle": { th: "ส่งหลักฐานเรียบร้อย!", en: "Submitted successfully!" },
  "pay.successWait": { th: "รอการตรวจสอบจากแอดมิน 1-2 วันทำการ", en: "Pending admin review (1-2 business days)" },
  "pay.backHome": { th: "กลับหน้าหลัก", en: "Back to home" },
  "reg.successFreeTitle": { th: "สมัครเรียบร้อย!", en: "Registered successfully!" },
  "reg.successFreeMsg": { th: "ใบสมัครของคุณถูกส่งแล้ว รอแอดมินอนุมัติ", en: "Your registration is submitted, pending admin approval" },
  "reg.waitlistTitle": { th: "คุณอยู่ในรายชื่อสำรอง (Waitlist)", en: "You are on the waitlist" },
  "reg.waitlistMsg": { th: "ที่นั่งเต็ม เมื่อมีที่ว่างระบบจะเรียกคิวอัตโนมัติ", en: "Course full. We'll notify you when a seat opens." },

  // ---- AdminPanel ----
  "admin.panel": { th: "ADMIN PANEL", en: "ADMIN PANEL" },
  "admin.menu": { th: "เมนูหลัก", en: "Main Menu" },
  "admin.dashboard": { th: "Dashboard", en: "Dashboard" },
  "admin.registrations": { th: "จัดการการสมัคร", en: "Registrations" },
  "admin.users": { th: "จัดการผู้ใช้งาน", en: "User Management" },
  "admin.courses": { th: "จัดการรายวิชา", en: "Courses" },
  "admin.checkin": { th: "จุดสแกน (Check-In)", en: "Check-In" },
  "admin.attendance": { th: "สรุปการมาเรียน", en: "Attendance" },
  "admin.settings": { th: "ตั้งค่าเว็บ", en: "Site Settings" },
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("lang") || "th" } catch { return "th" }
  })
  useEffect(() => {
    try { localStorage.setItem("lang", lang) } catch {}
  }, [lang])

  function t(key, vars) {
    const entry = T[key]
    let str = entry ? (entry[lang] ?? entry.th ?? key) : key
    if (vars) {
      for (const k in vars) str = str.replace(`{${k}}`, vars[k])
    }
    return str
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  // fallback ถ้าลืมห่อ Provider — คืน th ตรงๆ กันแอปพัง
  if (!ctx) {
    return {
      lang: "th",
      setLang: () => {},
      t: (key, vars) => {
        const entry = T[key]
        let str = entry ? entry.th : key
        if (vars) for (const k in vars) str = str.replace(`{${k}}`, vars[k])
        return str
      },
    }
  }
  return ctx
}

// ปุ่มสลับภาษา ใช้วางที่ไหนก็ได้
export function LangToggle({ style }) {
  const { lang, setLang } = useLang()
  return (
    <button
      onClick={() => setLang(lang === "th" ? "en" : "th")}
      style={{
        background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)",
        padding: "6px 12px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
        ...style,
      }}
      title={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
    >
      {lang === "th" ? "🇹🇭 ไทย" : "🇬🇧 EN"}
    </button>
  )
}