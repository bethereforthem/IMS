'use client'

import { useRef, useState, useCallback } from 'react'
import { runOcr, extractDocumentData, type DocType, type ExtractedDocument } from '@/lib/documentOcr'
import { Upload, Camera, Loader2, ScanLine, X, CheckCircle2, AlertCircle } from 'lucide-react'

interface DocumentScannerProps {
  onExtracted: (doc: ExtractedDocument) => void
  onError: (msg: string) => void
  disabled?: boolean
}

const DOC_LABELS: Record<DocType, string> = {
  NATIONAL_ID:    'National ID Card',
  PASSPORT:       'Passport',
  REFUGEE_CARD:   'Refugee Card',
  DRIVERS_LICENSE: "Driver's License",
  OTHER:          'Other Document',
}

export default function DocumentScanner({ onExtracted, onError, disabled }: DocumentScannerProps) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)

  const [docType,   setDocType]   = useState<DocType>('NATIONAL_ID')
  const [ocrState,  setOcrState]  = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [ocrPct,    setOcrPct]    = useState(0)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [cameraOn,  setCameraOn]  = useState(false)
  const [stream,    setStream]    = useState<MediaStream | null>(null)

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { onError('Please select an image file'); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    setOcrState('processing')
    setOcrPct(0)
    try {
      const { text, confidence } = await runOcr(file, pct => setOcrPct(pct))
      const doc = extractDocumentData(text, confidence, docType)
      setOcrState('done')
      onExtracted(doc)
    } catch {
      setOcrState('error')
      onError('OCR failed — please enter details manually')
    }
  }, [docType, onExtracted, onError])

  // ── Camera capture ────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      setStream(ms)
      setCameraOn(true)
      if (videoRef.current) videoRef.current.srcObject = ms
    } catch {
      onError('Camera access denied — use file upload instead')
    }
  }

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraOn(false)
  }, [stream])

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current
    const c = canvasRef.current
    c.width  = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    const dataUrl = c.toDataURL('image/jpeg', 0.95)
    setPreview(dataUrl)
    stopCamera()
    setOcrState('processing')
    setOcrPct(0)
    try {
      const { text, confidence } = await runOcr(dataUrl, pct => setOcrPct(pct))
      const doc = extractDocumentData(text, confidence, docType)
      setOcrState('done')
      onExtracted(doc)
    } catch {
      setOcrState('error')
      onError('OCR failed — please enter details manually')
    }
  }, [docType, stopCamera, onExtracted, onError])

  const reset = () => {
    stopCamera()
    setPreview(null)
    setOcrState('idle')
    setOcrPct(0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Doc type selector */}
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          Document Type
        </label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(Object.keys(DOC_LABELS) as DocType[]).map(t => (
            <button
              key={t}
              onClick={() => setDocType(t)}
              disabled={disabled || ocrState === 'processing'}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: docType === t ? 'none' : '1px solid #334155',
                background: docType === t ? '#6366f1' : 'transparent',
                color: docType === t ? '#fff' : '#94a3b8',
                fontSize: '11px', fontWeight: docType === t ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {DOC_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Camera view */}
      {cameraOn && (
        <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '2px solid #6366f1' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: '320px', objectFit: 'cover' }} />
          {/* Scan guide overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '85%', height: '55%', border: '2px dashed rgba(99,102,241,0.8)', borderRadius: '8px' }} />
          </div>
          <div style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button
              onClick={captureFrame}
              style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '50px', padding: '10px 24px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ScanLine style={{ width: 16, height: 16 }} /> Capture
            </button>
            <button
              onClick={stopCamera}
              style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '50px', padding: '10px 18px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !cameraOn && (
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
          <img src={preview} alt="Document preview" style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', background: '#000' }} />
          <button
            onClick={reset}
            style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X style={{ width: 14, height: 14, color: '#fff' }} />
          </button>
        </div>
      )}

      {/* OCR progress */}
      {ocrState === 'processing' && (
        <div style={{ background: '#1e1b4b', border: '1px solid #6366f133', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Loader2 style={{ width: 15, height: 15, color: '#a5b4fc', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '12px', color: '#c7d2fe', fontWeight: 600 }}>Running OCR… {ocrPct}%</span>
          </div>
          <div style={{ height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${ocrPct}%`, height: '100%', background: '#6366f1', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {/* Done state */}
      {ocrState === 'done' && (
        <div style={{ background: '#052e16', border: '1px solid #22c55e44', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 style={{ width: 15, height: 15, color: '#22c55e' }} />
          <span style={{ fontSize: '12px', color: '#6ee7b7', fontWeight: 600 }}>OCR complete — review extracted data below</span>
          <button onClick={reset} style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Rescan</button>
        </div>
      )}

      {/* Error state */}
      {ocrState === 'error' && (
        <div style={{ background: '#450a0a', border: '1px solid #ef444433', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle style={{ width: 15, height: 15, color: '#ef4444' }} />
          <span style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>OCR failed — enter details manually below</span>
          <button onClick={reset} style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Action buttons */}
      {!cameraOn && ocrState !== 'processing' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              background: '#1e293b', color: '#94a3b8', border: '1px dashed #475569',
              borderRadius: '8px', padding: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Upload style={{ width: 16, height: 16 }} />
            Upload Image
          </button>
          <button
            onClick={startCamera}
            disabled={disabled}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              background: '#1e293b', color: '#94a3b8', border: '1px dashed #475569',
              borderRadius: '8px', padding: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Camera style={{ width: 16, height: 16 }} />
            Use Camera
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
