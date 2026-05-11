"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

export function NewSessionInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const { settings } = useSettings();
  const [name, setName] = React.useState(settings.default_session_name || "nomad");

  return (
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))}
        className="h-11 flex-1 rounded-xl border-input bg-muted px-4 text-sm shadow-none"
        placeholder={settings.default_session_name || "nomad"}
        autoFocus
      />
      <Button onClick={() => name && onSubmit(name)} className="h-11 rounded-full px-4">
        Create
      </Button>
      {onCancel ? (
        <Button variant="ghost" className="h-11 rounded-full" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
