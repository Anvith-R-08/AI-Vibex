import { createClient } from '@supabase/supabase-js'

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

const today = () => new Date().toLocaleDateString('en-CA')
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

// ---------- auth ----------
export const getProfile = async id =>
  (await sb.from('profiles').select('*').eq('id', id).single()).data
export const signUp = f => sb.auth.signUp({
  email: f.email, password: f.pw,
  options: { data: { full_name: f.name, roll_no: f.roll, phone: f.phone } }
})
export async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  return getProfile(data.user.id)
}
export const logout = () => sb.auth.signOut()

// ---------- student ----------
export const getMenu = () => sb.from('menu_items').select('*').order('category').order('name')
export const getSlots = () => sb.from('slot_availability').select('*')
  .eq('slot_date', today()).order('slot_time')
export const placeOrder = (cart, slotId) => sb.rpc('place_order', {
  p_items: Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty })),
  p_slot_id: slotId || null
})
export const myOrders = () => sb.from('orders')
  .select('*, order_items(*), pickup_slots(slot_time)')
  .order('created_at', { ascending: false })

// ---------- kitchen / admin ----------
export const kitchenOrders = () => sb.from('orders')
  .select('*, order_items(*), pickup_slots(slot_time), profiles(full_name)')
  .gte('created_at', startOfToday())
  .order('created_at', { ascending: false })
export const advanceOrder = id => sb.rpc('advance_order', { p_order: id })

export const updateItem = (id, patch) => sb.from('menu_items').update(patch).eq('id', id)
export const addItem = item => sb.from('menu_items').insert(item)
export const deleteItem = id => sb.from('menu_items').delete().eq('id', id)
export const addSlot = (time, capacity) => sb.from('pickup_slots').insert({ slot_time: time, capacity })
export const updateSlot = (id, patch) => sb.from('pickup_slots').update(patch).eq('id', id)
export const deleteSlot = id => sb.from('pickup_slots').delete().eq('id', id)

// ---------- live updates ----------
export const watchOrders = cb => sb
  .channel('orders-' + Math.random().toString(36).slice(2))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cb)
  .subscribe()
