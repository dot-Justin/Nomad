"use client";

import * as React from "react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ServerForm, ServerFormValues } from "@/components/ServerForm";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { ServerSummary } from "@/components/ServerCard";
import { useHaptics } from "@/hooks/useHaptics";
import { useSettings } from "@/hooks/useSettings";

type EditServerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: ServerSummary | null;
  onUpdated: () => void;
  onDeleted: () => void;
};

export function EditServerSheet({
  open,
  onOpenChange,
  server,
  onUpdated,
  onDeleted,
}: EditServerSheetProps) {
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const haptics = useHaptics();
  const { settings, update: updateSettings } = useSettings();

  async function submit(values: ServerFormValues) {
    if (!server) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data?.errors && data.errors.join(", ")) || data?.error || "Failed to update"
        );
      }
      haptics.confirm();
      toast.success("Server updated");
      onUpdated();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update";
      toast.error(msg);
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(skipNext: boolean) {
    if (!server) return;
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      if (skipNext && settings.confirm_delete_server === "true") {
        await updateSettings({ confirm_delete_server: "false" });
      }
      haptics.kill();
      toast.success("Server deleted");
      onDeleted();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete";
      toast.error(msg);
      haptics.error();
    }
  }

  function requestDelete() {
    if (settings.confirm_delete_server === "true") {
      setConfirmDelete(true);
    } else {
      doDelete(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto px-5 pb-10 pt-6 sm:max-w-lg sm:rounded-3xl"
          aria-describedby={undefined}
        >
          <SheetHeader className="mb-4 mt-2">
            <SheetTitle className="text-xl font-semibold">Edit Server</SheetTitle>
          </SheetHeader>
          {server ? (
            <ServerForm
              key={server.id}
              initial={server}
              onSubmit={submit}
              saving={saving}
              submitLabel="Save Changes"
              credentialPlaceholder="••••••••  (leave blank to keep)"
              extraFooter={
                <Button
                  variant="destructive"
                  className="mt-3 h-12 w-full rounded-full"
                  onClick={requestDelete}
                  type="button"
                >
                  Delete Server
                </Button>
              }
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${server?.name ?? "server"}?`}
        message="This will permanently remove the saved server and credentials."
        confirmLabel="Delete"
        onConfirm={doDelete}
        destructive
      />
    </>
  );
}
