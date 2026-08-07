'use client'

/**
 * mapBaseLayers.ts — one definition of the base maps every IMS dashboard offers.
 *
 * The layer list used to be pasted into each map component, so the four maps
 * that had a switcher offered slightly different sets and the other three
 * offered no choice at all. This is the single source.
 *
 * On imagery providers
 * --------------------
 * Google publishes no open-source or free tile API. The `mt{s}.google.com/vt`
 * endpoints these maps have been using are Google's internal, undocumented
 * tile servers — they are not a supported API, using them outside Google Maps
 * is against the Maps Platform terms, and Google can (and periodically does)
 * block them without notice. They are kept here because they are already in
 * service and removing them silently would degrade maps operators rely on, but
 * they are labelled and ordered *below* an equivalent that is properly licensed
 * for this use:
 *
 *   Esri World Imagery — high-resolution satellite, free for use with
 *   attribution, and the default satellite layer here.
 *
 * If a licensed Google Maps Platform key is ever provisioned, the correct route
 * is the official Maps JavaScript API rather than these tile URLs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = any

export interface BaseLayerOptions {
  /** Which layer starts visible. Defaults to satellite with street labels. */
  initial?: string
  /** Include the unofficial Google tile layers. Defaults to true. */
  includeGoogle?: boolean
}

/** Label of the layer selected when a map does not ask for a specific one. */
export const DEFAULT_BASE_LAYER = '🛰️ Satellite + Streets'

/**
 * Build the shared base layer set.
 *
 * Returns the record Leaflet's layer control expects, plus the layer that
 * should be added to the map straight away.
 */
export function createBaseLayers(
  leaflet: L,
  options: BaseLayerOptions = {},
): { layers: Record<string, Obj>; initialLayer: Obj; initialName: string } {
  const L = leaflet
  const { initial = DEFAULT_BASE_LAYER, includeGoogle = true } = options

  const esriImagery = () => L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 21,
      maxNativeZoom: 19,
    },
  )

  const layers: Record<string, Obj> = {
    // Satellite imagery with road and place names drawn over it — the view most
    // operators mean when they ask for "the real map".
    // The label tiles are transparent and listed second, so Leaflet assigns them
    // the higher z-index within the tile pane and they draw over the imagery.
    [DEFAULT_BASE_LAYER]: L.layerGroup([
      esriImagery(),
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; CARTO', maxZoom: 20 },
      ),
    ]),

    '🛰️ Satellite (clean)': esriImagery(),

    '🗺️ Streets': L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; CARTO &copy; OpenStreetMap', maxZoom: 20 },
    ),

    '🗺️ Streets (OSM)': L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
    ),

    '🌑 Dark (Tactical)': L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; CARTO', maxZoom: 20 },
    ),

    '☀️ Light': L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; CARTO', maxZoom: 20 },
    ),

    '⛰️ Terrain': L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17 },
    ),
  }

  if (includeGoogle) {
    layers['🛰️ Google Satellite (unofficial)'] = L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { subdomains: ['0', '1', '2', '3'], attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20 },
    )
    layers['🛰️ Google Hybrid (unofficial)'] = L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      { subdomains: ['0', '1', '2', '3'], attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20 },
    )
  }

  const initialName = layers[initial] ? initial : DEFAULT_BASE_LAYER
  return { layers, initialLayer: layers[initialName], initialName }
}

const CONTROL_CSS_ID = 'ims-baselayer-css'
const CONTROL_CSS = `
  .leaflet-control-layers { background:#1e293b !important; border:1px solid #334155 !important; border-radius:8px !important;
    color:#e2e8f0 !important; font-family:'Courier New',monospace !important; font-size:11px !important;
    box-shadow:0 4px 20px rgba(0,0,0,.6) !important; }
  .leaflet-control-layers-toggle { background-color:#1e293b !important; border:1px solid #334155 !important;
    width:36px !important; height:36px !important; }
  .leaflet-control-layers-expanded { padding:10px 14px !important; }
  .leaflet-control-layers label { color:#cbd5e1 !important; margin-bottom:4px !important; display:flex !important;
    align-items:center !important; gap:6px !important; }
  .leaflet-control-layers-separator { border-top:1px solid #334155 !important; margin:6px 0 !important; }
  .leaflet-control-layers-base label span, .leaflet-control-layers-overlays label span { margin-left:4px; }
`

/**
 * Add the shared base layers plus a layer switcher to a map in one call.
 *
 * For the maps that had a single hard-coded basemap and no switcher at all —
 * the RNP and RDF incident maps and the AI prediction map — so that every map
 * in the system offers the same choice of imagery.
 */
export function attachBaseLayers(
  leaflet: L,
  map: Obj,
  options: BaseLayerOptions & {
    overlays?: Record<string, Obj>
    position?: string
    collapsed?: boolean
  } = {},
): { layers: Record<string, Obj>; initialLayer: Obj } {
  const L = leaflet

  if (typeof document !== 'undefined' && !document.getElementById(CONTROL_CSS_ID)) {
    const style = document.createElement('style')
    style.id = CONTROL_CSS_ID
    style.textContent = CONTROL_CSS
    document.head.appendChild(style)
  }

  const { layers, initialLayer } = createBaseLayers(L, options)
  initialLayer.addTo(map)

  L.control.layers(layers, options.overlays ?? {}, {
    position: options.position ?? 'topright',
    collapsed: options.collapsed ?? true,
  }).addTo(map)

  return { layers, initialLayer }
}
