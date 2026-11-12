-- Run this whole file once in Supabase -> SQL Editor -> New query -> Run

-- 1) LOAD-BALANCED pickup slot allocation
--    Picks the slot with the fewest items already booked (ties -> earliest time),
--    so orders spread out instead of piling into 12:00.
create or replace function place_order(p_items jsonb, p_slot_id uuid default null)
returns orders language plpgsql security definer set search_path = public as $$
declare v_slot pickup_slots; v_total numeric; v_n int; v_order orders;
begin
  if app_role() is distinct from 'student' then raise exception 'Only students can place orders'; end if;
  perform pg_advisory_xact_lock(42);

  select count(*), coalesce(sum(m.price * x.qty), 0) into v_n, v_total
  from (select (e->>'item_id')::uuid id, (e->>'qty')::int qty from jsonb_array_elements(p_items) e) x
  join menu_items m on m.id = x.id and m.available and x.qty between 1 and 20;
  if v_n = 0 or v_n <> jsonb_array_length(p_items) then
    raise exception 'Some items are unavailable'; end if;

  select s.* into v_slot from pickup_slots s
  where s.slot_date = current_date and (p_slot_id is null or s.id = p_slot_id)
    and (select count(*) from orders o where o.slot_id = s.id) < s.capacity
  order by (select coalesce(sum(oi.qty), 0) from orders o
            join order_items oi on oi.order_id = o.id where o.slot_id = s.id),
           s.slot_time
  limit 1;
  if v_slot.id is null then raise exception 'No pickup slot available'; end if;

  insert into orders (token, student_id, slot_id, total)
  values ('KH-' || nextval('token_seq'), auth.uid(), v_slot.id, v_total)
  returning * into v_order;

  insert into order_items (order_id, item_id, name, unit_price, qty)
  select v_order.id, m.id, m.name, m.price, x.qty
  from (select (e->>'item_id')::uuid id, (e->>'qty')::int qty from jsonb_array_elements(p_items) e) x
  join menu_items m on m.id = x.id;
  return v_order;
end $$;

-- 2) Make sure today has pickup slots (safe to re-run)
insert into pickup_slots (slot_time, capacity)
select t::time, 4 from unnest(array['12:00','12:15','12:30','12:45','13:00','13:15']) as t
on conflict (slot_date, slot_time) do nothing;

-- 3) Live updates for the kitchen board (safe to re-run)
do $$ begin
  alter publication supabase_realtime add table orders;
exception when others then null;
end $$;

-- 4) STAFF ACCOUNTS
--    First create the users in Supabase -> Authentication -> Users -> Add user
--    (tick "Auto Confirm User"), then run these with your real emails:
-- update profiles set role = 'admin'   where email = 'admin@kitchenhouse.edu';
-- update profiles set role = 'kitchen' where email = 'kitchen@kitchenhouse.edu';
