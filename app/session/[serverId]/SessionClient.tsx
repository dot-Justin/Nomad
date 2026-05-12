"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, SignOut, StackSimple, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ActionBar } from "@/components/ActionBar";
import { WindowTabs } from "@/components/WindowTabs";
import { SessionSheet } from "@/components/SessionSheet";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { ReconnectBanner } from "@/components/ReconnectBanner";
import { Spinner } from "@/components/Spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useSocket } from "@/hooks/useSocket";
import { useSettings } from "@/hooks/useSettings";
import { useHaptics } from "@/hooks/useHaptics";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

type SessionClientProps = {
  serverId: string;
};

type TermApi = {
  findNext: (q: string) => void;
  findPrevious: (q: string) => void;
  scrollToBottom: () => void;
  clearSelection: () => void;
};

export default function SessionClient({ serverId }: SessionClientProps) {
  const router = useRouter();
  const { state, connectServer, disconnectServer, emit } = useSocket();
  const { settings, update: updateSettings } = useSettings();
  const haptics = useHaptics();

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [scrollMode, setScrollMode] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [confirmDetach, setConfirmDetach] = React.useState(false);
  const [confirmKill, setConfirmKill] = React.useState(false);
  const [confirmKillSession, setConfirmKillSession] = React.useState(false);
  const [killSessionName, setKillSessionName] = React.useState<string | null>(null);
  const [bottomOffset, setBottomOffset] = React.useState(0);

  const termApiRef = React.useRef<TermApi | null>(null);

  // Connect once when mounted.
  React.useEffect(() => {
    connectServer(serverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  // Watch state for picker / errors / connect-success notifications.
  React.useEffect(() => {
    if (state.status === "session_picking") {
      setPickerOpen(true);
    }
    if (state.status === "attached") {
      setPickerOpen(false);
      haptics.success();
    }
    if (state.status === "error" && state.errorMessage) {
      toast.error(state.errorMessage);
      haptics.error();
    }
    if (state.status === "disconnected") {
      router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.errorMessage]);

  // Poll windows while attached.
  React.useEffect(() => {
    if (state.status !== "attached") return;
    emit("list:windows");
    const id = setInterval(() => emit("list:windows"), 2000);
    return () => clearInterval(id);
  }, [state.status, emit]);

  // Visual viewport for action bar offset.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const calc = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setBottomOffset(Math.max(0, offset));
    };
    calc();
    window.visualViewport.addEventListener("resize", calc);
    window.visualViewport.addEventListener("scroll", calc);
    return () => {
      window.visualViewport?.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("scroll", calc);
    };
  }, []);

  const detachAndExit = React.useCallback(() => {
    haptics.detach();
    emit("detach");
    disconnectServer();
    router.push("/");
  }, [emit, disconnectServer, router, haptics]);

  const requestDetach = React.useCallback(() => {
    if (settings.confirm_detach === "true") setConfirmDetach(true);
    else detachAndExit();
  }, [settings.confirm_detach, detachAndExit]);

  const onAttach = React.useCallback(
    (name: string) => {
      emit("attach:session", { sessionName: name });
    },
    [emit]
  );

  const onCreate = React.useCallback(
    (name: string) => {
      emit("new:session", { sessionName: name });
    },
    [emit]
  );

  const onScrollEnter = React.useCallback(() => {
    setScrollMode(true);
    emit("scroll:mode");
  }, [emit]);

  const onScrollExit = React.useCallback(() => {
    setScrollMode(false);
    setSearchOpen(false);
    emit("scroll:exit");
    termApiRef.current?.scrollToBottom();
    termApiRef.current?.clearSelection();
  }, [emit]);

  const onScrollFind = React.useCallback(() => {
    setSearchOpen((s) => !s);
  }, []);

  function backHandler() {
    if (state.status === "attached") {
      requestDetach();
    } else {
      disconnectServer();
      router.push("/");
    }
  }

  const killWindowConfirm = React.useCallback(() => {
    const active = state.windows.find((w) => w.active);
    if (settings.confirm_kill_window === "true") {
      setConfirmKill(true);
    } else {
      emit("kill:window", { windowIndex: active?.index });
    }
  }, [emit, settings.confirm_kill_window, state.windows]);

  const sessionTitle = state.attachedSession || "session";

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-3 pt-safe">
        <div className="flex h-14 items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={backHandler}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-accent"
          >
            <ArrowLeft weight="bold" size={20} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{sessionTitle}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {state.status}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Sessions"
            onClick={() => {
              emit("list:sessions");
              setPickerOpen(true);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <StackSimple weight="fill" size={20} />
          </button>
          <button
            type="button"
            aria-label="Disconnect"
            onClick={requestDetach}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <SignOut weight="fill" size={20} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        <ReconnectBanner visible={state.status === "reconnecting"} />
      </AnimatePresence>

      <WindowTabs
        windows={state.windows}
        onSelect={(w) => {
          if (!w.active) {
            emit("select:window", { index: w.index });
          }
        }}
        onNew={() => emit("new:window")}
        onKillWindow={(index) => emit("kill:window", { windowIndex: index })}
        onRenameWindow={(index, name) =>
          emit("rename:window", { index, name })
        }
      />

      <div className="relative flex-1 px-3 pb-28">
        {state.status === "connecting" || state.status === "idle" ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <Spinner size={28} />
              <span className="text-sm">Connecting…</span>
            </div>
          </div>
        ) : (
          <Terminal
            scrollMode={scrollMode}
            onTermReady={(api) => {
              termApiRef.current = api;
            }}
          />
        )}
      </div>

      {state.status === "attached" || state.status === "reconnecting" ? (
        <>
          {searchOpen ? (
            <div
              className="fixed inset-x-0 z-30 flex justify-center px-4"
              style={{ bottom: 80 + bottomOffset }}
            >
              <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-bar">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.shiftKey) termApiRef.current?.findPrevious(searchQuery);
                      else termApiRef.current?.findNext(searchQuery);
                    } else if (e.key === "Escape") {
                      setSearchOpen(false);
                    }
                  }}
                  className="h-9 flex-1 rounded-full border-0 bg-muted px-4 text-sm shadow-none"
                  placeholder="Search…"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                >
                  <X weight="bold" size={16} />
                </Button>
              </div>
            </div>
          ) : null}
          <ActionBar
            mode={scrollMode ? "scroll" : "default"}
            onNewWindow={() => emit("new:window")}
            onKillWindow={killWindowConfirm}
            onPrevWindow={() => emit("prev:window")}
            onNextWindow={() => emit("next:window")}
            onScrollMode={onScrollEnter}
            onDetach={requestDetach}
            onScrollUp={() => emit("scroll:up")}
            onScrollDown={() => emit("scroll:down")}
            onScrollFind={onScrollFind}
            onScrollExit={onScrollExit}
            bottomOffset={bottomOffset}
          />
        </>
      ) : null}

      <SessionSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sessions={state.sessions}
        attachedSession={state.attachedSession}
        onAttach={onAttach}
        onCreate={onCreate}
        onKill={(name) => {
          if (settings.confirm_kill_session === "true") {
            setKillSessionName(name);
            setConfirmKillSession(true);
          } else {
            haptics.kill();
            emit("kill:session", { sessionName: name });
          }
        }}
        onRename={(oldName, newName) => {
          emit("rename:session", { oldName, newName });
        }}
      />

      <ConfirmSheet
        open={confirmDetach}
        onOpenChange={setConfirmDetach}
        title="Detach from session?"
        message="Your tmux session will keep running on the server."
        confirmLabel="Detach"
        destructive={false}
        onConfirm={async (skipNext) => {
          if (skipNext && settings.confirm_detach === "true") {
            await updateSettings({ confirm_detach: "false" });
          }
          detachAndExit();
        }}
      />

      <ConfirmSheet
        open={confirmKill}
        onOpenChange={setConfirmKill}
        title="Kill window?"
        message="The current window will be closed."
        confirmLabel="Kill"
        onConfirm={async (skipNext) => {
          if (skipNext && settings.confirm_kill_window === "true") {
            await updateSettings({ confirm_kill_window: "false" });
          }
          haptics.kill();
          const active = state.windows.find((w) => w.active);
          emit("kill:window", { windowIndex: active?.index });
        }}
      />

      <ConfirmSheet
        open={confirmKillSession}
        onOpenChange={(open) => {
          setConfirmKillSession(open);
          if (!open) setKillSessionName(null);
        }}
        title="Kill session?"
        message={`"${killSessionName}" and all its windows will be permanently closed.`}
        confirmLabel="Kill Session"
        onConfirm={async (skipNext) => {
          if (skipNext && settings.confirm_kill_session === "true") {
            await updateSettings({ confirm_kill_session: "false" });
          }
          haptics.kill();
          if (killSessionName) emit("kill:session", { sessionName: killSessionName });
          setKillSessionName(null);
        }}
      />
    </div>
  );
}
