"use client";

import * as React from "react";
import { toast } from "sonner";

export type Settings = Record<string, string>;

const DEFAULTS: Settings = {
  default_session_name: "nomad",
  auto_attach_single: "true",
  haptics_enabled: "true",
  theme: "system",
  terminal_font_size: "13",
  terminal_font_family: "JetBrains Mono",
  terminal_cursor_style: "block",
  terminal_cursor_blink: "true",
  terminal_scrollback: "5000",
  terminal_theme: "nomad",
  confirm_kill_session: "true",
  confirm_kill_window: "true",
  confirm_delete_server: "true",
  confirm_detach: "true",
};

type SettingsContextValue = {
  settings: Settings;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Settings) => Promise<void>;
};

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<Settings>(DEFAULTS);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings({ ...DEFAULTS, ...(data.settings || {}) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load settings";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const update = React.useCallback(async (patch: Settings) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      const data = await res.json();
      setSettings({ ...DEFAULTS, ...(data.settings || {}) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save settings";
      toast.error(msg);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const value = React.useMemo(
    () => ({ settings, loading, refresh, update }),
    [settings, loading, refresh, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) {
    return {
      settings: DEFAULTS,
      loading: false,
      refresh: async () => {},
      update: async () => {},
    } as SettingsContextValue;
  }
  return ctx;
}

export const SETTINGS_DEFAULTS = DEFAULTS;
