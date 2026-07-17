declare module 'pdfmake/build/pdfmake' {
  interface PdfMakeStatic {
    vfs: Record<string, string>
    createPdf(docDefinition: Record<string, unknown>): {
      download(filename?: string, cb?: () => void): void
      open(): void
      print(): void
      getBlob(cb: (blob: Blob) => void): void
      getBase64(cb: (data: string) => void): void
    }
  }
  const pdfMake: PdfMakeStatic
  export default pdfMake
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfsFonts: Record<string, string>
  export default vfsFonts
}
