import { describe, expect, it, vi, beforeEach } from "vitest";
import { openSandbox } from "./opensandbox.js";

// ---------------------------------------------------------------------------
// Mock the OpenSandbox SDK
// ---------------------------------------------------------------------------
const mockRun = vi.fn();
const mockWriteFiles = vi.fn();
const mockCreateDirectories = vi.fn();
const mockReadBytes = vi.fn();
const mockKill = vi.fn();

vi.mock("@alibaba-group/opensandbox", () => ({
  Sandbox: {
    create: vi.fn().mockImplementation(async () => ({
      id: "test-sandbox-123",
      commands: { run: mockRun },
      files: {
        createDirectories: mockCreateDirectories,
        writeFiles: mockWriteFiles,
        readBytes: mockReadBytes,
      },
      kill: mockKill,
    })),
  },
  ConnectionConfig: vi.fn(),
}));

describe("openSandbox()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue({
      exitCode: 0,
      logs: { stdout: [], stderr: [] },
    });
    mockWriteFiles.mockResolvedValue(undefined);
    mockCreateDirectories.mockResolvedValue(undefined);
    mockReadBytes.mockResolvedValue(new Uint8Array());
    mockKill.mockResolvedValue(undefined);
  });

  it("returns a SandboxProvider with tag 'isolated' and name 'opensandbox'", () => {
    const provider = openSandbox();
    expect(provider.tag).toBe("isolated");
    expect(provider.name).toBe("opensandbox");
  });

  it("has a create function", () => {
    const provider = openSandbox();
    expect(typeof provider.create).toBe("function");
  });

  it("accepts connection config options", () => {
    const provider = openSandbox({
      domain: "sandbox.example.com",
      apiKey: "my-api-key",
    });
    expect(provider.tag).toBe("isolated");
  });

  it("accepts sandbox creation options", () => {
    const provider = openSandbox({
      image: "ubuntu:22.04",
      timeoutSeconds: 1800,
    });
    expect(provider.tag).toBe("isolated");
  });

  it("accepts an env option", () => {
    const provider = openSandbox({ env: { MY_VAR: "value" } });
    expect(provider.tag).toBe("isolated");
    expect(provider.env).toEqual({ MY_VAR: "value" });
  });

  it("defaults env to empty object when not provided", () => {
    const provider = openSandbox();
    expect(provider.env).toEqual({});
  });

  it("accepts a snapshotId option", () => {
    const provider = openSandbox({ snapshotId: "snap-123" });
    expect(provider.tag).toBe("isolated");
  });

  // ---------------------------------------------------------------------------
  // exec() — stdin support
  // ---------------------------------------------------------------------------
  describe("exec() stdin support", () => {
    it("writes stdin to a temp file and pipes it to the command", async () => {
      const provider = openSandbox();
      const handle = await provider.create({ env: {} });

      await handle.exec("claude --print -p -", { stdin: "hello world" });

      // Should have written the stdin content to a temp file
      const writeCall = mockWriteFiles.mock.calls.find((call) =>
        call[0]?.some(
          (entry: { path: string; data: unknown }) =>
            entry.path.startsWith("/tmp/.sandcastle-stdin-") &&
            entry.data === "hello world",
        ),
      );
      expect(writeCall).toBeDefined();

      // The run command should include input redirection from the temp file
      const runCall = mockRun.mock.calls[0]!;
      expect(runCall[0]).toMatch(
        /claude --print -p - < \/tmp\/\.sandcastle-stdin-/,
      );
    });

    it("does not modify command when stdin is not provided", async () => {
      const provider = openSandbox();
      const handle = await provider.create({ env: {} });

      await handle.exec("echo hello");

      const runCall = mockRun.mock.calls[0]!;
      expect(runCall[0]).toBe("echo hello");
    });
  });

  // ---------------------------------------------------------------------------
  // exec() — stderr handling
  // ---------------------------------------------------------------------------
  describe("exec() stderr handling", () => {
    it("joins stderr chunks without inserting extra newlines", async () => {
      mockRun.mockImplementation(
        async (
          _cmd: string,
          _opts: unknown,
          handlers?: {
            onStdout?: (msg: { text: string }) => void;
            onStderr?: (msg: { text: string }) => void;
          },
        ) => {
          handlers?.onStderr?.({ text: "error line 1\n" });
          handlers?.onStderr?.({ text: "error line 2\n" });
          return { exitCode: 1 };
        },
      );

      const provider = openSandbox();
      const handle = await provider.create({ env: {} });

      const lines: string[] = [];
      const result = await handle.exec("failing-cmd", {
        onLine: (l) => lines.push(l),
      });

      expect(result.stderr).toBe("error line 1\nerror line 2\n");
    });

    it("preserves stderr exactly as received in non-streaming mode", async () => {
      mockRun.mockResolvedValue({
        exitCode: 1,
        logs: {
          stdout: [],
          stderr: [{ text: "first chunk " }, { text: "second chunk\n" }],
        },
      });

      const provider = openSandbox();
      const handle = await provider.create({ env: {} });

      const result = await handle.exec("failing-cmd");
      expect(result.stderr).toBe("first chunk second chunk\n");
    });
  });
});
