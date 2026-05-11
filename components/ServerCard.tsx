"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CaretRight } from "@phosphor-icons/react";

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
  return Date.now() - ts < 1000 * 60 * 30; // 30 min window
}

type ServerCardProps = {
  server: ServerSummary;
  onTap: (server: ServerSummary) => void;
  onEdit: (server: ServerSummary) => void;
};

export function ServerCard({ server, onTap, onEdit }: ServerCardProps) {
  const haptics = useHaptics();

  return (
    <motion.div
      layout
      variants={{
        initial: { y: 12, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { opacity: 0 },
      }}
      transition={springs.quick}
      whileTap={{ scale: 0.97 }}
    >
      <Card
        className="flex cursor-pointer items-center gap-4 rounded-2xl border-border bg-card px-4 py-4 shadow-sm hover:shadow-md"
        onClick={() => {
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
  );
}
