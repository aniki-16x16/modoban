/** Give the browser a paint opportunity before starting initialization work. */
export function afterPaint(callback: () => void): () => void {
  let timer: number | undefined
  const frame = requestAnimationFrame(() => { timer = window.setTimeout(callback,0) })
  return () => { cancelAnimationFrame(frame); if (timer!==undefined) window.clearTimeout(timer) }
}
