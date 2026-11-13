export function Loading({ label }: { label: string }) {
  return <div className="loading-state" role="status">
    <span className="loading-mark" aria-hidden="true"><i /><i /><i /><i /></span>
    <p>{label}</p>
  </div>
}
