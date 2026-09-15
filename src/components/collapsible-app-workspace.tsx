"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

const SIDEBAR_STORAGE_KEY = "aijou:settings-sidebar-collapsed";
const SIDEBAR_PREFERENCE_EVENT = "aijou:sidebar-preference-changed";

export function CollapsibleAppWorkspace({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    readSidebarPreference,
    getServerSidebarPreference,
  );

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Tampilkan sidebar" : "Kecilkan sidebar";

  return (
    <div
      className={collapsed ? "app-workspace app-workspace-sidebar-collapsed" : "app-workspace"}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <aside className={collapsed ? "settings-sidebar settings-sidebar-collapsed" : "settings-sidebar"}>
        <button
          className="settings-sidebar-toggle"
          type="button"
          aria-label={toggleLabel}
          aria-pressed={collapsed}
          title={toggleLabel}
          data-tooltip={toggleLabel}
          onClick={() => saveSidebarPreference(!collapsed)}
        >
          <ToggleIcon size={16} aria-hidden="true" />
        </button>
        {sidebar}
      </aside>
      {children}
    </div>
  );
}

function readSidebarPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSidebarPreference() {
  return false;
}

function subscribeToSidebarPreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, callback);
  };
}

function saveSidebarPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // The toggle remains usable even when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
}
