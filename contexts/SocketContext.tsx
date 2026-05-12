"use client";

import * as React from "react";
import { io, Socket } from "socket.io-client";

export type TmuxSession = {
  name: string;
  windows: number;
  activity: number;
  attached: boolean;
};

export type TmuxWindow = {
  index: number;
  name: string;
  active: boolean;
  panes: number;
};

export type TmuxPane = {
  index: number;
  active: boolean;
  width: number;
  height: number;
};

export type SocketStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "session_picking"
  | "attached"
  | "reconnecting"
  | "disconnected"
  | "error";

export type SocketState = {
  status: SocketStatus;
  serverId: string | null;
  sessions: TmuxSession[];
  windows: TmuxWindow[];
  panes: TmuxPane[];
  attachedSession: string | null;
  errorMessage: string | null;
};

type SocketAction =
  | { type: "CONNECT_REQUEST"; serverId: string }
  | { type: "CONNECTING" }
  | { type: "CONNECTED" }
  | { type: "SESSIONS_RECEIVED"; sessions: TmuxSession[] }
  | { type: "WINDOWS_RECEIVED"; windows: TmuxWindow[] }
  | { type: "PANES_RECEIVED"; panes: TmuxPane[] }
  | { type: "SESSION_RENAMED"; oldName: string; newName: string }
  | { type: "ATTACHED"; sessionName: string }
  | { type: "RECONNECTING" }
  | { type: "DISCONNECTED" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

const initialState: SocketState = {
  status: "idle",
  serverId: null,
  sessions: [],
  windows: [],
  panes: [],
  attachedSession: null,
  errorMessage: null,
};

function reducer(state: SocketState, action: SocketAction): SocketState {
  switch (action.type) {
    case "CONNECT_REQUEST":
      return {
        ...initialState,
        serverId: action.serverId,
        status: "connecting",
      };
    case "CONNECTING":
      return { ...state, status: "connecting", errorMessage: null };
    case "CONNECTED":
      return { ...state, status: "connected", errorMessage: null };
    case "SESSIONS_RECEIVED":
      return {
        ...state,
        sessions: action.sessions,
        status:
          state.status === "attached" || state.status === "reconnecting"
            ? state.status
            : "session_picking",
      };
    case "WINDOWS_RECEIVED":
      return { ...state, windows: action.windows };
    case "ATTACHED":
      return {
        ...state,
        status: "attached",
        attachedSession: action.sessionName,
        errorMessage: null,
      };
    case "PANES_RECEIVED":
      return { ...state, panes: action.panes };
    case "SESSION_RENAMED":
      return {
        ...state,
        attachedSession:
          state.attachedSession === action.oldName ? action.newName : state.attachedSession,
        sessions: state.sessions.map((s) =>
          s.name === action.oldName ? { ...s, name: action.newName } : s
        ),
      };
    case "RECONNECTING":
      return { ...state, status: "reconnecting" };
    case "DISCONNECTED":
      return { ...state, status: "disconnected" };
    case "ERROR":
      return { ...state, status: "error", errorMessage: action.message };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

type SocketContextValue = {
  socket: Socket | null;
  state: SocketState;
  connectServer: (serverId: string) => void;
  disconnectServer: () => void;
  emit: <T = unknown>(event: string, payload?: T) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
};

const SocketContext = React.createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const socketRef = React.useRef<Socket | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("server:connecting", () => dispatch({ type: "CONNECTING" }));
    socket.on("server:connected", () => dispatch({ type: "CONNECTED" }));
    socket.on("server:disconnected", () => dispatch({ type: "DISCONNECTED" }));
    socket.on("server:error", (payload: { message?: string }) =>
      dispatch({ type: "ERROR", message: payload?.message || "Connection error" })
    );
    socket.on("sessions:list", (payload: { sessions: TmuxSession[] }) =>
      dispatch({ type: "SESSIONS_RECEIVED", sessions: payload?.sessions || [] })
    );
    socket.on("windows:list", (payload: { windows: TmuxWindow[] }) =>
      dispatch({ type: "WINDOWS_RECEIVED", windows: payload?.windows || [] })
    );
    socket.on("session:attached", (payload: { sessionName: string }) =>
      dispatch({ type: "ATTACHED", sessionName: payload?.sessionName })
    );
    socket.on("reconnecting", () => dispatch({ type: "RECONNECTING" }));
    socket.on("panes:list", (payload: { panes: TmuxPane[] }) =>
      dispatch({ type: "PANES_RECEIVED", panes: payload?.panes || [] })
    );
    socket.on("session:renamed", (payload: { oldName: string; newName: string }) => {
      if (payload?.oldName && payload?.newName) {
        dispatch({ type: "SESSION_RENAMED", oldName: payload.oldName, newName: payload.newName });
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = React.useCallback(
    <T,>(event: string, payload?: T) => {
      socketRef.current?.emit(event, payload || {});
    },
    []
  );

  const on = React.useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.on(event, handler);
      return () => {
        socketRef.current?.off(event, handler);
      };
    },
    []
  );

  const connectServer = React.useCallback(
    (serverId: string) => {
      dispatch({ type: "CONNECT_REQUEST", serverId });
      emit("connect:server", { serverId });
    },
    [emit]
  );

  const disconnectServer = React.useCallback(() => {
    emit("disconnect:server");
    dispatch({ type: "RESET" });
  }, [emit]);

  const value = React.useMemo(
    () => ({
      socket: socketRef.current,
      state,
      connectServer,
      disconnectServer,
      emit,
      on,
    }),
    [state, connectServer, disconnectServer, emit, on]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  const ctx = React.useContext(SocketContext);
  if (!ctx) throw new Error("useSocketContext must be used within SocketProvider");
  return ctx;
}
