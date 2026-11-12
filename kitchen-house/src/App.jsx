import { useEffect, useState } from 'react'
import * as api from './api'

const STAGES = ['Placed', 'Accepted', 'Preparing', 'Ready', 'Completed']
const NEXT = { Placed: 'Accept order', Accepted: 'Start preparing', Preparing: 'Mark ready', Ready: 'Complete pickup' }
const EMOJI = { Breakfast: '🥞', Meals: '🍛', Snacks: '🥪', Drinks: '🥤', Desserts: '🍰' }
const hhmm = t => (t || '').slice(0, 5)
const money = n => '₹' + Number(n)

/* ------------------------------------------------------------------ */
/* Plain-language ordering: "2 masala dosa and a cold coffee"          */
/* ------------------------------------------------------------------ */
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const FILLER = new Set(['i', 'want', 'wanna', 'need', 'like', 'would', 'give', 'me', 'get', 'order', 'please',
  'can', 'have', 'to', 'of', 'some', 'the', 'my', 'for', 'also', 'add', 'with', 'x', 'pls', 'bring', 'us'])
const SYN = { tea: 'chai', cha: 'chai', lemonade: 'lime', nimbu: 'lime', cola: 'coffee', meal: 'thali', rice: 'biryani' }
const stem = w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
const same = (a, b) => a === b || (a.length > 3 && lev(a, b) <= 1) || (a.length > 6 && lev(a, b) <= 2)

function matchItem(words, menu) {
  let best = null
  for (const m of menu) {
    const toks = m.name.toLowerCase().split(/\s+/).map(stem)
    const hits = toks.filter(t => words.some(w => same(w, t))).length
    const score = hits / toks.length
    if (score >= 0.5 && (!best || score > best.score || (score === best.score && hits > best.hits)))
      best = { m, score, hits }
  }
  return best && best.m
}

function parseOrder(text, menu) {
  const avail = menu.filter(m => m.available)
  const merged = {}
  const missed = []
  const chunks = text.toLowerCase().split(/,|\+|&|;|\n|\band\b|\bplus\b|\bthen\b/).map(s => s.trim()).filter(Boolean)
  for (const ch of chunks) {
    let qty = 1
    const words = []
    for (const raw of ch.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)) {
      let m
      if ((m = raw.match(/^(\d+)x?$/)) || (m = raw.match(/^x(\d+)$/))) qty = +m[1]
      else if (NUM[raw]) qty = NUM[raw]
      else if (!FILLER.has(raw)) words.push(stem(SYN[raw] || raw))
    }
    if (!words.length) continue
    qty = Math.max(1, Math.min(20, qty))
    const item = matchItem(words, avail)
    if (!item) { missed.push(ch); continue }
    merged[item.id] = { item, qty: Math.min(20, (merged[item.id]?.qty || 0) + qty) }
  }
  return { lines: Object.values(merged), missed }
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */
function Field({ label, err, ...p }) {
  return <div><label>{label}</label><input {...p} />{err && <div className="err">{err}</div>}</div>
}
function Tabs({ tabs, v, set }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t[0]} role="tab" aria-selected={v === t[0]}
          className={'tab' + (v === t[0] ? ' on' : '')} onClick={() => set(t[0])}>{t[1]}</button>
      ))}
    </div>
  )
}
function Header({ title, sub, live }) {
  return (
    <div className="top">
      <div><h2>{title}</h2><span className="muted">{sub}</span></div>
      {live && <span className="pill Ready">● Live</span>}
    </div>
  )
}
function Stepper({ status }) {
  const i = STAGES.indexOf(status)
  return <div className="track">{STAGES.map((s, k) => <div key={s} className={k <= i ? 'd' : ''}>{s}</div>)}</div>
}

