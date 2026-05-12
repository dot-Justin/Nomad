"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CaretRight, Trash } from "@phosphor-icons/react";

import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import { springs } from "@/lib/animations";
import { useHaptics } from "@/hooks/useHaptics";

export type ServerSummary = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  last_connected: number | null;
  created_at: number;
  updated_at: number;
};

function relativeTime(ts: number | null) {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 0) return "Just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString();
}

function isOnline(ts: number | null) {
  if (!ts) return false;
  return Date.now() - ts < 1000 * 60 * 30;
}

const DELETE_THRESHOLD = -88;
const DRAG_MAX = 0;
const DRAG_MIN = -110;

type ServerCardProps = {
  server: ServerSummary;
  onTap: (server: ServerSummary) => void;
  onEdit: (server: ServerSummary) => void;
  onDelete?: (server: ServerSummary) => void;
};

export function ServerCard({ server, onTap, onEdit, onDelete }: ServerCardProps) {
  const haptics = useHaptics();
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [0, DELETE_THRESHOLD], [0, 1]);
  const deleteScale = useTransform(x, [0, DELETE_THRESHOLD], [0.7, 1]);
  const hasFiredHaptic = React.useRef(false);

  React.useEffect(() => {
    return x.on("change", (latest) => {
      if (latest <= DELETE_THRESHOLD && !hasFiredHaptic.current) {
        hasFiredHaptic.current = true;
        haptics.warning();
      } else if (latest > DELETE_THRESHOLD) {
        hasFiredHaptic.current = false;
      }
    });
  }, [x, haptics]);

  const snapBack = React.useCallback(() => {
    animate(x, 0, { type: "spring", stiffness: 400, damping: 28, mass: 0.8 });
  }, [x]);

  const handleDragEnd = React.useCallback(() => {
    if (x.get() <= DELETE_THRESHOLD) {
      if (onDelete) {
        animate(x, DRAG_MIN * 3, { duration: 0.15, ease: "easeIn" });
        setTimeout(() => onDelete(server), 150);
      } else {
        snapBack();
      }
    } else {
      snapBack();
    }
  }, [x, server, onDelete, snapBack]);

  return (
    <motion.div
      layout
      variants={{
        initial: { y: 12, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
      }}
      transition={springs.quick}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Delete background */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-2xl bg-destructive pr-5"
        style={{ opacity: deleteOpacity }}
      >
        <motion.div style={{ scale: deleteScale }} className="flex flex-col items-center gap-0.5">
          <Trash weight="fill" size={20} className="text-destructive-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive-foreground">
            Delete
          </span>
        </motion.div>
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: DRAG_MIN, right: DRAG_MAX }}
        dragElastic={{ left: 0.08, right: 0 }}
        style={{ x }}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.98 }}
        transition={springs.quick}
      >
        <Card
          className="flex cursor-pointer items-center gap-4 rounded-2xl border-border bg-card px-4 py-4 shadow-sm hover:shadow-md"
          onClick={() => {
            if (Math.abs(x.get()) > 5) {
              snapBack();
              return;
            }
            haptics.tap();
            onTap(server);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onEdit(server);
          }}
        >
          <StatusDot online={isOnline(server.last_connected)} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold leading-tight text-foreground">
              {server.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {server.username}@{server.host}
              {server.port !== 22 ? `:${server.port}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 text-right text-[11px] text-muted-foreground">
            <div>
              <div className="leading-none">{relativeTime(server.last_connected)}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(server);
                }}
                className="mt-1 text-[10px] uppercase tracking-widest text-primary/80 hover:text-primary"
              >
                Edit
              </button>
            </div>
            <CaretRight weight="fill" size={14} />
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
