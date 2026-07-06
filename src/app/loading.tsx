export default function Loading() {
  return (
    <div className="route-loading" aria-live="polite" aria-label="Loading page">
      <div className="route-loading-bar" />
      <div className="route-loading-pill">
        <span />
        Loading workspace...
      </div>
    </div>
  );
}
