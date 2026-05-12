"use client";

import * as React from "react";
import { Eye, EyeSlash, Globe, Key, Lock, User } from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Spinner } from "@/components/Spinner";
import { ServerSummary } from "@/components/ServerCard";

export type ServerFormValues = {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  credential: string;
};

type ServerFormProps = {
  initial?: Partial<ServerSummary>;
  saving?: boolean;
  submitLabel?: string;
  credentialPlaceholder?: string;
  onSubmit: (values: ServerFormValues) => void | Promise<void>;
  extraFooter?: React.ReactNode;
};

const inputClass =
  "h-12 rounded-xl border-input bg-muted px-4 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring";

export function ServerForm({
  initial,
  saving,
  submitLabel = "Save Server",
  credentialPlaceholder,
  onSubmit,
  extraFooter,
}: ServerFormProps) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [host, setHost] = React.useState(initial?.host ?? "");
  const [port, setPort] = React.useState<string>(String(initial?.port ?? 22));
  const [username, setUsername] = React.useState(initial?.username ?? "");
  const [authType, setAuthType] = React.useState<"password" | "key">(
    (initial?.auth_type as "password" | "key") || "password"
  );
  const [credential, setCredential] = React.useState("");
  const [showCredential, setShowCredential] = React.useState(false);

  const valid =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    username.trim().length > 0 &&
    Number(port) > 0 &&
    Number(port) < 65536 &&
    (initial ? true : credential.length > 0);

  const handleSubmit = () => {
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      auth_type: authType,
      credential,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="srv-name" className="text-sm font-medium text-foreground">
          Display Name
        </Label>
        <Input
          id="srv-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-homelab"
          className={inputClass}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-[1fr_84px] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="srv-host" className="text-sm font-medium text-foreground">
            Hostname or IP
          </Label>
          <div className="relative">
            <Globe weight="fill" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="srv-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="server.local"
              className={`${inputClass} pl-9`}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="srv-port" className="text-sm font-medium text-foreground">
            Port
          </Label>
          <Input
            id="srv-port"
            inputMode="numeric"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="22"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="srv-user" className="text-sm font-medium text-foreground">
          Username
        </Label>
        <div className="relative">
          <User weight="fill" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="srv-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="root"
            className={`${inputClass} pl-9`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground">
          Authentication
        </Label>
        <SegmentedControl
          value={authType}
          onChange={(v) => setAuthType(v)}
          options={[
            {
              value: "password",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Lock weight="fill" size={12} /> Password
                </span>
              ),
            },
            {
              value: "key",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Key weight="fill" size={12} /> SSH Key
                </span>
              ),
            },
          ]}
        />
      </div>

      {authType === "password" ? (
        <div className="space-y-1.5">
          <Label htmlFor="srv-pass" className="text-sm font-medium text-foreground">
            Password
          </Label>
          <div className="relative">
            <Input
              id="srv-pass"
              type={showCredential ? "text" : "password"}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder={credentialPlaceholder ?? "••••••••"}
              className={`${inputClass} pr-11`}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowCredential((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={showCredential ? "Hide password" : "Show password"}
            >
              {showCredential ? (
                <EyeSlash weight="fill" size={16} />
              ) : (
                <Eye weight="fill" size={16} />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="srv-key" className="text-sm font-medium text-foreground">
            Private Key
          </Label>
          <Textarea
            id="srv-key"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder={credentialPlaceholder ?? "-----BEGIN OPENSSH PRIVATE KEY-----"}
            className="min-h-40 rounded-xl border-input bg-muted px-4 py-3 font-mono text-xs shadow-none"
          />
        </div>
      )}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!valid || saving}
        className="h-12 w-full rounded-full"
      >
        {saving ? <Spinner /> : submitLabel}
      </Button>

      {extraFooter}
    </div>
  );
}