/* ------------------------------------------------------------------ */
/* Login / Register                                                    */
/* ------------------------------------------------------------------ */
function Auth({ mode, setMode, onDone, say }) {
  const reg = mode === 'register'
  const [f, setF] = useState({ name: '', roll: '', email: '', phone: '', pw: '', pw2: '' })
  const [e, setE] = useState({})
  const [busy, setBusy] = useState(false)
  const on = k => ev => setF({ ...f, [k]: ev.target.value })

  async function submit(ev) {
    ev.preventDefault()
    const x = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) x.email = 'Enter a valid email address.'
    if (f.pw.length < 6) x.pw = 'Password needs at least 6 characters.'
    if (reg) {
      if (f.name.trim().length < 2) x.name = 'Enter your full name.'
      if (!/^[A-Za-z0-9]{5,12}$/.test(f.roll)) x.roll = 'Roll number: 5–12 letters or digits.'
      if (!/^\d{10}$/.test(f.phone)) x.phone = 'Phone must be 10 digits.'
      if (f.pw !== f.pw2) x.pw2 = 'Passwords do not match.'
    }
    setE(x)
    if (Object.keys(x).length) return
    setBusy(true)
    try {
      if (reg) {
        const { data, error } = await api.signUp(f)
        if (error) throw error
        if (!data.session) { say('Account created. Check your email to confirm, then log in.'); setMode('login'); return }
        onDone(await api.getProfile(data.user.id))
      } else {
        const p = await api.login(f.email, f.pw)
        if (!p) throw new Error('No profile found for this account.')
        onDone(p)
      }
    } catch (err) { setE({ pw: err.message }) }
    setBusy(false)
  }

  return (
    <div className="wrap">
      <form className="card auth" onSubmit={submit} noValidate>
        <h2>{reg ? 'Student registration' : 'Log in'}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {reg ? 'Only students can sign up. Staff accounts are created by the admin.'
            : 'Students, kitchen staff and admins all log in here.'}
        </p>
        {reg && <>
          <Field label="Full name" value={f.name} onChange={on('name')} err={e.name} />
          <div className="two">
            <Field label="Roll number" value={f.roll} onChange={on('roll')} err={e.roll} />
            <Field label="Phone" value={f.phone} onChange={on('phone')} err={e.phone} inputMode="numeric" />
          </div>
        </>}
        <Field label="Email" type="email" value={f.email} onChange={on('email')} err={e.email} autoComplete="email" />
        <Field label="Password" type="password" value={f.pw} onChange={on('pw')} err={e.pw}
          autoComplete={reg ? 'new-password' : 'current-password'} />
        {reg && <Field label="Confirm password" type="password" value={f.pw2} onChange={on('pw2')} err={e.pw2} />}
        <button className="btn" disabled={busy} style={{ width: '100%', marginTop: 18 }}>
          {busy ? 'Please wait…' : reg ? 'Create account' : 'Log in'}
        </button>
        <p style={{ textAlign: 'center', marginBottom: 0 }}>
          {reg ? 'Have an account? ' : 'New student? '}
          <a href="#" style={{ color: 'var(--or2)', fontWeight: 700 }}
            onClick={ev => { ev.preventDefault(); setMode(reg ? 'login' : 'register') }}>
            {reg ? 'Log in' : 'Register'}
          </a>
        </p>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */
function Student({ profile, say }) {
  const [tab, setTab] = useState('menu')
  const [menu, setMenu] = useState([])
  const [slots, setSlots] = useState([])
  const [orders, setOrders] = useState([])
  const [cart, setCart] = useState({})
  const [slot, setSlot] = useState('auto')
  const [cat, setCat] = useState('All')
  const [nl, setNl] = useState('')
  const [parsed, setParsed] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadOrders = async () => setOrders((await api.myOrders()).data || [])
  const loadSlots = async () => setSlots((await api.getSlots()).data || [])

  useEffect(() => {
    api.getMenu().then(r => setMenu(r.data || []))
    loadSlots(); loadOrders()
    const ch = api.watchOrders(() => { loadOrders(); loadSlots() })
    return () => { api.sb.removeChannel(ch) }
  }, [])

  const cats = ['All', ...new Set(menu.map(m => m.category))]
  const list = menu.filter(m => cat === 'All' || m.category === cat)
  const lines = menu.filter(m => cart[m.id]).map(m => ({ ...m, q: cart[m.id] }))
  const total = lines.reduce((s, l) => s + l.q * Number(l.price), 0)
  const count = lines.reduce((s, l) => s + l.q, 0)
  const add = (id, d) => setCart(c => {
    const n = Math.min(20, (c[id] || 0) + d), x = { ...c }
    if (n <= 0) delete x[id]; else x[id] = n
    return x
  })

  function understand() {
    if (!nl.trim()) return
    setParsed(parseOrder(nl, menu))
  }
  function confirmParsed() {
    setCart(c => {
      const x = { ...c }
      parsed.lines.forEach(l => { x[l.item.id] = Math.min(20, (x[l.item.id] || 0) + l.qty) })
      return x
    })
    say('Added ' + parsed.lines.map(l => l.qty + '× ' + l.item.name).join(', '))
    setParsed(null); setNl(''); setTab('cart')
  }

  async function place() {
    setBusy(true)
    const { data, error } = await api.placeOrder(cart, slot === 'auto' ? null : slot)
    setBusy(false)
    if (error) return say(error.message)
    setCart({}); setSlot('auto'); setTab('orders')
    say('Order placed! Token ' + data.token)
    loadOrders(); loadSlots()
  }

  const tabs = [['menu', 'Menu'], ['cart', 'Cart (' + count + ')'], ['orders', 'My orders']]
  return (
    <div className="wrap">
      <Header title={'Hi, ' + profile.full_name.split(' ')[0] + ' 👋'} sub="What are you craving today?" />
      <Tabs tabs={tabs} v={tab} set={setTab} />

      {tab === 'menu' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Order in plain words ✨</b>
          <div className="oh" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
            <input value={nl} aria-label="Type your order"
              placeholder='e.g. "2 masala dosa and a cold coffee"'
              onChange={ev => setNl(ev.target.value)}
              onKeyDown={ev => { if (ev.key === 'Enter') understand() }} />
            <button className="btn" onClick={understand}>Go</button>
          </div>
          {parsed && (
            <div className="hint" style={{ marginTop: 12 }}>
              {parsed.lines.length > 0 && <>
                <b>Did you mean:</b>
                <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                  {parsed.lines.map(l => (
                    <li key={l.item.id}>{l.qty}× {l.item.emoji} {l.item.name} — {money(l.qty * Number(l.item.price))}</li>
                  ))}
                </ul>
              </>}
              {parsed.missed.length > 0 && (
                <div className="err">Could not find on the menu: {parsed.missed.join(', ')}</div>
              )}
              {!parsed.lines.length && !parsed.missed.length && <span>Type what you want, like “two chai and a samosa”.</span>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn sm" disabled={!parsed.lines.length} onClick={confirmParsed}>Add to cart</button>
                <button className="btn ghost sm" onClick={() => setParsed(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="tabs">{cats.map(c => (
          <button key={c} className={'tab' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}</div>
        <div className="grid">{list.map(m => (
          <div key={m.id} className={'card dish' + (m.available ? '' : ' off')}>
            <div className="art" style={{ background: '#FFE3C7' }}>{m.emoji}</div>
            <div className="in">
              <b>{m.name}</b><span className="muted" style={{ fontSize: 13 }}>{m.category}</span>
              <div className="row">
                <span className="price">{money(m.price)}</span>
                {m.available
                  ? <button className="btn sm" onClick={() => { add(m.id, 1); say(m.name + ' added') }}>Add</button>
                  : <span className="pill">Sold out</span>}
              </div>
            </div>
          </div>
        ))}</div>
      </>}

      {tab === 'cart' && (count ? (
        <div className="cols">
          <div className="list">{lines.map(l => (
            <div className="card oh" key={l.id}>
              <span style={{ fontSize: 34 }}>{l.emoji}</span>
              <b style={{ flex: 1 }}>{l.name}<br /><span className="muted" style={{ fontWeight: 400 }}>{money(l.price)} each</span></b>
              <span className="qty">
                <button aria-label="Less" onClick={() => add(l.id, -1)}>−</button>{l.q}
                <button aria-label="More" onClick={() => add(l.id, 1)}>+</button>
              </span>
              <b>{money(l.q * Number(l.price))}</b>
            </div>
          ))}</div>
          <div className="card">
            <h3>Pickup slot</h3>
            <label htmlFor="sl">Choose a time</label>
            <select id="sl" value={slot} onChange={ev => setSlot(ev.target.value)}>
              <option value="auto">Auto-assign least busy slot</option>
              {slots.map(s => (
                <option key={s.id} value={s.id} disabled={s.remaining <= 0}>
                  {hhmm(s.slot_time)} · {s.remaining > 0 ? s.remaining + ' left' + (s.remaining <= 1 ? ' (busy)' : '') : 'Full'}
                </option>
              ))}
            </select>
            <div className="oh" style={{ margin: '16px 0' }}>
              <span>Total</span><span className="price" style={{ fontSize: 26 }}>{money(total)}</span>
            </div>
            <button className="btn" disabled={busy} style={{ width: '100%' }} onClick={place}>
              {busy ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card"><h3>Your cart is empty</h3><p className="muted">Add something tasty from the menu.</p>
          <button className="btn" onClick={() => setTab('menu')}>Browse menu</button></div>
      ))}

      {tab === 'orders' && (orders.length ? (
        <div className="list">{orders.map(o => (
          <div className="card" key={o.id}>
            <div className="oh">
              <span className="token">{o.token}</span>
              <span className={'pill ' + o.status}>{o.status}</span>
              <span className="muted">Pickup {hhmm(o.pickup_slots?.slot_time)}</span>
            </div>
            <Stepper status={o.status} />
            <p style={{ margin: '8px 0 0' }}>
              {o.order_items.map(i => i.qty + '× ' + i.name).join(', ')} — <b>{money(o.total)}</b>
            </p>
          </div>
        ))}</div>
      ) : (
        <div className="card"><h3>No orders yet</h3><p className="muted">Your orders and tokens will show up here.</p></div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Kitchen: live board                                                 */
/* ------------------------------------------------------------------ */
function Kitchen({ say }) {
  const [orders, setOrders] = useState([])
  const [tab, setTab] = useState('new')
  const load = async () => setOrders((await api.kitchenOrders()).data || [])

  useEffect(() => {
    load()
    const ch = api.watchOrders(load)
    const poll = setInterval(load, 8000) // backup in case realtime is off
    return () => { api.sb.removeChannel(ch); clearInterval(poll) }
  }, [])

  const sel = {
    new: o => o.status === 'Placed',
    active: o => ['Accepted', 'Preparing', 'Ready'].includes(o.status),
    done: o => o.status === 'Completed'
  }
  const list = orders.filter(sel[tab]).sort((a, b) =>
    hhmm(a.pickup_slots?.slot_time).localeCompare(hhmm(b.pickup_slots?.slot_time)) ||
    a.created_at.localeCompare(b.created_at))

  async function adv(o) {
    const { error } = await api.advanceOrder(o.id)
    if (error) say(error.message); else { say(o.token + ' updated'); load() }
  }

  return (
    <div className="wrap">
      <Header title="Kitchen board" sub="Today's orders, sorted by pickup slot." live />
      <div className="stats">{[['New', 'new'], ['In progress', 'active'], ['Completed', 'done']].map(s => (
        <div className="card" key={s[1]}><b>{orders.filter(sel[s[1]]).length}</b>{s[0]}</div>
      ))}</div>
      <Tabs v={tab} set={setTab} tabs={[['new', 'Incoming'], ['active', 'In progress'], ['done', 'Completed']]} />
      {list.length ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {list.map(o => (
            <div className="card" key={o.id}>
              <div className="oh"><span className="token">{o.token}</span><span className={'pill ' + o.status}>{o.status}</span></div>
              <p style={{ margin: '10px 0 2px' }}>
                <b>{o.profiles?.full_name || 'Student'}</b><br />
                <span className="muted">Pickup {hhmm(o.pickup_slots?.slot_time)}</span>
              </p>
              <ul style={{ paddingLeft: 18, margin: '8px 0 12px' }}>
                {o.order_items.map(i => <li key={i.id}>{i.qty}× {i.name}</li>)}
              </ul>
              {NEXT[o.status] && (
                <button className="btn" style={{ width: '100%' }} onClick={() => adv(o)}>{NEXT[o.status]}</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card"><h3>Nothing here</h3><p className="muted">New orders appear the moment a student places them.</p></div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Admin / canteen manager                                             */
/* ------------------------------------------------------------------ */
function Admin({ say }) {
  const [tab, setTab] = useState('items')
  const [menu, setMenu] = useState([])
  const [orders, setOrders] = useState([])
  const [slots, setSlots] = useState([])
  const [n, setN] = useState({ name: '', price: '', category: 'Snacks' })
  const [ns, setNs] = useState('')

  const reload = async () => {
    setMenu((await api.getMenu()).data || [])
    setOrders((await api.kitchenOrders()).data || [])
    setSlots((await api.getSlots()).data || [])
  }
  useEffect(() => {
    reload()
    const ch = api.watchOrders(reload)
    return () => { api.sb.removeChannel(ch) }
  }, [])

  const run = async (promise, msg) => {
    const { error } = await promise
    if (error) say(error.message); else { if (msg) say(msg); reload() }
  }

  function addItem(ev) {
    ev.preventDefault()
    if (n.name.trim().length < 2 || !(+n.price > 0)) return say('Enter an item name and a price above 0.')
    run(api.addItem({ name: n.name.trim(), price: +n.price, category: n.category, emoji: EMOJI[n.category] }), 'Item added')
    setN({ name: '', price: '', category: 'Snacks' })
  }
  function addSlot(ev) {
    ev.preventDefault()
    if (!ns) return say('Pick a time first.')
    run(api.addSlot(ns, 4), 'Slot added'); setNs('')
  }

  const sales = orders.reduce((s, o) => s + Number(o.total), 0)
  const popular = Object.entries(
    orders.flatMap(o => o.order_items).reduce((m, i) => { m[i.name] = (m[i.name] || 0) + i.qty; return m }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="wrap">
      <Header title="Manager console" sub="Menu, orders and pickup slots." live />
      <div className="stats">{[[orders.length, 'Orders today'], [money(sales), 'Sales today'], [menu.length, 'Menu items'], [slots.length, 'Pickup slots']].map(s => (
        <div className="card" key={s[1]}><b>{s[0]}</b>{s[1]}</div>
      ))}</div>
      <Tabs v={tab} set={setTab} tabs={[['items', 'Food items'], ['orders', 'Orders'], ['slots', 'Pickup slots'], ['stats', 'Popular items']]} />

      {tab === 'items' && <>
        <form className="card" onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'end', marginBottom: 14 }}>
          <div><label>New item</label><input value={n.name} onChange={ev => setN({ ...n, name: ev.target.value })} /></div>
          <div><label>Price ₹</label><input type="number" value={n.price} onChange={ev => setN({ ...n, price: ev.target.value })} /></div>
          <div><label>Category</label>
            <select value={n.category} onChange={ev => setN({ ...n, category: ev.target.value })}>
              {Object.keys(EMOJI).map(c => <option key={c}>{c}</option>)}
            </select></div>
          <button className="btn">Add</button>
        </form>
        <div className="card tw"><table>
          <thead><tr><th>Item</th><th>Category</th><th>Price ₹</th><th>Status</th><th></th></tr></thead>
          <tbody>{menu.map(m => (
            <tr key={m.id}>
              <td>{m.emoji} {m.name}</td><td>{m.category}</td>
              <td><input style={{ width: 84 }} type="number" min="1" defaultValue={Number(m.price)} key={m.id + '-' + m.price}
                aria-label={'Price of ' + m.name}
                onBlur={ev => { const v = +ev.target.value; if (v > 0 && v !== Number(m.price)) run(api.updateItem(m.id, { price: v }), 'Price updated') }} /></td>
              <td><button className="btn ghost sm"
                onClick={() => run(api.updateItem(m.id, { available: !m.available }), m.name + (m.available ? ' marked sold out' : ' is available'))}>
                {m.available ? 'Available' : 'Sold out'}</button></td>
              <td><button className="btn bad sm" onClick={() => run(api.deleteItem(m.id), 'Item removed')}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </>}

      {tab === 'orders' && (
        <div className="card tw"><table>
          <thead><tr><th>Token</th><th>Student</th><th>Items</th><th>Total</th><th>Slot</th><th>Status</th></tr></thead>
          <tbody>{orders.map(o => (
            <tr key={o.id}>
              <td><b>{o.token}</b></td><td>{o.profiles?.full_name}</td>
              <td>{o.order_items.map(i => i.qty + '× ' + i.name).join(', ')}</td>
              <td>{money(o.total)}</td><td>{hhmm(o.pickup_slots?.slot_time)}</td>
              <td><span className={'pill ' + o.status}>{o.status}</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {tab === 'slots' && <>
        <div className="grid">{slots.map(s => {
          const used = s.capacity - s.remaining
          return (
            <div className="card" key={s.id}>
              <div className="oh"><h3>{hhmm(s.slot_time)}</h3>
                <button className="btn bad sm" onClick={() => run(api.deleteSlot(s.id), 'Slot removed')}>Remove</button></div>
              <div className="bar" style={{ margin: '10px 0' }}><i style={{ width: Math.min(100, used / s.capacity * 100) + '%' }} /></div>
              <div className="oh">
                <span className="muted">{used} of {s.capacity} booked</span>
                <span className="qty">
                  <button aria-label="Reduce capacity" onClick={() => s.capacity > 1 && run(api.updateSlot(s.id, { capacity: s.capacity - 1 }))}>−</button>{s.capacity}
                  <button aria-label="Increase capacity" onClick={() => run(api.updateSlot(s.id, { capacity: s.capacity + 1 }))}>+</button>
                </span>
              </div>
            </div>
          )
        })}</div>
        <form className="card oh" style={{ marginTop: 14 }} onSubmit={addSlot}>
          <label style={{ margin: 0 }}>New slot</label>
          <input type="time" style={{ width: 160 }} value={ns} onChange={ev => setNs(ev.target.value)} />
          <button className="btn">Add slot</button>
        </form>
      </>}

      {tab === 'stats' && (
        <div className="card">
          <h3>Most ordered today</h3>
          <p className="muted">Use this to plan today's stock.</p>
          {popular.length ? popular.map(([name, q]) => (
            <div key={name} style={{ margin: '10px 0' }}>
              <div className="oh"><span>{name}</span><b>{q}</b></div>
              <div className="bar"><i style={{ width: (q / popular[0][1] * 100) + '%' }} /></div>
            </div>
          )) : <p className="muted">No orders yet today.</p>}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */
export default function App() {
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState('login')
  const [toast, setToast] = useState('')
  const say = m => { setToast(m); clearTimeout(window.__t); window.__t = setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    api.sb.auth.getSession().then(async ({ data }) => {
      if (data.session) setProfile(await api.getProfile(data.session.user.id))
      setReady(true)
    })
  }, [])

  const out = async () => { await api.logout(); setProfile(null); setMode('login') }
  if (!ready) return null

  return (
    <>
      <nav><div className="wrap">
        <button className="logo"><i>🍽️</i>Kitchen House</button><span className="sp" />
        {profile && <>
          <span className="muted hide">{profile.full_name} · {profile.role}</span>
          <button className="btn sm" onClick={out}>Log out</button>
        </>}
      </div></nav>
      {!profile && <Auth key={mode} mode={mode} setMode={setMode} onDone={setProfile} say={say} />}
      {profile?.role === 'student' && <Student profile={profile} say={say} />}
      {profile?.role === 'kitchen' && <Kitchen say={say} />}
      {profile?.role === 'admin' && <Admin say={say} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
