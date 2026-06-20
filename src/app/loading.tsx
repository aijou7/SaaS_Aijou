export default function Loading() {
  return (
    <div className="route-loading">
      <div className="route-loading-bar" />
      <div className="route-loading-shell">
        <div className="route-loading-sidebar">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="route-loading-main">
          <span className="loading-title" />
          <div className="loading-metrics">
            <span />
            <span />
            <span />
          </div>
          <span className="loading-panel" />
        </div>
      </div>
    </div>
  );
}
