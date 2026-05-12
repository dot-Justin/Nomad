import { describe, it, expect } from "vitest";
import { tmux, parseSessions, parseWindows, parsePanes, shellEscape, safeName } from "../lib/tmux.js";

describe("shellEscape", () => {
  it("wraps value in single quotes", () => {
    expect(shellEscape("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it("returns empty string literal for null", () => {
    expect(shellEscape(null)).toBe("''");
  });

  it("returns empty string literal for undefined", () => {
    expect(shellEscape(undefined)).toBe("''");
  });

  it("handles names with spaces", () => {
    expect(shellEscape("my session")).toBe("'my session'");
  });
});

describe("safeName", () => {
  it("allows alphanumeric, underscore, hyphen, dot", () => {
    expect(safeName("my-session_1.0")).toBe("my-session_1.0");
  });

  it("strips disallowed characters", () => {
    expect(safeName("bad name!@#")).toBe("badname");
  });

  it("handles empty string", () => {
    expect(safeName("")).toBe("");
  });

  it("handles null", () => {
    expect(safeName(null)).toBe("");
  });
});

describe("tmux.listSessions", () => {
  it("returns a valid tmux command", () => {
    const cmd = tmux.listSessions();
    expect(cmd).toContain("tmux list-sessions");
    expect(cmd).toContain("#{session_name}");
    expect(cmd).toContain("#{session_windows}");
    expect(cmd).toContain("#{session_activity}");
    expect(cmd).toContain("#{session_attached}");
  });
});

describe("tmux.listWindows", () => {
  it("includes session name shell-escaped", () => {
    const cmd = tmux.listWindows("my-session");
    expect(cmd).toContain("'my-session'");
    expect(cmd).toContain("tmux list-windows");
  });
});

describe("tmux.killSession", () => {
  it("targets correct session", () => {
    const cmd = tmux.killSession("work");
    expect(cmd).toBe("tmux kill-session -t 'work'");
  });
});

describe("tmux.killWindow", () => {
  it("targets session:index", () => {
    const cmd = tmux.killWindow("work", 2);
    expect(cmd).toBe("tmux kill-window -t 'work':2");
  });

  it("throws on non-finite index", () => {
    expect(() => tmux.killWindow("work", NaN)).toThrow("invalid window index");
  });
});

describe("tmux.renameSession", () => {
  it("generates correct rename command", () => {
    const cmd = tmux.renameSession("old", "new");
    expect(cmd).toBe("tmux rename-session -t 'old' 'new'");
  });

  it("escapes single quotes in session names", () => {
    const cmd = tmux.renameSession("it's", "new");
    expect(cmd).toContain("it'\\''s");
  });
});

describe("tmux.renameWindow", () => {
  it("generates correct rename command", () => {
    const cmd = tmux.renameWindow("work", 1, "editor");
    expect(cmd).toBe("tmux rename-window -t 'work':1 'editor'");
  });
});

describe("tmux.listPanes", () => {
  it("targets session:index", () => {
    const cmd = tmux.listPanes("work", 0);
    expect(cmd).toContain("'work':0");
    expect(cmd).toContain("#{pane_index}");
  });

  it("throws on non-finite window index", () => {
    expect(() => tmux.listPanes("work", NaN)).toThrow("invalid window index");
  });
});

describe("parseSessions", () => {
  it("parses typical output", () => {
    const stdout = "work|2|1715500000|0\nnomad|1|1715499000|1\n";
    const sessions = parseSessions(stdout);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({
      name: "work",
      windows: 2,
      activity: 1715500000,
      attached: false,
    });
    expect(sessions[1]).toEqual({
      name: "nomad",
      windows: 1,
      activity: 1715499000,
      attached: true,
    });
  });

  it("returns empty array for empty stdout", () => {
    expect(parseSessions("")).toEqual([]);
    expect(parseSessions(null)).toEqual([]);
    expect(parseSessions(undefined)).toEqual([]);
  });

  it("filters blank lines", () => {
    const stdout = "\nwork|1|1715500000|0\n\n";
    expect(parseSessions(stdout)).toHaveLength(1);
  });
});

describe("parseWindows", () => {
  it("parses typical output", () => {
    const stdout = "0|bash|1|1\n1|vim|0|2\n";
    const windows = parseWindows(stdout);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({ index: 0, name: "bash", active: true, panes: 1 });
    expect(windows[1]).toEqual({ index: 1, name: "vim", active: false, panes: 2 });
  });

  it("returns empty array for empty stdout", () => {
    expect(parseWindows("")).toEqual([]);
  });
});

describe("parsePanes", () => {
  it("parses typical output", () => {
    const stdout = "0|1|80|24\n1|0|80|12\n";
    const panes = parsePanes(stdout);
    expect(panes).toHaveLength(2);
    expect(panes[0]).toEqual({ index: 0, active: true, width: 80, height: 24 });
    expect(panes[1]).toEqual({ index: 1, active: false, width: 80, height: 12 });
  });

  it("returns empty array for empty stdout", () => {
    expect(parsePanes("")).toEqual([]);
  });
});
