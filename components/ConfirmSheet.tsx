"use client";

import * as React from "react";

import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useHaptics } from "@/hooks/useHaptics";

type ConfirmSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (skipNext: boolean) => void | Promise<void>;
  destructive?: boolean;
  showSkip?: boolean;
};

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  destructive = true,
  showSkip = true,
}: ConfirmSheetProps) {
  const [skip, setSkip] = React.useState(false);
  const haptics = useHaptics();
  const lastOpen = React.useRef(false);

  React.useEffect(() => {
    if (open && !lastOpen.current) {
      haptics.warning();
    }
    lastOpen.current = open;
    if (!open) setSkip(false);
  }, [open, haptics]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-5 pb-8 pt-0" onDismiss={() => onOpenChange(false)}>
        <div className="mx-auto max-w-md space-y-4">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {message ? <SheetDescription>{message}</SheetDescription> : null}

          {showSkip ? (
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={skip}
                onCheckedChange={(v) => setSkip(v === true)}
              />
              <span>Don&apos;t ask again</span>
            </Label>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant={destructive ? "destructive" : "default"}
              className="h-12 rounded-full"
              onClick={async () => {
                await onConfirm(skip);
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
