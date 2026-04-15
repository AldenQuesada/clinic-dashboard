/* ============================================================================
 * Beauty & Health Magazine — Image Pipeline
 *
 * Pré-processamento antes do upload ao Storage:
 *   1. Compressão: JPEG max 2000px (lado maior) · quality 0.88
 *   2. Hash SHA-256 dos bytes comprimidos · dedupe contra magazine_assets
 *   3. Auto-alt: usa nome do arquivo (sem extensão) como sugestão inicial
 *   4. Warning de qualidade se dimensão < 1600px
 *
 * Expõe: window.MagazineAdmin.ImagePipeline
 *   - process(file, opts) → { file, hash, width, height, warning? }
 *   - findDuplicate(hash, editionId, sb) → url | null
 * ============================================================================ */
;(function () {
  'use strict'

  const MAX_SIDE = 2000
  const JPEG_QUALITY = 0.88
  const MIN_QUALITY_SIDE = 1600

  async function process(file, opts) {
    opts = opts || {}
    const isImage = file && file.type && file.type.startsWith('image/')
    if (!isImage) return { file, hash: null, width: null, height: null, warning: null }

    // 1. Lê dimensões originais
    const origDims = await readDims(file)

    // 2. Compressão se > MAX_SIDE ou se >2MB (heurística)
    let outFile = file
    let outDims = origDims
    const shouldResize = (origDims.width > MAX_SIDE || origDims.height > MAX_SIDE) || file.size > 2 * 1024 * 1024
    if (shouldResize) {
      const { blob, width, height } = await resizeToJPEG(file, origDims, MAX_SIDE, JPEG_QUALITY)
      outFile = new File([blob], renameFile(file.name, '-opt', 'jpg'), { type: 'image/jpeg' })
      outDims = { width, height }
    }

    // 3. Hash SHA-256 dos bytes finais
    const hash = await sha256(outFile)

    // 4. Warning de qualidade
    const minSide = Math.min(outDims.width, outDims.height)
    const warning = minSide < MIN_QUALITY_SIDE ? `Baixa resolução (${outDims.width}×${outDims.height}) · ideal ≥${MIN_QUALITY_SIDE}px no menor lado.` : null

    return {
      file: outFile,
      hash,
      width: outDims.width,
      height: outDims.height,
      warning,
      origSize: file.size,
      size: outFile.size,
      savedBytes: file.size - outFile.size,
    }
  }

  function readDims(file) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }) }
      img.src = url
    })
  }

  function resizeToJPEG(file, dims, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, maxSide / Math.max(dims.width, dims.height))
        const w = Math.round(dims.width * scale)
        const h = Math.round(dims.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob falhou'))
          resolve({ blob, width: w, height: h })
        }, 'image/jpeg', quality)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')) }
      img.src = url
    })
  }

  async function sha256(file) {
    const buf = await file.arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  function renameFile(name, suffix, forceExt) {
    const dot = name.lastIndexOf('.')
    const base = dot >= 0 ? name.slice(0, dot) : name
    const ext = forceExt || (dot >= 0 ? name.slice(dot + 1) : 'jpg')
    return `${base}${suffix}.${ext}`
  }

  // Busca asset com mesmo hash na edição (metadata.hash) — retorna URL se encontrado
  async function findDuplicate(hash, editionId, sb) {
    if (!hash || !editionId || !sb) return null
    try {
      const { data, error } = await sb.from('magazine_assets')
        .select('url, meta')
        .eq('edition_id', editionId)
        .filter('meta->>hash', 'eq', hash)
        .limit(1)
        .maybeSingle()
      if (error || !data) return null
      return data.url
    } catch (e) { return null }
  }

  function altFromFilename(filename) {
    if (!filename) return ''
    const dot = filename.lastIndexOf('.')
    const base = dot >= 0 ? filename.slice(0, dot) : filename
    return base.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.ImagePipeline = { process, findDuplicate, altFromFilename }
})()
