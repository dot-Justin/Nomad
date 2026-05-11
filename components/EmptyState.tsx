"use client";

import { Compass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-sm flex-col items-center justify-center rounded-3xl border border-border/60 bg-card/40 p-8 text-center shadow-sm">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass weight="fill" size={32} />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No servers yet</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Add your first server to start exploring.
      </p>
      {onAdd ? (
        <Button onClick={onAdd} className="mt-6 h-11 rounded-full px-6 shadow-orange">
          Add Server
        </Button>
      ) : null}
    </div>
  );
}
