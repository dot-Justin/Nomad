"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ArrowLeft, Laptop, Moon, Sun } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useSettings } from "@/hooks/useSettings";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

const FONT_FAMILIES = [
  "JetBrains Mono",
  "SF Mono",
  "Fira Code",
  "Cascadia Code",
  "Monospace",
];

const TERMINAL_THEMES = [
  { value: "nomad", label: "Nomad" },
  { value: "dark", label: "Dark" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "dracula", label: "Dracula" },
  { value: "nord", label: "Nord" },
];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 pb-1.5 pt-6 text-xs font-semibold text-muted-foreground">
      {children}
    </h3>
  );
}

function Row({
  label,
  description,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-3.5", className)}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{label}</div>
        {description ? (
          <div className="truncate text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
      <div className="divide-y divide-border/60">{children}</div>
    </Card>
  );
}

export default function SettingsClient() {
  const router = useRouter();
  const { settings, update } = useSettings();
  const { theme, setTheme } = useTheme();
  const haptics = useHaptics();

  const set = async (patch: Record<string, string>) => {
    await update(patch);
  };

  const fontSize = Number(settings.terminal_font_size) || 13;
  const scrollback = Number(settings.terminal_scrollback) || 5000;

  return (
    <div className="relative min-h-[100dvh] pb-20">

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/85 px-3 pt-safe backdrop-blur">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
        >
          <ArrowLeft weight="bold" size={20} />
        </button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <main className="relative mx-auto max-w-2xl px-3 pb-12 pt-2">
        <SectionHeader>General</SectionHeader>
        <Group>
          <Row label="Default Session Name">
            <Input
              defaultValue={settings.default_session_name}
              onBlur={(e) => {
                const v = e.target.value.replace(/[^A-Za-z0-9_.-]/g, "") || "nomad";
                if (v !== settings.default_session_name) {
                  set({ default_session_name: v });
                }
              }}
              className="h-9 w-32 rounded-xl border-input bg-muted text-right text-sm shadow-none"
            />
          </Row>
          <Row label="Auto-attach if single session">
            <Switch
              checked={settings.auto_attach_single === "true"}
              onCheckedChange={(v) => set({ auto_attach_single: String(v) })}
            />
          </Row>
          <Row label="Haptic Feedback">
            <Switch
              checked={settings.haptics_enabled === "true"}
              onCheckedChange={(v) => {
                set({ haptics_enabled: String(v) });
                if (v) haptics.tap();
              }}
            />
          </Row>
          <Row label="Theme">
            <SegmentedControl
              value={(theme as string) || "system"}
              onChange={(v) => setTheme(v)}
              options={[
                {
                  value: "light",
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Sun weight="fill" size={12} /> Light
                    </span>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Moon weight="fill" size={12} /> Dark
                    </span>
                  ),
                },
                {
                  value: "system",
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <Laptop weight="fill" size={12} /> Auto
                    </span>
                  ),
                },
              ]}
              className="w-56"
            />
          </Row>
        </Group>

        <SectionHeader>Terminal</SectionHeader>
        <Group>
          <Row label="Font Size">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                disabled={fontSize <= 10}
                onClick={() => set({ terminal_font_size: String(Math.max(10, fontSize - 1)) })}
              >
                –
              </Button>
              <span className="w-14 text-center text-sm font-medium tabular-nums">
                {fontSize}
                <span className="ml-1 text-xs text-muted-foreground">px</span>
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                disabled={fontSize >= 20}
                onClick={() => set({ terminal_font_size: String(Math.min(20, fontSize + 1)) })}
              >
                +
              </Button>
            </div>
          </Row>
          <Row label="Font Family">
            <Select
              value={settings.terminal_font_family}
              onValueChange={(v) => set({ terminal_font_family: v })}
            >
              <SelectTrigger className="h-9 w-44 rounded-xl bg-muted text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Cursor Style">
            <SegmentedControl
              value={settings.terminal_cursor_style}
              onChange={(v) => set({ terminal_cursor_style: v })}
              options={[
                { value: "block", label: "Block" },
                { value: "underline", label: "Under" },
                { value: "bar", label: "Bar" },
              ]}
              className="w-52"
            />
          </Row>
          <Row label="Cursor Blink">
            <Switch
              checked={settings.terminal_cursor_blink === "true"}
              onCheckedChange={(v) => set({ terminal_cursor_blink: String(v) })}
            />
          </Row>
          <Row label="Scrollback Lines">
            <div className="flex flex-col items-end gap-0.5">
              <Input
                type="number"
                min={1000}
                max={50000}
                defaultValue={scrollback}
                onBlur={(e) => {
                  const next = Math.max(1000, Math.min(50000, Number(e.target.value) || 5000));
                  set({ terminal_scrollback: String(next) });
                }}
                className="h-9 w-28 rounded-xl border-input bg-muted text-right text-sm shadow-none"
              />
              <span className="text-[10px] text-muted-foreground">1,000 – 50,000</span>
            </div>
          </Row>
          <Row label="Terminal Theme">
            <Select
              value={settings.terminal_theme}
              onValueChange={(v) => set({ terminal_theme: v })}
            >
              <SelectTrigger className="h-9 w-40 rounded-xl bg-muted text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_THEMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Group>

        <SectionHeader>Confirmations</SectionHeader>
        <Group>
          <Row label="Confirm before killing session">
            <Switch
              checked={settings.confirm_kill_session === "true"}
              onCheckedChange={(v) => set({ confirm_kill_session: String(v) })}
            />
          </Row>
          <Row label="Confirm before killing window">
            <Switch
              checked={settings.confirm_kill_window === "true"}
              onCheckedChange={(v) => set({ confirm_kill_window: String(v) })}
            />
          </Row>
          <Row label="Confirm before deleting server">
            <Switch
              checked={settings.confirm_delete_server === "true"}
              onCheckedChange={(v) => set({ confirm_delete_server: String(v) })}
            />
          </Row>
          <Row label="Confirm before detaching">
            <Switch
              checked={settings.confirm_detach === "true"}
              onCheckedChange={(v) => set({ confirm_detach: String(v) })}
            />
          </Row>
        </Group>

        <SectionHeader>About</SectionHeader>
        <Group>
          <Row label="Version" description="Nomad">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              0.1.0
            </span>
          </Row>
          <Row label="GitHub" description="Source code">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary"
            >
              Open
            </a>
          </Row>
          <Row label="Reset" description="Restore default settings">
            <button
              type="button"
              className="text-sm text-destructive/70 underline-offset-4 hover:text-destructive hover:underline"
              onClick={async () => {
                await update({
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
                });
                toast.success("Settings reset");
              }}
            >
              Reset
            </button>
          </Row>
        </Group>
      </main>
    </div>
  );
}
