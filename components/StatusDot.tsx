import { cn } from "@/lib/utils";

export function StatusDot({
  online,
  className,
}: {
  online: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        online
          ? "bg-primary shadow-[0_0_10px_rgba(255,95,0,0.7)]"
          : "bg-muted-foreground/40",
        className
      )}
    />
  );
}
