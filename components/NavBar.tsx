"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, Gear } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

type NavBarProps = {
  className?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  title?: React.ReactNode;
};

export function NavBar({ className, leftSlot, rightSlot, title }: NavBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between bg-background/85 px-5 pt-safe backdrop-blur",
        "h-16 border-b border-border/60",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leftSlot ?? (
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <Compass weight="fill" size={22} className="text-primary" />
            <span className="text-base font-semibold tracking-tight">Nomad</span>
          </Link>
        )}
        {title}
      </div>
      <div className="flex items-center gap-1">
        {rightSlot ?? (
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Gear weight="fill" size={20} />
          </Link>
        )}
      </div>
    </header>
  );
}
