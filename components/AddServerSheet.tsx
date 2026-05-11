"use client";

import * as React from "react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ServerForm, ServerFormValues } from "@/components/ServerForm";
import { useHaptics } from "@/hooks/useHaptics";

type AddServerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function AddServerSheet({ open, onOpenChange, onCreated }: AddServerSheetProps) {
  const [saving, setSaving] = React.useState(false);
  const haptics = useHaptics();

  async function submit(values: ServerFormValues) {
    setSaving(true);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data?.errors && data.errors.join(", ")) || data?.error || "Failed to create server"
        );
      }
      haptics.confirm();
      toast.success("Server saved");
      onCreated();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create server";
      toast.error(msg);
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto px-5 pb-10 pt-6 sm:max-w-lg sm:rounded-3xl"
      >
        <SheetHeader className="mb-4 mt-2">
          <SheetTitle className="text-xl font-semibold">Add Server</SheetTitle>
        </SheetHeader>
        <ServerForm onSubmit={submit} saving={saving} submitLabel="Save Server" />
      </SheetContent>
    </Sheet>
  );
}
