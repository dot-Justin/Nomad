"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn("px-5 pb-8 pt-6 sm:max-w-lg sm:rounded-3xl", className)}
      >
        {title ? (
          <SheetHeader className="mb-4 mt-2">
            <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          </SheetHeader>
        ) : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
