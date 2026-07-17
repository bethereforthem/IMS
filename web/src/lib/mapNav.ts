'use client'

/**
 * Map navigation kit — attaches Google-Maps-style tools to an existing
 * Leaflet map used by the IMS dashboards:
 *
 *  • location search (Nominatim via /api/v1/geo/search)
 *  • driving directions with multiple waypoints (OSRM via /api/v1/geo/route)
 *  • highlighted route polyline + total / per-leg distance and ETA
 *  • click-to-pick waypoints, draggable A/1/2/B markers
 *  • responsive collapsible panel (desktop + mobile)
 *
 * Framework-agnostic (plain Leaflet DOM controls) so it plugs into every
 * dashboard map without touching their existing layers or alarms.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = any

interface Waypoint {
  lat: number
  lng: number
  label: string
  marker?: Obj
}

export interface MapNavHandle {
  destroy: () => void
}

const PANEL_CSS_ID = 'ims-mapnav-css'
const PANEL_CSS = `
  .ims-nav-panel { background:#0f172aee; border:1px solid #334155; border-radius:10px; color:#e2e8f0;
    font-family:system-ui,sans-serif; width:270px; max-width:calc(100vw - 90px); box-shadow:0 6px 24px rgba(0,0,0,.55); overflow:hidden; }
  .ims-nav-head { display:flex; align-items:center; gap:8px; padding:9px 12px; background:#1e293b; cursor:pointer; user-select:none; }
  .ims-nav-head b { font-size:12px; letter-spacing:.4px; flex:1; }
  .ims-nav-body { padding:10px 12px; display:flex; flex-direction:column; gap:8px; max-height:46vh; overflow-y:auto; }
  .ims-nav-input { width:100%; box-sizing:border-box; background:#1e293b; border:1px solid #334155; border-radius:7px;
    color:#e2e8f0; font-size:12px; padding:7px 9px; outline:none; }
  .ims-nav-input:focus { border-color:#38bdf8; }
  .ims-nav-results { display:flex; flex-direction:column; gap:2px; }
  .ims-nav-result { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:11px; color:#cbd5e1; }
  .ims-nav-result:hover { background:#1e293b; }
  .ims-nav-result button { background:#0ea5e9; color:#fff; border:none; border-radius:5px; font-size:10px; font-weight:700;
    padding:3px 7px; cursor:pointer; flex-shrink:0; }
  .ims-nav-wprow { display:flex; align-items:center; gap:7px; font-size:11px; background:#1e293b; border-radius:7px; padding:6px 8px; }
  .ims-nav-wpbadge { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:800; color:#fff; flex-shrink:0; }
  .ims-nav-wprow span.lbl { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cbd5e1; }
  .ims-nav-wprow button { background:none; border:none; color:#64748b; cursor:pointer; font-size:13px; padding:0 2px; }
  .ims-nav-wprow button:hover { color:#ef4444; }
  .ims-nav-btns { display:flex; gap:6px; }
  .ims-nav-btn { flex:1; border:none; border-radius:7px; font-size:11px; font-weight:700; padding:7px 0; cursor:pointer; transition:filter .15s; }
  .ims-nav-btn:hover { filter:brightness(1.15); }
  .ims-nav-btn.pick   { background:#155e75; color:#a5f3fc; }
  .ims-nav-btn.pick.on{ background:#0ea5e9; color:#fff; }
  .ims-nav-btn.clear  { background:#3f1d1d; color:#fca5a5; }
  .ims-nav-stats { background:#062032; border:1px solid #164e63; border-radius:7px; padding:8px 10px; font-size:11px; color:#a5f3fc; }
  .ims-nav-stats b { font-size:14px; color:#fff; }
  .ims-nav-leg { color:#67e8f9; font-size:10px; }
  .ims-nav-hint { font-size:10px; color:#64748b; line-height:1.4; }
  .ims-nav-spin { color:#38bdf8; font-size:11px; }
  @media (max-width: 640px) { .ims-nav-panel { width:230px; } .ims-nav-body { max-height:38vh; } }
`

function authHeaders(): Record<string, string> {
  const token = document.cookie.split('; ').find(r => r.startsWith('ims_access_token='))?.split('=')[1]
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}
function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const min = Math.round((s % 3600) / 60)
  return h > 0 ? `${h} h ${min} min` : `${min} min`
}

export function attachMapNavigation(leaflet: L, map: Obj): MapNavHandle {
  const L = leaflet

  if (!document.getElementById(PANEL_CSS_ID)) {
    const style = document.createElement('style')
    style.id = PANEL_CSS_ID
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
  }

  const waypoints: Waypoint[] = []
  let pickMode = false
  let collapsed = false
  let routeLineCasing: Obj = null
  let routeLine: Obj = null
  let searchMarker: Obj = null
  let routeSeq = 0
  let searchSeq = 0
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  // ── panel DOM ───────────────────────────────────────────────────────────────
  const NavControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'ims-nav-panel')
      el.innerHTML = `
        <div class="ims-nav-head"><b>🧭 NAVIGATION</b><span data-nav="chev">▾</span></div>
        <div class="ims-nav-body">
          <input class="ims-nav-input" data-nav="search" type="text" placeholder="Search place, district, landmark…" autocomplete="off" />
          <div class="ims-nav-results" data-nav="results"></div>
          <div data-nav="waypoints" style="display:flex;flex-direction:column;gap:5px"></div>
          <div class="ims-nav-btns">
            <button class="ims-nav-btn pick" data-nav="pick">📍 Pick on map</button>
            <button class="ims-nav-btn clear" data-nav="clearbtn">✕ Clear</button>
          </div>
          <div data-nav="stats"></div>
          <div class="ims-nav-hint" data-nav="hint">Search a place or enable “Pick on map”, then click the map to set
            Start → stops → Destination. The driving route, distance and ETA appear automatically.</div>
        </div>`
      L.DomEvent.disableClickPropagation(el)
      L.DomEvent.disableScrollPropagation(el)
      return el
    },
  })
  const control = new NavControl()
  map.addControl(control)
  const panel: HTMLElement = control.getContainer()
  const $ = (name: string) => panel.querySelector(`[data-nav="${name}"]`) as HTMLElement

  const body = panel.querySelector('.ims-nav-body') as HTMLElement
  $('chev').parentElement!.addEventListener('click', () => {
    collapsed = !collapsed
    body.style.display = collapsed ? 'none' : 'flex'
    $('chev').textContent = collapsed ? '▸' : '▾'
  })

  // ── waypoint markers ────────────────────────────────────────────────────────
  function badgeFor(index: number, total: number): { text: string; color: string } {
    if (index === 0) return { text: 'A', color: '#16a34a' }
    if (index === total - 1 && total > 1) return { text: 'B', color: '#dc2626' }
    return { text: String(index), color: '#0ea5e9' }
  }

  function makeMarker(wp: Waypoint, index: number, total: number): Obj {
    const { text, color } = badgeFor(index, total)
    const icon = L.divIcon({
      className: '',
      iconSize: [28, 38],
      iconAnchor: [14, 36],
      html: `<div style="position:relative;width:28px;height:38px;">
        <div style="position:absolute;top:0;left:0;width:28px;height:28px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);background:${color};border:2.5px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.5)"></div>
        <div style="position:absolute;top:4px;left:0;width:28px;text-align:center;color:#fff;font-weight:800;
          font-size:12px;font-family:system-ui">${text}</div>
      </div>`,
    })
    const marker = L.marker([wp.lat, wp.lng], { icon, draggable: true, zIndexOffset: 1000 })
    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      wp.lat = pos.lat
      wp.lng = pos.lng
      wp.label = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`
      renderWaypoints()
      void updateRoute()
    })
    marker.addTo(map)
    return marker
  }

  function redrawMarkers() {
    waypoints.forEach((wp, i) => {
      if (wp.marker) map.removeLayer(wp.marker)
      wp.marker = makeMarker(wp, i, waypoints.length)
    })
  }

  function renderWaypoints() {
    const box = $('waypoints')
    box.innerHTML = ''
    waypoints.forEach((wp, i) => {
      const { text, color } = badgeFor(i, waypoints.length)
      const row = document.createElement('div')
      row.className = 'ims-nav-wprow'
      row.innerHTML = `
        <div class="ims-nav-wpbadge" style="background:${color}">${text}</div>
        <span class="lbl" title="${wp.label}">${wp.label}</span>
        <button title="Remove">✕</button>`
      row.querySelector('button')!.addEventListener('click', () => {
        if (wp.marker) map.removeLayer(wp.marker)
        waypoints.splice(i, 1)
        redrawMarkers()
        renderWaypoints()
        void updateRoute()
      })
      box.appendChild(row)
    })
    $('hint').style.display = waypoints.length >= 2 ? 'none' : 'block'
  }

  function addWaypoint(lat: number, lng: number, label?: string) {
    waypoints.push({ lat, lng, label: label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
    redrawMarkers()
    renderWaypoints()
    void updateRoute()
  }

  // ── routing ────────────────────────────────────────────────────────────────
  async function updateRoute() {
    const seq = ++routeSeq
    const stats = $('stats')

    if (routeLine) { map.removeLayer(routeLine); routeLine = null }
    if (routeLineCasing) { map.removeLayer(routeLineCasing); routeLineCasing = null }

    if (waypoints.length < 2) { stats.innerHTML = ''; return }

    stats.innerHTML = '<div class="ims-nav-spin">⏳ Calculating driving route…</div>'
    try {
      const points = waypoints.map(w => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join(';')
      const r = await fetch(`/api/v1/geo/route?points=${encodeURIComponent(points)}`, { headers: authHeaders() })
      const data = await r.json()
      if (seq !== routeSeq) return
      if (!r.ok) {
        stats.innerHTML = `<div class="ims-nav-stats" style="color:#fca5a5;border-color:#7f1d1d;background:#2a0e0e">
          ⚠ ${data.error ?? 'Routing failed'}</div>`
        return
      }

      // highlighted polyline: dark casing + bright route line
      routeLineCasing = L.polyline(data.coordinates, { color: '#082f49', weight: 9, opacity: 0.75 }).addTo(map)
      routeLine = L.polyline(data.coordinates, { color: '#38bdf8', weight: 5, opacity: 0.95 }).addTo(map)
      map.fitBounds(routeLine.getBounds(), { padding: [46, 46] })

      const legsHtml = data.legs.length > 1
        ? `<div style="margin-top:5px;display:flex;flex-direction:column;gap:2px">` +
          data.legs.map((leg: { distance_m: number; duration_s: number }, i: number) => {
            const from = badgeFor(i, waypoints.length).text
            const to = badgeFor(i + 1, waypoints.length).text
            return `<div class="ims-nav-leg">${from} → ${to}: ${fmtDistance(leg.distance_m)} · ${fmtDuration(leg.duration_s)}</div>`
          }).join('') + '</div>'
        : ''

      stats.innerHTML = `<div class="ims-nav-stats">
        🚗 <b>${fmtDistance(data.distance_m)}</b> &nbsp;·&nbsp; ⏱ <b>${fmtDuration(data.duration_s)}</b>
        <div style="color:#67e8f9;font-size:10px;margin-top:2px">Driving · fastest route</div>${legsHtml}</div>`
    } catch {
      if (seq === routeSeq) {
        stats.innerHTML = `<div class="ims-nav-stats" style="color:#fca5a5;border-color:#7f1d1d;background:#2a0e0e">
          ⚠ Routing service unreachable</div>`
      }
    }
  }

  // ── pick-on-map mode ───────────────────────────────────────────────────────
  const pickBtn = $('pick') as HTMLButtonElement
  function setPickMode(on: boolean) {
    pickMode = on
    pickBtn.classList.toggle('on', on)
    pickBtn.textContent = on ? '📍 Picking… (click map)' : '📍 Pick on map'
    map.getContainer().style.cursor = on ? 'crosshair' : ''
  }
  pickBtn.addEventListener('click', () => setPickMode(!pickMode))

  const onMapClick = (e: Obj) => {
    if (!pickMode) return
    addWaypoint(e.latlng.lat, e.latlng.lng)
  }
  map.on('click', onMapClick)

  $('clearbtn').addEventListener('click', () => {
    waypoints.forEach(wp => { if (wp.marker) map.removeLayer(wp.marker) })
    waypoints.length = 0
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null }
    setPickMode(false)
    renderWaypoints()
    void updateRoute()
  })

  // ── search ─────────────────────────────────────────────────────────────────
  const searchInput = $('search') as HTMLInputElement
  const resultsBox = $('results')

  async function runSearch(q: string) {
    const seq = ++searchSeq
    if (q.trim().length < 2) { resultsBox.innerHTML = ''; return }
    resultsBox.innerHTML = '<div class="ims-nav-spin" style="padding:2px 8px">⏳ Searching…</div>'
    try {
      const r = await fetch(`/api/v1/geo/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() })
      const data = await r.json()
      if (seq !== searchSeq) return
      const results: Array<{ name: string; lat: number; lng: number }> = data.results ?? []
      resultsBox.innerHTML = ''
      if (!results.length) {
        resultsBox.innerHTML = '<div class="ims-nav-hint" style="padding:2px 8px">No places found.</div>'
        return
      }
      results.forEach(res => {
        const item = document.createElement('div')
        item.className = 'ims-nav-result'
        const short = res.name.split(',').slice(0, 3).join(',')
        item.innerHTML = `<span style="flex:1" title="${res.name}">📌 ${short}</span><button>+ Route</button>`
        // click the row → fly there and drop a reference marker
        item.addEventListener('click', () => {
          map.flyTo([res.lat, res.lng], Math.max(map.getZoom(), 14), { duration: 1.2 })
          if (searchMarker) map.removeLayer(searchMarker)
          searchMarker = L.marker([res.lat, res.lng]).addTo(map)
            .bindPopup(`<b style="font-size:12px">${short}</b>`).openPopup()
        })
        // “+ Route” → append as the next waypoint
        item.querySelector('button')!.addEventListener('click', ev => {
          ev.stopPropagation()
          addWaypoint(res.lat, res.lng, short)
          resultsBox.innerHTML = ''
          searchInput.value = ''
        })
        resultsBox.appendChild(item)
      })
    } catch {
      if (seq === searchSeq) resultsBox.innerHTML = '<div class="ims-nav-hint" style="padding:2px 8px">Search unavailable.</div>'
    }
  }

  searchInput.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void runSearch(searchInput.value), 350)
  })
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { if (searchTimer) clearTimeout(searchTimer); void runSearch(searchInput.value) }
  })

  // ── teardown ───────────────────────────────────────────────────────────────
  return {
    destroy() {
      if (searchTimer) clearTimeout(searchTimer)
      map.off('click', onMapClick)
      waypoints.forEach(wp => { if (wp.marker) map.removeLayer(wp.marker) })
      if (routeLine) map.removeLayer(routeLine)
      if (routeLineCasing) map.removeLayer(routeLineCasing)
      if (searchMarker) map.removeLayer(searchMarker)
      map.removeControl(control)
      map.getContainer().style.cursor = ''
    },
  }
}
