-- ═══════════════════════════════════════════════════════════════════
-- สรุปแบบสอบถามตอนสมัคร (หน้า register/profile) ไปโชว์ใน Dashboard
--
-- วิธีใช้: ก๊อปทั้งไฟล์ไปวางใน Supabase → SQL Editor → Run
--
-- ทำอะไร:
--   สร้าง RPC ใหม่ dashboard_signup_survey(p_event_id) สรุปคำตอบแบบสอบถาม
--   ที่ผู้สมัครกรอกตอนทำโปรไฟล์ (PDPA / เคยร่วมกิจกรรม / รู้จักจากช่องทางไหน)
--   นับเฉพาะคนที่มีใบสมัครในงานนั้น และนับคนละครั้งเดียว (สมัครหลายวิชาไม่นับซ้ำ)
--
-- ปลอดภัย: CREATE ฟังก์ชันใหม่ล้วนๆ ไม่แตะตาราง/ฟังก์ชันเดิม
--          ถ้ายังไม่รัน หน้า Dashboard ก็ยังทำงานปกติ แค่ไม่มีการ์ดสรุปแบบสอบถาม
--
-- คืนค่า: (kind, label, cnt)
--   kind = 'activity'       → ตัวเลือก "เคยร่วมกิจกรรม"
--        = 'activity_other'  → ข้อความที่พิมพ์เองในช่องอื่นๆ
--        = 'pr'              → ตัวเลือก "รู้จักจากช่องทาง"
--        = 'pr_other'        → ข้อความที่พิมพ์เองในช่องอื่นๆ
--        = 'pdpa'            → ยินยอม / ไม่ยินยอม / ยังไม่ตอบ
--        = 'total'           → จำนวนคนที่ตอบแบบสอบถามครบแล้ว
-- ═══════════════════════════════════════════════════════════════════

-- ── ก่อนรัน: ตรวจว่าคอลัมน์ที่ใช้มีจริงบน profiles ──
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--     and column_name in ('pdpa_consent','past_activities','past_activities_other',
--                         'pr_channels','pr_channels_other','survey_done');
-- ควรได้ครบ 6 แถว — ถ้าขาดตัวไหน บอกมาก่อน อย่าเพิ่งรันส่วนล่าง

drop function if exists public.dashboard_signup_survey(uuid);

create function public.dashboard_signup_survey(p_event_id uuid)
returns table (kind text, label text, cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    -- โปรไฟล์ของคนที่มีใบสมัครในงานนี้ — distinct กันคนสมัครหลายวิชาถูกนับซ้ำ
    select distinct
      pr.id, pr.pdpa_consent, pr.past_activities, pr.past_activities_other,
      pr.pr_channels, pr.pr_channels_other, pr.survey_done
    from profiles pr
    join auth.users u    on u.id = pr.id
    join registrations r on lower(r.submitter_email) = lower(u.email)
    where r.event_id = p_event_id
      and is_admin()          -- กันไม่ให้ user ทั่วไปดึงสรุปทั้งงาน
  ),
  arr as (
    -- to_jsonb รองรับทั้งคอลัมน์ชนิด jsonb และ text[] · ไม่ใช่ array → มองเป็นว่าง
    select
      p.id,
      case when jsonb_typeof(to_jsonb(p.past_activities)) = 'array'
           then to_jsonb(p.past_activities) else '[]'::jsonb end as acts,
      case when jsonb_typeof(to_jsonb(p.pr_channels)) = 'array'
           then to_jsonb(p.pr_channels) else '[]'::jsonb end as prs
    from people p
  )
  select 'activity'::text, x.v, count(distinct a.id)::bigint
    from arr a, lateral jsonb_array_elements_text(a.acts) as x(v)
   where nullif(trim(x.v), '') is not null
   group by x.v

  union all
  select 'pr'::text, x.v, count(distinct a.id)::bigint
    from arr a, lateral jsonb_array_elements_text(a.prs) as x(v)
   where nullif(trim(x.v), '') is not null
   group by x.v

  union all
  select 'activity_other'::text, trim(p.past_activities_other), count(*)::bigint
    from people p
   where nullif(trim(p.past_activities_other), '') is not null
   group by trim(p.past_activities_other)

  union all
  select 'pr_other'::text, trim(p.pr_channels_other), count(*)::bigint
    from people p
   where nullif(trim(p.pr_channels_other), '') is not null
   group by trim(p.pr_channels_other)

  union all
  select 'pdpa'::text,
         case when p.pdpa_consent is true  then 'ยินยอม'
              when p.pdpa_consent is false then 'ไม่ยินยอม'
              else 'ยังไม่ตอบ' end,
         count(*)::bigint
    from people p
   group by 2

  union all
  select 'total'::text, 'ตอบแบบสอบถามแล้ว'::text, count(*)::bigint
    from people p
   where p.survey_done is true

  union all
  select 'total'::text, 'ผู้สมัครในงานนี้'::text, count(*)::bigint
    from people p;
$$;

revoke all on function public.dashboard_signup_survey(uuid) from public, anon;
grant execute on function public.dashboard_signup_survey(uuid) to authenticated;

-- ── ตรวจผลหลังรัน (แทน uuid ของงาน) ──
-- select * from public.dashboard_signup_survey('วาง-event-uuid') order by kind, cnt desc;
