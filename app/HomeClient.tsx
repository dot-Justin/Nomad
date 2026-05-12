"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

import { NavBar } from "@/components/NavBar";
import { ServerCard, ServerSummary } from "@/components/ServerCard";
import { EmptyState } from "@/components/EmptyState";
import { AddServerSheet } from "@/components/AddServerSheet";
import { EditServerSheet } from "@/components/EditServerSheet";
import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { useHaptics } from "@/hooks/useHaptics";

export default function HomeClient() {
  const router = useRouter();
  const haptics = useHaptics();
  const [servers, setServers] = React.useState<ServerSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ServerSummary | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/servers", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load servers");
      const data = await res.json();
      setServers(data.servers || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load servers";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const onTap = React.useCallback(
    (server: ServerSummary) => {
      haptics.tap();
      router.push(`/session/${server.id}`);
    },
    [router, haptics]
  );

  const onDelete = React.useCallback(
    async (server: ServerSummary) => {
      haptics.kill();
      try {
        const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete server");
        await refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to delete server";
        toast.error(msg);
      }
    },
    [haptics, refresh]
  );

  return (
    <div className="relative min-h-screen pb-32">

      <div className="relative">
        <NavBar />
        <main className="mx-auto max-w-2xl px-5 pt-4">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.05 }}
            className="mb-6 text-3xl font-bold tracking-tight text-foreground"
          >
            Servers
          </motion.h1>

          {loading ? (
            <div className="mt-20 flex justify-center text-muted-foreground">
              <Spinner size={24} />
            </div>
          ) : servers.length === 0 ? (
            <EmptyState onAdd={() => setAddOpen(true)} />
          ) : (
            <motion.ul
              initial="initial"
              animate="animate"
              transition={{ staggerChildren: 0.05 }}
              className="flex flex-col gap-3"
            >
              <AnimatePresence>
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onTap={onTap}
                    onEdit={setEditing}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </main>
      </div>

      <Button
        size="icon"
        aria-label="Add server"
        onClick={() => {
          haptics.tap();
          setAddOpen(true);
        }}
        className="fixed bottom-8 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-md"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus weight="fill" size={24} />
      </Button>

      <AddServerSheet open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />
      <EditServerSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        server={editing}
        onUpdated={refresh}
        onDeleted={refresh}
      />
    </div>
  );
}
