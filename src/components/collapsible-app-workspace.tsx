"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

const SIDEBAR_PREFERENCE_EVENT = "aijou:sidebar-preference-changed";

export function CollapsibleAppWorkspace({
  children,
  preferenceKey,
  sidebar,
}: {
  children: ReactNode;
  preferenceKey: string;
  sidebar: ReactNode;
}) {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToSidebarPreference(preferenceKey, callback),
    [preferenceKey],
  );
  const getSnapshot = useCallback(
    () => readSidebarPreference(preferenceKey),
    [preferenceKey],
  );
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSidebarPreference,
  );

  const ToggleIcon = collapsed ? ChevronRight : ChevronLeft;
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
          onClick={() => saveSidebarPreference(preferenceKey, !collapsed)}
        >
          <ToggleIcon size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {sidebar}
      </aside>
      {children}
    </div>
  );
}

function readSidebarPreference(preferenceKey: string) {
  try {
    return window.localStorage.getItem(preferenceKey) === "1";
  } catch {
    return false;
  }
}

function getServerSidebarPreference() {
  return false;
}

function subscribeToSidebarPreference(preferenceKey: string, callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== preferenceKey) return;
    callback();
  };
  const handlePreference = (event: Event) => {
    if ((event as CustomEvent<string>).detail !== preferenceKey) return;
    callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, handlePreference);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, handlePreference);
  };
}

function saveSidebarPreference(preferenceKey: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(preferenceKey, collapsed ? "1" : "0");
  } catch {
    // The toggle remains usable even when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_PREFERENCE_EVENT, { detail: preferenceKey }));
}
