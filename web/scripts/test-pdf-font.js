// Smoke test: generate a PDF with embedded Tahoma via the same pdfmake build
// the browser uses, to prove the font registration pattern works.
const fs = require('fs')
const path = require('path')

const pdfMake = require('pdfmake/build/pdfmake')
const vfsFonts = require('pdfmake/build/vfs_fonts')

const fontsDir = path.join(__dirname, '..', 'public', 'fonts')
// pdfmake 0.3 API: addVirtualFileSystem + addFonts
pdfMake.addVirtualFileSystem(vfsFonts)
pdfMake.addVirtualFileSystem({
  'tahoma.ttf': fs.readFileSync(path.join(fontsDir, 'tahoma.ttf')).toString('base64'),
  'tahomabd.ttf': fs.readFileSync(path.join(fontsDir, 'tahomabd.ttf')).toString('base64'),
})
pdfMake.addFonts({
  Tahoma: {
    normal: 'tahoma.ttf', bold: 'tahomabd.ttf',
    italics: 'tahoma.ttf', bolditalics: 'tahomabd.ttf',
  },
})

const doc = {
  content: [
    { text: 'CRIMINAL INVESTIGATION REPORT', bold: true, fontSize: 16 },
    { text: 'Tahoma regular — Théoneste Bizimana, Nyarugenge, RWA-RIB-2026-00005', fontSize: 10 },
    { text: 'Tahoma bold — REPUBLIC OF RWANDA · RIB', bold: true, fontSize: 10 },
    { text: 'Italic flag (renders upright in Tahoma)', italics: true, fontSize: 10 },
  ],
  defaultStyle: { font: 'Tahoma', fontSize: 10 },
}

pdfMake.createPdf(doc).getBuffer().then(buf => {
  const out = path.join(require('os').tmpdir(), 'tahoma-test.pdf')
  fs.writeFileSync(out, Buffer.from(buf))
  const header = Buffer.from(buf.slice(0, 5)).toString()
  const hasTahoma = Buffer.from(buf).includes('Tahoma')
  console.log(`header=${header} size=${buf.length} tahoma-embedded=${hasTahoma} -> ${out}`)
  process.exit(header === '%PDF-' && hasTahoma ? 0 : 1)
}).catch(e => { console.error(e.message); process.exit(1) })
