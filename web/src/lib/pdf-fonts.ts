'use client'

// Shared pdfmake bootstrap: registers the bundled Roboto faces plus Tahoma
// (served from /public/fonts) using the pdfmake 0.3 vfs/font API.
// All IMS PDF exports use Tahoma; Roboto is the fallback if the font files
// cannot be fetched.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

let tahomaCache: { normal: string; bold: string } | null = null

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function getPdfMake(): Promise<{ pdfMake: Obj; font: string }> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default as unknown as Obj
  const vfsFonts = (await import('pdfmake/build/vfs_fonts')).default
  // pdfmake 0.3: the old `pdfMake.vfs = …` assignment is inert — fonts must
  // be registered through addVirtualFileSystem / addFonts
  pdfMake.addVirtualFileSystem(vfsFonts)

  try {
    if (!tahomaCache) {
      const fetchFont = async (path: string) => {
        const r = await fetch(path)
        if (!r.ok) throw new Error(`font fetch failed: ${path}`)
        return bufferToBase64(await r.arrayBuffer())
      }
      const [normal, bold] = await Promise.all([
        fetchFont('/fonts/tahoma.ttf'),
        fetchFont('/fonts/tahomabd.ttf'),
      ])
      tahomaCache = { normal, bold }
    }
    pdfMake.addVirtualFileSystem({
      'tahoma.ttf': tahomaCache.normal,
      'tahomabd.ttf': tahomaCache.bold,
    })
    // Tahoma has no italic face — italic text renders in the upright cut
    pdfMake.addFonts({
      Tahoma: {
        normal: 'tahoma.ttf',
        bold: 'tahomabd.ttf',
        italics: 'tahoma.ttf',
        bolditalics: 'tahomabd.ttf',
      },
    })
    return { pdfMake, font: 'Tahoma' }
  } catch (err) {
    console.warn('[pdf-fonts] Tahoma unavailable, falling back to Roboto', err)
    return { pdfMake, font: 'Roboto' }
  }
}
