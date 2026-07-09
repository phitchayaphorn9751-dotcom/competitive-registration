import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error("ยังไม่ได้ตั้งค่า .env — ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY")
}

export const supabase = createClient(url, anonKey)

// ===== ข้อมูลสาธารณะ =====

export async function fetchOpenEvent() {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, year, status")
    .eq("status", "open")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// schema จริง: courses.type_id -> course_types ; ไม่มี course_type_id
export async function fetchCourses(eventId) {
  let q = supabase
    .from("courses")
    .select(
      "id, title, description, content, count_mode, team_size, min_members, max_members, capacity, seats_taken, price, bank_account, image_url, image_urls, detail_images, attachments, level, start_date, end_date, duration, timeline, sessions, line_qr_url, form_schema, is_open, external_url, course_types:type_id(code,label,requires_payment,requires_approval,color), course_instructors(instructors(full_name)), course_days(day_date,start_at,end_at)"
    )
    .order("created_at", { ascending: true })
  if (eventId) q = q.eq("event_id", eventId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function fetchCourse(courseId) {
  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, event_id, title, description, content, count_mode, team_size, min_members, max_members, capacity, seat_mode, require_portfolio, portfolio_label, seats_taken, price, bank_account, bank_name, bank_holder, line_qr_url, image_url, image_urls, detail_images, attachments, level, start_date, end_date, duration, timeline, sessions, form_schema, is_open, external_url, course_types:type_id(code,label,requires_payment,requires_approval,color)"
    )
    .eq("id", courseId)
    .single()
  if (error) throw error
  return data
}

// ดึงรายชื่อสมาชิกในทีมของใบสมัคร (RPC security definer เลี่ยง RLS)
export async function fetchRegistrationMembers(regId) {
  const { data, error } = await supabase.rpc("my_registration_members", { p_reg_id: regId })
  if (error) return []
  return data || []
}

// ===== ลงทะเบียน (ผ่าน RPC) =====

// schema จริง: hold_seat คืน uuid ตรงๆ (ไม่ใช่ table)
export async function holdSeat(courseId, email, seats) {
  const { data, error } = await supabase.rpc("hold_seat", {
    p_course_id: courseId,
    p_submitter_email: email,
    p_seats_needed: seats,
  })
  if (error) throw error
  return data // registration uuid
}

// ตั้งเวลาหมดอายุชำระเงิน (DB) — รีเฟรชไม่รีเซ็ต
export async function setPaymentDeadline(regId) {
  const { data, error } = await supabase.rpc("set_payment_deadline", { p_reg_id: regId })
  if (error) return null
  return data
}
export async function fetchRegistrationDeadline(regId) {
  const { data, error } = await supabase.from("registrations").select("payment_deadline").eq("id", regId).single()
  if (error) return null
  return data?.payment_deadline || null
}
// รีเซ็ตเวลาใหม่ (ตอนตีกลับ → ผู้สมัครได้ 30 นาทีใหม่)
export async function resetPaymentDeadline(regId) {
  const { data, error } = await supabase.rpc("reset_payment_deadline", { p_reg_id: regId })
  if (error) return null
  return data
}

// ปรับสถานะให้ถูกตามเงื่อนไข (ฟรี+ไม่แนบผลงาน=confirmed, ฟรี+แนบ=submitted, เสียเงิน=pending_payment)
export async function finalizeRegistration(regId, hasPortfolio) {
  const { data, error } = await supabase.rpc("finalize_registration", {
    p_reg_id: regId,
    p_has_portfolio: !!hasPortfolio,
  })
  if (error) throw error
  return data // status ใหม่
}

export async function addParticipant(registrationId, p) {
  const { data, error } = await supabase.rpc("add_participant", {
    p_registration_id: registrationId,
    p_full_name: p.full_name,
    p_school: p.school || null,
    p_grade_level: p.grade_level || null,
    p_phone: p.phone || null,
    p_email: p.email || null,
    p_extra_info: p.extra_info || {},
  })
  if (error) throw error
  // บันทึกเลขบัตร (ถ้ามี) — แยกจาก RPC เดิม
  if (data && p.national_id) {
    await supabase.from("participants").update({ national_id: p.national_id }).eq("id", data)
  }
  return data // participant id
}

// ลบรายการสมัคร (ใบเดียว) + คืนที่นั่ง
export async function deleteRegistration(regId) {
  const { data, error } = await supabase.rpc("admin_delete_registration", { p_reg_id: regId })
  if (error) throw error
  return data
}

// ข้อ 11: ลบผู้ใช้ + ประวัติทั้งหมด
export async function adminDeleteUser(email) {
  const { data, error } = await supabase.rpc("admin_delete_user", { p_email: email })
  if (error) throw error
  return data
}
// ข้อ 9: แก้ข้อมูลนักเรียน (ไม่แตะ national_id/email)
export async function adminUpdateStudent(profileId, fields) {
  const { error } = await supabase.from("profiles").update({
    title: fields.title, first_name: fields.first_name, last_name: fields.last_name,
    nickname: fields.nickname, age: fields.age ? Number(fields.age) : null, phone: fields.phone,
    grade_level: fields.grade_level, line_id: fields.line_id, school: fields.school,
    parent_full_name: fields.parent_full_name, parent_phone: fields.parent_phone,
  }).eq("id", profileId)
  if (error) throw error
  return true
}

// ข้อ 6: แอดมินเปลี่ยนคอร์สของใบสมัคร
export async function adminChangeCourse(regId, newCourseId) {
  const { data, error } = await supabase.rpc("admin_change_course", { p_reg_id: regId, p_new_course_id: newCourseId })
  if (error) throw error
  return data
}
// ข้อ 7: แอดมินแก้จำนวนเงิน
export async function adminUpdatePaymentAmount(regId, amount) {
  const { data, error } = await supabase.rpc("admin_update_payment_amount", { p_reg_id: regId, p_amount: amount })
  if (error) throw error
  return data
}

// ข้อ 3: ติดตามการเปลี่ยนแปลง registrations แบบเรียลไทม์
// คำนวณจำนวนที่นั่งใหม่ทุกคอร์ส (แก้ seats_taken ค้าง)
export async function recalcAllSeats() {
  const { error } = await supabase.rpc("recalc_all_seats")
  if (error) throw error
}

export function subscribeRegistrations(onChange) {
  const channel = supabase
    .channel("registrations-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => onChange())
    .subscribe()
  return channel
}

// realtime การเช็คอิน (สำหรับหน้าเช็คอิน — log ขึ้นทันที)
export function subscribeCheckins(onChange) {
  const channel = supabase
    .channel("checkins-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, (payload) => onChange(payload))
    .subscribe()
  return channel
}

// realtime ใบสมัครของฉัน (สถานะเปลี่ยน user เห็นทันที)
export function subscribeMyRegistrations(onChange) {
  const channel = supabase
    .channel("my-reg-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => onChange())
    .subscribe()
  return channel
}

// ข้อ 5: เช็คสมัครซ้ำ (อีเมล/เลขบัตร ในคอร์สเดียวกัน)
export async function checkDuplicateRegistration(courseId, email, nationalIds) {
  const { data, error } = await supabase.rpc("check_duplicate_registration", {
    p_course_id: courseId, p_email: email, p_national_ids: nationalIds || [],
  })
  if (error) throw error
  return data // { duplicate, reason? }
}

// ข้อ 4: ออกเลขประจำตัวให้ participant (GAME-001)
export async function assignParticipantCode(participantId) {
  if (!participantId) return null
  const { data, error } = await supabase.rpc("assign_participant_code", { p_participant_id: participantId })
  if (error) return null
  return data // code
}

// สำรอง: ออกเลขให้ทุกคนในใบสมัคร (กันกรณี add_participant ไม่คืน id)
export async function assignCodesForRegistration(regId) {
  const { error } = await supabase.rpc("assign_codes_for_registration", { p_reg_id: regId })
  if (error) return false
  return true
}

// ข้อ 2.4: บันทึกชื่อธีมในใบสมัคร
export async function saveRegistrationTheme(regId, theme) {
  // ใช้ RPC (security definer) เลี่ยง RLS — update ตรง ๆ ถูกบล็อก
  const { error } = await supabase.rpc("save_registration_theme", { p_reg_id: regId, p_theme: theme })
  if (error) throw error
}

// ครูที่ปรึกษา — ผ่าน RPC add_advisor (security definer)
export async function addAdvisor(registrationId, advisor) {
  const { data, error } = await supabase.rpc("add_advisor", {
    p_registration_id: registrationId,
    p_full_name: advisor.full_name,
    p_phone: advisor.phone || null,
    p_email: advisor.email || null,
  })
  if (error) throw error
  return data
}

// บันทึกลิงก์ผลงานลงใบสมัคร
export async function savePortfolioUrl(registrationId, url) {
  // ใช้ RPC (security definer) เลี่ยง RLS — update ตรง ๆ จะถูกบล็อก
  const { error } = await supabase.rpc("save_portfolio_url", { p_reg_id: registrationId, p_url: url })
  if (error) throw error
}

export async function uploadSlip(file, registrationId) {
  const ext = file.name.split(".").pop()
  const path = `${registrationId}.${ext}`
  const { error } = await supabase.storage
    .from("slips")
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from("slips").getPublicUrl(path)
  return data.publicUrl
}

// schema จริง: attach_slip(p_registration_id, p_slip_url, p_amount int)
export async function attachSlip(registrationId, slipUrl, amount) {
  const { error } = await supabase.rpc("attach_slip", {
    p_registration_id: registrationId,
    p_slip_url: slipUrl,
    p_amount: Math.round(amount), // schema รับ int
  })
  if (error) throw error
}

// ===== แอดมิน — Auth =====

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // กลับมาที่ /login เพื่อให้ routeAfterAuth แยกทาง admin/user
    options: { redirectTo: window.location.origin + "/login" },
  })
  if (error) throw error
}

// ส่งอีเมลรีเซ็ตรหัสผ่าน
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password",
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// schema จริง: is_admin() เช็คจาก admins.id = auth.uid()
export async function isAdminUser() {
  const { data, error } = await supabase.rpc("is_admin")
  if (error) return false
  return data === true
}

// ===== Profile ผู้ใช้ =====

export async function isProfileComplete() {
  const { data, error } = await supabase.rpc("profile_complete")
  if (error) return false
  return data === true
}

export async function fetchMyProfile() {
  const session = await getSession()
  if (!session) return null
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveProfile(profile) {
  const { error } = await supabase.rpc("save_profile", { p: profile })
  if (error) throw error
}

// รายการสมัครของผู้ใช้ที่ล็อกอิน (ผ่าน RPC ที่กรองด้วย auth.email())
export async function fetchMyRegistrations() {
  const { data, error } = await supabase.rpc("my_registrations")
  if (error) throw error
  return data || []
}

// ===== แอดมิน — อ่าน/จัดการการสมัคร =====

// ดึงโปรไฟล์นักเรียนทั้งหมด + email (สำหรับหน้าจัดการนักเรียน)
export async function fetchAllProfiles() {
  const { data, error } = await supabase.rpc("admin_list_students")
  if (error) throw error
  return data || []
}

// ดึงรายการสมัครของนักเรียนรายคน (ตามอีเมล) — ใช้ใน modal ประวัติ
export async function fetchRegistrationsByEmail(email) {
  const { data, error } = await supabase.rpc("admin_student_registrations", { p_email: email })
  if (error) throw error
  return data || []
}

// schema จริง: เช็คอินอยู่ในตาราง checkins แยก ผูก participant_id
export async function fetchRegistrations(eventId) {
  let q = supabase
    .from("registrations")
    .select(
      "id, status, submitter_email, submitter_phone, seats_held, qr_token, waitlist_pos, created_at, course_id, theme_name, payment_deadline, session_id, courses!inner(title, event_id, price, require_portfolio, sessions), advisors(id,full_name,phone,email), participants(id,full_name,school,grade_level,phone,email,participant_code,qr_token,checkins(id,scanned_at)), payments(id,amount,slip_url,status)"
    )
    .order("created_at", { ascending: false })
  if (eventId) q = q.eq("courses.event_id", eventId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function confirmRegistration(registrationId, adminId) {
  const { error } = await supabase.rpc("confirm_registration", {
    p_registration_id: registrationId,
    p_admin_id: adminId,
  })
  if (error) throw error
}

export async function releaseSeat(registrationId) {
  const { error } = await supabase.rpc("release_seat", {
    p_registration_id: registrationId,
  })
  if (error) throw error
}

// คืนที่นั่ง = ยกเลิกใบสมัคร (status cancelled + ดึง waitlist)
export async function cancelRegistration(registrationId) {
  const { error } = await supabase.rpc("cancel_registration", {
    p_registration_id: registrationId,
  })
  if (error) throw error
}

// ประเภท 2 (ฟรี+ผลงาน): admin กด "ไม่ผ่าน" → ส่งกลับคิวสำรอง (ไม่ต้องใส่เหตุผล)
export async function rejectPortfolio(registrationId) {
  const { error } = await supabase.rpc("reject_portfolio", {
    p_registration_id: registrationId,
  })
  if (error) throw error
}

// ประเภท 3 (เสียเงิน): admin กด "ให้สิทธิ์" ดึงคิวสำรองขึ้นมา → รอชำระเงิน (ไม่จับเวลา)
export async function promoteWaitlist(registrationId) {
  const { error } = await supabase.rpc("promote_waitlist", {
    p_registration_id: registrationId,
  })
  if (error) throw error
}

// ดึงใบสมัครเดียว (รายละเอียดเต็ม สำหรับหน้าตรวจสลิป)
export async function fetchRegistration(registrationId) {
  const { data, error } = await supabase
    .from("registrations")
    .select(
      "*, courses(title, price, event_id, require_portfolio, portfolio_label, course_types:type_id(label,requires_payment,color)), advisors(id,full_name,phone,email), participants(id,full_name,school,grade_level,phone,email,national_id,participant_code,qr_token,checkins(id,scanned_at)), payments(id,amount,slip_url,status,created_at)"
    )
    .eq("id", registrationId)
    .single()
  if (error) throw error
  return data
}

// ตีกลับใบสมัคร (สลิปไม่ผ่าน) พร้อมเหตุผล
export async function rejectRegistration(registrationId, reason) {
  const { error } = await supabase.rpc("reject_registration", {
    p_registration_id: registrationId,
    p_reason: reason,
  })
  if (error) throw error
}

// ===== แอดมิน — จัดการ events / courses (ใช้ซ้ำหลายปี) =====

export async function fetchAllEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, year, status, created_at")
    .order("year", { ascending: false })
  if (error) throw error
  return data
}

export async function saveEvent(ev) {
  if (ev.id) {
    const { error } = await supabase.from("events")
      .update({ name: ev.name, year: ev.year, status: ev.status })
      .eq("id", ev.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("events")
      .insert({ name: ev.name, year: ev.year, status: ev.status || "draft" })
    if (error) throw error
  }
}

// ตั้งงานนี้เป็น "เปิดรับสมัคร" — ปิด open ของงานอื่นก่อน (เปิดได้ทีละงาน)
export async function setEventOpen(eventId) {
  // ปิดงานที่เปิดอยู่ทั้งหมดก่อน
  const { error: e1 } = await supabase.from("events")
    .update({ status: "closed" }).eq("status", "open").neq("id", eventId)
  if (e1) throw e1
  // เปิดงานที่เลือก
  const { error: e2 } = await supabase.from("events")
    .update({ status: "open" }).eq("id", eventId)
  if (e2) throw e2
}

// เปลี่ยนสถานะงาน (draft/open/closed) — ถ้าตั้ง open ใช้ setEventOpen เพื่อกันซ้อน
export async function setEventStatus(eventId, status) {
  if (status === "open") return setEventOpen(eventId)
  const { error } = await supabase.from("events").update({ status }).eq("id", eventId)
  if (error) throw error
}

// ลบงาน (ลบได้เฉพาะงานที่ไม่มีคอร์ส — กันลบประวัติ)
export async function deleteEvent(eventId) {
  const { count, error: ce } = await supabase
    .from("courses").select("id", { count: "exact", head: true }).eq("event_id", eventId)
  if (ce) throw ce
  if (count > 0) throw new Error("EVENT_HAS_COURSES")
  const { error } = await supabase.from("events").delete().eq("id", eventId)
  if (error) throw error
}

export async function fetchCourseTypes(eventId) {
  let q = supabase
    .from("course_types")
    .select("id, code, label, requires_payment, requires_approval, color, event_id")
    .order("label")
  const { data, error } = await q
  if (error) throw error
  // คืนเฉพาะของงานนี้ + ค่ากลาง (event_id เป็น null = ใช้ได้ทุกงาน)
  if (eventId) return (data || []).filter((t) => !t.event_id || t.event_id === eventId)
  return data
}

// เพิ่ม/แก้ประเภทวิชา (หมวดหมู่) — ผูกกับงาน
export async function saveCourseType(ct, eventId) {
  const payload = {
    code: ct.code, label: ct.label,
    requires_payment: !!ct.requires_payment,
    requires_approval: !!ct.requires_approval,
    color: ct.color || null,
  }
  if (ct.id) {
    const { error } = await supabase.from("course_types").update(payload).eq("id", ct.id)
    if (error) throw error
  } else {
    // ประเภทใหม่ผูกกับงานที่เลือก
    const { error } = await supabase.from("course_types").insert({ ...payload, event_id: eventId || null })
    if (error) throw error
  }
}

// ลบประเภทวิชา — ลบไม่ได้ถ้ามีคอร์สใช้อยู่
export async function deleteCourseType(id) {
  const { count, error: ce } = await supabase
    .from("courses").select("id", { count: "exact", head: true }).eq("type_id", id)
  if (ce) throw ce
  if (count > 0) throw new Error("TYPE_IN_USE")
  const { error } = await supabase.from("course_types").delete().eq("id", id)
  if (error) throw error
}

// schema จริง: courses ใช้ type_id, count_mode in ('person','team')
export async function fetchCoursesAdmin(eventId) {
  let q = supabase
    .from("courses")
    .select("id, event_id, type_id, title, description, content, count_mode, team_size, min_members, max_members, capacity, seat_mode, require_portfolio, portfolio_label, seats_taken, price, bank_account, bank_name, bank_holder, image_url, image_urls, detail_images, attachments, line_qr_url, base_id, level, start_date, end_date, duration, timeline, sessions, form_schema, is_open, external_url, course_types:type_id(label,color), course_instructors(instructors(full_name)), course_days(day_date)")
    .order("created_at", { ascending: true })
  if (eventId) q = q.eq("event_id", eventId)
  const { data, error } = await q
  if (error) throw error
  return data
}

// อัปโหลดรูป/ไฟล์ของวิชาขึ้น Storage (bucket: course-assets) → คืน public URL
export async function uploadCourseAsset(file, folder = "images") {
  const ext = file.name.split(".").pop()
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from("course-assets").upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from("course-assets").getPublicUrl(path)
  return data.publicUrl
}

// คัดลอกคอร์ส (เลือกหลายคอร์ส) ไปยังงานปลายทาง — ไม่ก็อป seats_taken/ผู้สมัคร
export async function duplicateCourses(courseIds, toEventId) {
  if (!courseIds?.length || !toEventId) return []
  // ดึงคอร์สต้นฉบับ
  const { data: sources, error: e1 } = await supabase
    .from("courses")
    .select("type_id, title, description, content, count_mode, team_size, min_members, max_members, capacity, seat_mode, require_portfolio, portfolio_label, price, bank_account, bank_name, bank_holder, image_url, image_urls, detail_images, attachments, line_qr_url, base_id, level, start_date, end_date, duration, timeline, sessions, form_schema")
    .in("id", courseIds)
  if (e1) throw e1
  // เตรียม payload งานใหม่ (seats_taken=0, is_open=false ให้แอดมินเปิดเอง)
  const rows = (sources || []).map((s) => ({ ...s, event_id: toEventId, seats_taken: 0, is_open: false }))
  const { data, error } = await supabase.from("courses").insert(rows).select("id")
  if (error) throw error
  return data || []
}

export async function saveCourse(c) {
  const payload = {
    event_id: c.event_id,
    type_id: c.type_id,
    title: c.title,
    description: c.description || null,
    content: c.content || null,
    count_mode: c.count_mode,        // 'person' | 'team'
    team_size: c.count_mode === "team" ? Number(c.team_size) || 2 : 1,
    min_members: Number(c.min_members) || 1,
    max_members: Number(c.max_members) || (c.count_mode === "team" ? Number(c.team_size) || 2 : 1),
    capacity: Number(c.capacity) || 0,
    seat_mode: c.seat_mode || "limited",
    require_portfolio: !!c.require_portfolio,
    portfolio_label: c.portfolio_label || null,
    price: Math.round(Number(c.price) || 0),
    bank_account: c.bank_account || null,
    bank_name: c.bank_name || null,
    bank_holder: c.bank_holder || null,
    image_url: c.image_url || (c.image_urls?.[0] || null),
    image_urls: c.image_urls || [],
    detail_images: Array.isArray(c.detail_images) ? c.detail_images : [],
    attachments: Array.isArray(c.attachments) ? c.attachments : [],
    line_qr_url: c.line_qr_url || null,
    base_id: c.base_id ? String(c.base_id).trim().toUpperCase() : null,
    level: c.level || null,
    start_date: c.start_date || null,
    end_date: c.end_date || null,
    duration: c.duration || null,
    timeline: Array.isArray(c.timeline) ? c.timeline : [],
    sessions: Array.isArray(c.sessions) ? c.sessions : [],
    form_schema: c.form_schema || [],
    is_open: c.is_open,
    external_url: c.external_url ? String(c.external_url).trim() : null,
  }
  let courseId = c.id
  if (c.id) {
    const { error } = await supabase.from("courses").update(payload).eq("id", c.id)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from("courses").insert(payload).select("id").single()
    if (error) throw error
    courseId = data.id
  }
  // บันทึกผู้สอน (ถ้าส่งมา)
  if (c.instructor_names !== undefined) {
    await setCourseInstructors(courseId, c.instructor_names || [])
  }
  return courseId
}

export async function deleteCourse(courseId) {
  const { error } = await supabase.from("courses").delete().eq("id", courseId)
  if (error) throw error
}

// ===== เช็คอิน =====

export async function checkInByToken(token) {
  const { data, error } = await supabase.rpc("check_in_by_token", {
    p_token: token,
  })
  if (error) throw error
  return data
}

// เช็คอินรายวัน (แยกตามวิชา + วัน) — คืน { ok, duplicate?, reason?, name?, school?, course_title?, time? }
export async function checkInDaily(token, courseId, dateKey, method = "qr") {
  const { data, error } = await supabase.rpc("check_in_daily", {
    p_token: token, p_course_id: courseId, p_date: dateKey, p_method: method,
  })
  if (error) throw error
  return data
}

// ดึงรายชื่อนักเรียนยืนยันแล้ว + สถานะเช็คชื่อวันนั้น (โหมดรายวัน)
export async function attendanceRoster(courseId, dateKey) {
  const { data, error } = await supabase.rpc("attendance_roster", { p_course_id: courseId, p_date: dateKey })
  if (error) throw error
  return data || []
}
// เช็คชื่อด้วยมือ
export async function attendanceMark(participantId, courseId, dateKey) {
  const { data, error } = await supabase.rpc("attendance_mark", { p_participant_id: participantId, p_course_id: courseId, p_date: dateKey })
  if (error) throw error
  return data
}
// ติ๊กออก
export async function attendanceUnmark(participantId, courseId, dateKey) {
  const { data, error } = await supabase.rpc("attendance_unmark", { p_participant_id: participantId, p_course_id: courseId, p_date: dateKey })
  if (error) throw error
  return data
}
// อัปเดตผลประเมิน/หมายเหตุ
export async function attendanceUpdate(participantId, courseId, dateKey, evaluation, note) {
  const { data, error } = await supabase.rpc("attendance_update", { p_participant_id: participantId, p_course_id: courseId, p_date: dateKey, p_evaluation: evaluation, p_note: note })
  if (error) throw error
  return data
}
// สรุปทั้งคอร์ส (โหมดสรุปยอดรวม)
export async function attendanceSummary(courseId) {
  const { data, error } = await supabase.rpc("attendance_summary", { p_course_id: courseId })
  if (error) throw error
  return data || []
}

// ดึงรายการเช็คอินของวิชา+วัน (log + นับจำนวน)
export async function attendanceDaily(courseId, dateKey) {
  const { data, error } = await supabase.rpc("attendance_daily", {
    p_course_id: courseId, p_date: dateKey,
  })
  if (error) throw error
  return data || []
}

// ===== Dashboard / สรุป =====

export async function fetchDashboardStats(eventId) {
  const { data, error } = await supabase.rpc("dashboard_stats", { p_event_id: eventId })
  if (error) throw error
  return data
}

// ข้อมูล flat สำหรับ Dashboard analytics (1 แถวต่อ participant)
export async function fetchDashboardRegistrations(eventId) {
  if (!eventId) return []
  const { data, error } = await supabase.rpc("dashboard_registrations", { p_event_id: eventId })
  if (error) throw error
  return data || []
}

export async function fetchAttendanceByCourse(eventId) {
  const { data, error } = await supabase.rpc("attendance_by_course", { p_event_id: eventId })
  if (error) throw error
  return data || []
}

// ===== จัดการคอร์ส inline =====

export async function toggleCourseOpen(courseId, isOpen) {
  const { error } = await supabase.rpc("toggle_course_open", {
    p_course_id: courseId, p_is_open: isOpen,
  })
  if (error) throw error
}

export async function updateCapacity(courseId, capacity) {
  const { error } = await supabase.rpc("update_capacity", {
    p_course_id: courseId, p_capacity: Math.round(capacity),
  })
  if (error) throw error
}

export async function emergencyCloseAll(eventId) {
  const { data, error } = await supabase.rpc("emergency_close_all", { p_event_id: eventId })
  if (error) throw error
  return data // จำนวนคอร์สที่ถูกปิด
}

// ผู้สอนประจำคอร์ส (รับ array ของชื่อ)
export async function setCourseInstructors(courseId, names) {
  const { error } = await supabase.rpc("set_course_instructors", {
    p_course_id: courseId, p_names: names,
  })
  if (error) throw error
}

// รายชื่อผู้สมัครในคอร์ส (สำหรับดู + export CSV + หน้านำเข้าผู้สมัคร)
// ⚠️ ต้องดึง participant_code + email + national_id ด้วย (หน้านำเข้าใช้แสดงรหัส)
export async function fetchCourseParticipants(courseId) {
  const { data, error } = await supabase
    .from("registrations")
    .select("id, status, submitter_email, seats_held, session_id, created_at, advisors(full_name,phone), participants(id,full_name,school,grade_level,phone,email,national_id,participant_code,checkins(id,scanned_at))")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data || []
}

// ===== จัดการผู้ใช้งาน (แอดมิน) =====

export async function isSuperAdmin() {
  const { data, error } = await supabase.rpc("is_super_admin")
  if (error) return false
  return data === true
}

export async function listAdmins() {
  const { data, error } = await supabase.rpc("list_admins")
  if (error) throw error
  return data || []
}

export async function addAdmin(email, role) {
  const { data, error } = await supabase.rpc("add_admin", {
    p_email: email, p_role: role || "staff",
  })
  if (error) throw error
  return data
}

export async function removeAdmin(adminId) {
  const { error } = await supabase.rpc("remove_admin", { p_admin_id: adminId })
  if (error) throw error
}

// ===== ตั้งค่าเว็บ (ข้อมูลติดต่อ) =====

export async function fetchSettings() {
  const { data, error } = await supabase.from("site_settings").select("key, value")
  if (error) throw error
  // แปลงเป็น object { key: value }
  const obj = {}
  ;(data || []).forEach((r) => { obj[r.key] = r.value })
  return obj
}

export async function updateSettings(settings) {
  const { error } = await supabase.rpc("update_settings", { p_settings: settings })
  if (error) throw error
}

// ตั้งค่าแยกตามงาน (site_title, home_notice)
export async function fetchEventSettings(eventId) {
  if (!eventId) return {}
  try {
    const { data, error } = await supabase.rpc("get_event_settings", { p_event_id: eventId })
    if (error) return {}   // ถ้า RPC ยังไม่ได้รัน SQL (404) → คืนค่าว่าง ไม่พังทั้งหน้า
    return data || {}
  } catch (_) { return {} }
}
export async function updateEventSettings(eventId, settings) {
  const { error } = await supabase.rpc("update_event_settings", { p_event_id: eventId, p_settings: settings })
  if (error) throw error
}

// ค้นหาโรงเรียนสำหรับ autocomplete (คืนสูงสุด 10)
export async function searchSchools(query) {
  if (!query || query.trim().length < 1) return []
  const { data, error } = await supabase.rpc("search_schools", { p_query: query.trim() })
  if (error) throw error
  return (data || []).map((r) => r.name)
}

// โหลดรายชื่อโรงเรียนทั้งหมดครั้งเดียว (filter ฝั่ง client — เร็วกว่ายิง DB ทุกตัวอักษร)
export async function fetchAllSchools() {
  const { data, error } = await supabase.from("schools").select("name").order("name")
  if (error) return []
  return (data || []).map((r) => r.name)
}

// ข้อ 12: ค้นหาที่อยู่ไทย (ตำบล→อำเภอ/จังหวัด/รหัสไปรษณีย์) แบบ browser-safe
// โหลดข้อมูลจาก CDN ครั้งเดียว เก็บใน memory (ไม่ใช้ package ที่พึ่ง Node)
let _thaiAddrCache = null
let _thaiAddrLoading = null

// แหล่งข้อมูลที่อยู่ไทย (ลองตามลำดับ ถ้าตัวแรกล้มไปตัวถัดไป)
const THAI_ADDR_SOURCES = [
  "https://raw.githubusercontent.com/kongvut/thai-province-data/master/api/v1/province_with_amphure_tambon.json",
  "https://cdn.jsdelivr.net/gh/kongvut/thai-province-data@master/api/v1/province_with_amphure_tambon.json",
  "https://cdn.jsdelivr.net/gh/kongvut/thai-province-data/api/v1/province_with_amphure_tambon.json",
]

function flattenThaiAddr(provinces) {
  const flat = []
  for (const p of (provinces || [])) {
    for (const a of (p.amphure || [])) {
      for (const t of (a.tambon || [])) {
        flat.push({
          subDistrict: t.name_th, district: a.name_th, province: p.name_th,
          postalCode: String(t.zip_code || t.zipcode || ""),
        })
      }
    }
  }
  return flat
}

async function loadThaiAddrData() {
  if (_thaiAddrCache) return _thaiAddrCache
  if (_thaiAddrLoading) return _thaiAddrLoading
  _thaiAddrLoading = (async () => {
    for (const url of THAI_ADDR_SOURCES) {
      try {
        const r = await fetch(url)
        if (!r.ok) continue
        const json = await r.json()
        const flat = flattenThaiAddr(json)
        if (flat.length > 0) { _thaiAddrCache = flat; return flat }
      } catch (_) { /* ลอง URL ถัดไป */ }
    }
    _thaiAddrCache = []
    return []
  })()
  return _thaiAddrLoading
}

export async function searchThaiAddress(query) {
  if (!query || query.trim().length < 2) return []
  const q = query.trim()
  const data = await loadThaiAddrData()
  return data.filter((a) => a.subDistrict.includes(q)).slice(0, 10)
}

// ===== นำเข้าผู้สมัครจากระบบนอก =====

// import ผู้สมัครจากระบบนอก (เช็คอินอย่างเดียว — ไม่กินที่นั่ง)
export async function importExternalParticipant(courseId, row) {
  const { data, error } = await supabase.rpc("import_external_participant", {
    p_course_id: courseId,
    p_full_name: row.full_name,
    p_school: row.school || null,
    p_grade: row.grade_level || null,
    p_phone: row.phone || null,
    p_email: row.email || null,
    p_national_id: row.national_id || null,
  })
  if (error) throw error
  return data
}

// ลบผู้สมัครที่นำเข้า — รายคน
export async function deleteImportedParticipant(participantId) {
  const { data, error } = await supabase.rpc("delete_imported_participant", {
    p_participant_id: participantId,
  })
  if (error) throw error
  return data
}

// ลบผู้สมัครที่นำเข้า — ทั้งคอร์ส (คืนจำนวนที่ลบ)
export async function deleteImportedByCourse(courseId) {
  const { data, error } = await supabase.rpc("delete_imported_by_course", {
    p_course_id: courseId,
  })
  if (error) throw error
  return data
}

// สมัครผ่านลิงก์นอก — user กด "ฉันสมัครแล้ว" → สร้าง record รอพิจารณา
export async function registerExternal(courseId) {
  const { data, error } = await supabase.rpc("register_external", {
    p_course_id: courseId,
  })
  if (error) throw error
  return data // { registration_id, duplicate }
}

// ═══════════════════════════════════════════════════════════════════
// Certificate (เกียรติบัตร) — ดึงคน check-in + จัดการเทมเพลต/รางวัล
// เทมเพลต + รายการรางวัล เก็บใน event_settings (jsonb) ไม่ต้องแก้ schema
// ═══════════════════════════════════════════════════════════════════

// ดึงคนที่ "check-in แล้ว" ในคอร์ส (สำหรับออกเกียรติบัตร)
// คืน participant + ชื่อคอร์ส + หมวด — เฉพาะคนที่มี checkin record
export async function fetchCertificateRecipients(courseId) {
  const { data, error } = await supabase
    .from("registrations")
    .select("id, status, theme_name, course_id, courses!inner(title, event_id, course_types:type_id(label)), participants(id, full_name, school, grade_level, award, cert_published, checkins(id, scanned_at))")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
  if (error) throw error
  // แตก participant ออกมาเป็นรายคน — เฉพาะคนที่ check-in แล้ว
  const recipients = []
  for (const reg of data || []) {
    const course = reg.courses
    for (const p of reg.participants || []) {
      const checkedIn = (p.checkins || []).length > 0
      if (!checkedIn) continue
      recipients.push({
        participant_id: p.id,
        registration_id: reg.id,
        full_name: p.full_name || "",
        award: p.award || "",
        cert_published: !!p.cert_published,
        school: p.school || "",
        grade_level: p.grade_level || "",
        theme_name: reg.theme_name || "",
        course_title: course?.title || "",
        category: course?.course_types?.label || "",
      })
    }
  }
  return recipients
}

// อัปโหลดรูปพื้นหลังเกียรติบัตร → คืน public URL
export async function uploadCertificateTemplate(file) {
  return uploadCourseAsset(file, "certificates")
}

// ═══════════════════════════════════════════════════════════════════
// Session (รอบ) — จัดการโควตาแยกรอบ โดยไม่แตะ hold_seat RPC เดิม
// ═══════════════════════════════════════════════════════════════════

// บันทึกว่า registration นี้เลือกรอบไหน + เพิ่ม taken ของรอบนั้น
// เรียกหลัง holdSeat สำเร็จ (ถ้าคอร์สมีรอบ)
export async function assignSession(courseId, registrationId, sessionId, seats) {
  // ใช้ RPC (SECURITY DEFINER) ข้าม RLS — user update registrations/courses ตรงๆ ไม่ได้
  const { data, error } = await supabase.rpc("assign_session", {
    p_course_id: courseId,
    p_registration_id: registrationId,
    p_session_id: sessionId,
    p_seats: seats,
  })
  if (error) throw error
  return data
}

// ดึง sessions ล่าสุดของคอร์ส (เช็คโควตารอบก่อนสมัคร)
export async function fetchCourseSessions(courseId) {
  const { data, error } = await supabase
    .from("courses").select("sessions").eq("id", courseId).single()
  if (error) throw error
  return data?.sessions || []
}

// อ่าน status จริงของ registration (ใช้เช็คว่า hold_seat ตั้ง waitlist ไหม)
export async function fetchMyRegistrationStatus(registrationId) {
  const { data, error } = await supabase
    .from("registrations").select("status").eq("id", registrationId).single()
  if (error) throw error
  return data?.status || null
}

// ═══════════════════════════════════════════════════════════════════
// เกียรติบัตร — บันทึก/ดึงผลรางวัล (เก็บที่ participants.award)
// ═══════════════════════════════════════════════════════════════════

// บันทึกรางวัลของผู้รับหลายคน — assignments = [{participant_id, award}]
export async function saveCertAwards(assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return
  // อัปเดตทีละคน (Supabase ไม่มี bulk update ต่างค่า) — Promise.all ให้เร็ว
  const results = await Promise.all(
    assignments.map((a) =>
      supabase.from("participants").update({ award: a.award }).eq("id", a.participant_id)
    )
  )
  const err = results.find((r) => r.error)
  if (err?.error) throw err.error
}

// แจกเกียรติบัตร (mark cert_published = true) ให้ผู้รับที่ระบุ
export async function publishCertificates(participantIds) {
  if (!Array.isArray(participantIds) || !participantIds.length) return
  const { error } = await supabase
    .from("participants").update({ cert_published: true }).in("id", participantIds)
  if (error) throw error
}

// บันทึกแบบสอบถาม (PDPA + เคยร่วมกิจกรรม + ประชาสัมพันธ์) — ตอบครั้งเดียว
export async function saveSurvey(survey) {
  const { error } = await supabase.rpc("save_survey", { p: survey })
  if (error) throw error
}

// ตั้งรหัสผ่านใหม่ (หลังกดลิงก์รีเซ็ตจากอีเมล)
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// ═══ เฟส 1: นำเข้า user (โปรไฟล์ล่วงหน้า) ═══
// admin import users (batch) → เก็บลง pending_profiles (match ด้วย email)
// user กด Google login ด้วย email เดียวกัน → claim_pending_profile() ดึงมาเป็น profile จริง
// (ไม่ใช้ Edge Function แล้ว — insert ตรงผ่าน RLS ที่อนุญาตเฉพาะ admin)
export async function importUsersBatch(users) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("ยังไม่ได้ login")

  // ฟิลด์ที่ตรงกับตาราง pending_profiles เท่านั้น (กันคอลัมน์แปลกปลอม)
  const ALLOWED = [
    "email", "nationality", "national_id", "passport_no", "title",
    "first_name", "last_name", "nickname", "age", "grade_level", "school",
    "phone", "line_id", "parent_title", "parent_full_name",
    "parent_relationship", "parent_phone", "address", "subdistrict",
    "district", "province", "zipcode", "pdpa_consent",
  ]

  const rows = []
  const errors = []
  const seen = new Set()

  for (const u of users) {
    const email = String(u.email || "").trim().toLowerCase()
    if (!email) { errors.push("ไม่มีอีเมล"); continue }
    if (seen.has(email)) { continue }   // กันซ้ำในไฟล์เดียวกัน
    seen.add(email)

    const row = {}
    for (const k of ALLOWED) {
      if (u[k] !== undefined && u[k] !== "") row[k] = u[k]
    }
    row.email = email
    if (row.age !== undefined) {
      const n = parseInt(row.age, 10)
      row.age = Number.isNaN(n) ? null : n
    }
    if (row.pdpa_consent !== undefined) {
      row.pdpa_consent = row.pdpa_consent === true || row.pdpa_consent === "true" || row.pdpa_consent === "1"
    }
    rows.push(row)
  }

  if (rows.length === 0) {
    return { ok: 0, fail: errors.length, errors }
  }

  // upsert เข้า pending_profiles (email เป็น primary key → นำเข้าซ้ำได้ทับของเดิม)
  const { error } = await supabase
    .from("pending_profiles")
    .upsert(rows, { onConflict: "email" })

  if (error) throw new Error(error.message)

  return { ok: rows.length, fail: errors.length, errors }
}

// user เรียกหลัง login ครั้งแรก — ดึง pending profile มาผูก (ถ้ามี)
export async function claimPendingProfile() {
  const { data, error } = await supabase.rpc("claim_pending_profile")
  if (error) return false
  return data === true
}