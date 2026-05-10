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

// ---------------------------------------------------------------------------
// Mock node:child_process (for tar-based copyIn)
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock node:fs/promises (for copyIn file operations)
// ---------------------------------------------------------------------------
const mockStat = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFileFs = vi.fn();
const mockMkdir = vi.fn();
const mockUnlink = vi.fn();

vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFileFs(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
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
    mockStat.mockResolvedValue({ isDirectory: () => false });
    mockReadFile.mockResolvedValue(Buffer.from("file-content"));
    mockWriteFileFs.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("returns a SandboxProvider with tag 'isolated' and name 'opensandbox'", () => {
    const provider = openSandbox({ image: "ubuntu" });
    expect(provider.tag).toBe("isolated");
    expect(provider.name).toBe("opensandbox");
  });

  it("has a create function", () => {
    const provider = openSandbox({ image: "ubuntu" });
    expect(typeof provider.create).toBe("function");
  });

  it("accepts connection config options", () => {
    const provider = openSandbox({
      image: "ubuntu",
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
    const provider = openSandbox({ image: "ubuntu", env: { MY_VAR: "value" } });
    expect(provider.tag).toBe("isolated");
    expect(provider.env).toEqual({ MY_VAR: "value" });
  });

  it("defaults env to empty object when not provided", () => {
    const provider = openSandbox({ image: "ubuntu" });
    expect(provider.env).toEqual({});
  });

  it("accepts a snapshotId option", () => {
    const provider = openSandbox({ image: "ubuntu", snapshotId: "snap-123" });
    expect(provider.tag).toBe("isolated");
  });

  describe("exec() stdin support", () => {
    it("writes stdin to a temp file and pipes it to the command", async () => {
      const provider = openSandbox({ image: "ubuntu" });
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
      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      await handle.exec("echo hello");

      const runCall = mockRun.mock.calls[0]!;
      expect(runCall[0]).toBe("echo hello");
    });
  });

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

      const provider = openSandbox({ image: "ubuntu" });
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

      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      const result = await handle.exec("failing-cmd");
      expect(result.stderr).toBe("first chunk \nsecond chunk\n");
    });
  });

  describe("exec() non-streaming newline joining", () => {
    it("joins stdout log entries with newlines in non-streaming mode", async () => {
      mockRun.mockResolvedValue({
        exitCode: 0,
        logs: {
          stdout: [{ text: "line1" }, { text: "line2" }, { text: "line3" }],
          stderr: [],
        },
      });

      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      const result = await handle.exec("some-cmd");
      expect(result.stdout).toBe("line1\nline2\nline3");
    });

    it("joins stderr log entries with newlines in non-streaming mode", async () => {
      mockRun.mockResolvedValue({
        exitCode: 1,
        logs: {
          stdout: [],
          stderr: [{ text: "err1" }, { text: "err2" }],
        },
      });

      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      const result = await handle.exec("failing-cmd");
      expect(result.stderr).toBe("err1\nerr2");
    });
  });

  describe("worktreePath", () => {
    it("sets worktreePath to /home/user/sandcastle/worktree", async () => {
      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      expect(handle.worktreePath).toBe("/home/user/sandcastle/worktree");
    });
  });

  describe("copyIn() tar-based transfer", () => {
    it("uses tar to transfer directories instead of file-by-file walk", async () => {
      const { execSync } = await import("node:child_process");

      mockStat.mockResolvedValue({ isDirectory: () => true });

      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      await handle.copyIn("/host/project", "/sandbox/project");

      // Should have called execSync with tar -czf
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("tar -czf"),
      );

      // Should have written the tar file to the sandbox
      const tarWriteCall = mockWriteFiles.mock.calls.find((call) =>
        call[0]?.some(
          (entry: { path: string }) =>
            entry.path.startsWith("/tmp/sandcastle-copyin-") &&
            entry.path.endsWith(".tar.gz"),
        ),
      );
      expect(tarWriteCall).toBeDefined();

      // Should have run mkdir + tar extract in the sandbox
      const extractCall = mockRun.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("mkdir -p") &&
          call[0].includes("tar -xzf"),
      );
      expect(extractCall).toBeDefined();

      // Should have cleaned up the local temp file
      expect(mockUnlink).toHaveBeenCalled();
    });

    it("writes single files directly without tar", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false });
      mockReadFile.mockResolvedValue(Buffer.from("file-content"));

      const provider = openSandbox({ image: "ubuntu" });
      const handle = await provider.create({ env: {} });

      await handle.copyIn("/host/file.txt", "/sandbox/file.txt");

      // Should write the file directly
      expect(mockWriteFiles).toHaveBeenCalledWith([
        { path: "/sandbox/file.txt", data: expect.any(Buffer) },
      ]);
    });
  });
});
