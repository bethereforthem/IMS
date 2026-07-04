import * as Location from 'expo-location'

export interface Coords {
  lat: number
  lng: number
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const granted = await requestLocationPermission()
    if (!granted) return null
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    return { lat: loc.coords.latitude, lng: loc.coords.longitude }
  } catch {
    return null
  }
}

export function coordsLabel(coords: Coords | null): string {
  if (!coords) return 'GPS unavailable'
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
}
