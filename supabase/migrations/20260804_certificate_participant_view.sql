-- ═══════════════════════════════════════════════════════════════════
-- เกียรติบัตรฝั่งผู้สมัคร — RPC my_certificates()
--
-- วิธีใช้: ก๊อปทั้งไฟล์ไปวางใน Supabase → SQL Editor → Run
--
-- ทำอะไร:
--   สร้างฟังก์ชันใหม่ my_certificates() คืนเกียรติบัตรที่แอดมิน "ส่ง" แล้ว
--   (participants.cert_published = true) เฉพาะใบสมัครของผู้ใช้ที่ล็อกอินอยู่
--   → หน้า "รายการสมัครของฉัน" เอาไปโชว์ปุ่มดูเกียรติบัตร (แบบเดียวกับบาร์โค้ด)
--
-- ปลอดภัย: เป็นการ CREATE ฟังก์ชันใหม่ล้วนๆ ไม่แตะ/ไม่แก้ฟังก์ชันหรือตารางเดิม
--          ถ้ายังไม่รันไฟล์นี้ เว็บก็ยังทำงานปกติ แค่ไม่มีเกียรติบัตรให้ผู้สมัครดู
--
-- เงื่อนไขที่ใช้ (ตรงกับฝั่งแอดมิน):
--   1. ใบสมัคร status ∈ ('confirmed','approved')
--   2. ผู้เข้าร่วมคนนั้นต้องเช็คอินแล้ว (มีแถวใน checkins)
--   3. แอดมินกด "ส่งเกียรติบัตร" แล้ว (cert_published = true)
--   คนเดียวสมัครหลายรายการ → ได้เกียรติบัตรแยกตามรายการ (participant ผูกกับใบสมัคร)
-- ═══════════════════════════════════════════════════════════════════

-- ── ก่อนรัน: ตรวจว่าคอลัมน์ที่ใช้มีจริง ──────────────────────────────
-- ถ้าไม่แน่ใจว่า participants มีคอลัมน์ award / cert_published แล้วหรือยัง
-- ให้รัน 2 บรรทัดนี้ก่อน (รันซ้ำได้ ไม่พังถ้ามีอยู่แล้ว):
alter table public.participants add column if not exists award text;
alter table public.participants add column if not exists cert_published boolean not null default false;

-- ── ฟังก์ชันหลัก ────────────────────────────────────────────────────
drop function if exists public.my_certificates();

create function public.my_certificates()
returns table (
  participant_id   text,
  registration_id  uuid,
  full_name        text,
  award            text,
  course_id        uuid,
  course_title     text,
  event_id         uuid,
  theme_name       text,
  kind             text
)
language sql
security definer
set search_path = public
as $$
  -- ผู้เข้าร่วม (รวมสมาชิกในทีมทุกคน) — ต้องเช็คอินเองและถูก publish แล้ว
  select
    p.id::text          as participant_id,
    r.id                as registration_id,
    p.full_name         as full_name,
    coalesce(p.award, '') as award,
    c.id                as course_id,
    c.title             as course_title,
    c.event_id          as event_id,
    coalesce(r.theme_name, '') as theme_name,
    'participant'::text as kind
  from participants p
  join registrations r on r.id = p.registration_id
  join courses c       on c.id = r.course_id
  where p.cert_published is true
    and r.status in ('confirmed', 'approved')
    and lower(r.submitter_email) = lower(auth.email())
    and exists (select 1 from checkins ck where ck.participant_id = p.id)

  union all

  -- ครูที่ปรึกษา — ไม่มีรหัสเช็คอินของตัวเอง จึงยึดจากลูกทีม:
  -- ต้องมีสมาชิกในใบสมัครเดียวกันที่เช็คอินแล้วและถูก publish แล้วอย่างน้อย 1 คน
  select
    ('adv:' || a.id::text) as participant_id,
    r.id                   as registration_id,
    a.full_name            as full_name,
    'ครูที่ปรึกษา'::text     as award,
    c.id                   as course_id,
    c.title                as course_title,
    c.event_id             as event_id,
    coalesce(r.theme_name, '') as theme_name,
    'advisor'::text        as kind
  from advisors a
  join registrations r on r.id = a.registration_id
  join courses c       on c.id = r.course_id
  where r.status in ('confirmed', 'approved')
    and lower(r.submitter_email) = lower(auth.email())
    and coalesce(nullif(trim(a.full_name), ''), '') <> ''
    and exists (
      select 1 from participants p2
      where p2.registration_id = r.id
        and p2.cert_published is true
        and exists (select 1 from checkins ck2 where ck2.participant_id = p2.id)
    );
$$;

-- ให้เฉพาะผู้ใช้ที่ล็อกอินเรียกได้ (ฟังก์ชันกรองด้วย auth.email() ในตัวอยู่แล้ว)
revoke all on function public.my_certificates() from public, anon;
grant execute on function public.my_certificates() to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- หมายเหตุ: รูปพื้นหลัง + ตำแหน่งข้อความ อ่านผ่าน get_event_settings()
-- ซึ่งหน้าแรก/หน้าล็อกอินเรียกอยู่แล้ว (เปิดให้ anon อ่านได้) → ไม่ต้องแก้เพิ่ม
--
-- ตรวจผลหลังรัน (ล็อกอินเป็นผู้ใช้ที่มีเกียรติบัตรแล้วลอง):
--   select * from public.my_certificates();
-- ═══════════════════════════════════════════════════════════════════
