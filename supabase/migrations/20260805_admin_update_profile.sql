-- ═══════════════════════════════════════════════════════════════════
-- แก้บั๊ก: แอดมินแก้ชื่อนักเรียนแล้วกดบันทึก → ค่าเด้งกลับเป็นชื่อเดิม
--
-- วิธีใช้: ก๊อปทั้งไฟล์ไปวางใน Supabase → SQL Editor → Run
--
-- สาเหตุ:
--   หน้า "แก้ไขข้อมูลนักเรียน" (AdminStudents) สั่ง UPDATE ตรงบนตาราง profiles
--   แต่ RLS ของ profiles อนุญาตให้แก้ได้เฉพาะแถวของตัวเอง (auth.uid() = id)
--   พอแอดมินแก้แถวคนอื่น → เงื่อนไข RLS ไม่ match แถวไหนเลย
--   PostgREST ถือว่า "อัปเดต 0 แถว" ซึ่ง**ไม่ใช่ error** → หน้าเว็บขึ้น "บันทึกข้อมูลแล้ว"
--   แต่ DB ไม่เปลี่ยน พอโหลดใหม่จึงเห็นชื่อเดิม
--
-- สิ่งที่ไฟล์นี้ทำ:
--   เพิ่ม policy ให้บัญชีที่เป็นแอดมิน (ผ่านฟังก์ชัน is_admin() ที่มีอยู่แล้ว)
--   UPDATE แถวใน profiles ได้ — ไม่แตะ policy เดิมของผู้ใช้ทั่วไป
--
-- ปลอดภัย: เป็นการ "เพิ่ม" policy ใหม่เท่านั้น policy เดิมทั้งหมดยังอยู่ครบ
--          ถ้าไม่รัน เว็บไม่พัง — แต่หน้าแก้ข้อมูลจะขึ้น error ชัดเจนแทนที่จะเงียบ
-- ═══════════════════════════════════════════════════════════════════

-- ── ตรวจก่อน: ดู policy ที่มีอยู่ตอนนี้ของตาราง profiles ──
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'profiles';

-- ── เพิ่ม policy ให้แอดมิน ──
drop policy if exists "admin can update any profile" on public.profiles;

create policy "admin can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())        -- แถวไหนที่แอดมินมองเห็น/แก้ได้
  with check (public.is_admin());  -- ค่าใหม่ที่เขียนลงไปก็ต้องผ่านเงื่อนไขเดียวกัน

-- ── ตรวจผลหลังรัน ──
-- 1) ล็อกอินเป็นแอดมิน เปิดหน้า "จัดการนักเรียน" → แก้ชื่อ → บันทึก → รีเฟรช ต้องเห็นชื่อใหม่
-- 2) ถ้ายังเด้งกลับ ให้รันคำสั่งด้านล่างแล้วส่งผลมาดู (อาจมี policy เดิมที่ RESTRICTIVE ค้างอยู่):
--      select policyname, permissive, cmd, qual, with_check from pg_policies
--        where schemaname = 'public' and tablename = 'profiles';
-- ═══════════════════════════════════════════════════════════════════
