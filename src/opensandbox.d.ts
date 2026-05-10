/** Minimal type declarations for @alibaba-group/opensandbox (optional peer dependency). */
declare module "@alibaba-group/opensandbox" {
  interface OutputMessage {
    text: string;
    timestamp: number;
  }

  interface Execution {
    exitCode?: number | null;
    logs: {
      stdout: OutputMessage[];
      stderr: OutputMessage[];
    };
  }

  interface ExecutionHandlers {
    onStdout?: (msg: OutputMessage) => void | Promise<void>;
    onStderr?: (msg: OutputMessage) => void | Promise<void>;
    onExecutionComplete?: (c: {
      executionTimeMs: number;
    }) => void | Promise<void>;
  }

  interface RunCommandOpts {
    workingDirectory?: string;
    background?: boolean;
    timeoutSeconds?: number;
    uid?: number;
    gid?: number;
    envs?: Record<string, string>;
  }

  interface WriteEntry {
    path: string;
    data: string | Buffer | ReadableStream | AsyncIterable<Uint8Array>;
    mode?: number;
  }

  interface ExecdCommands {
    run(
      command: string,
      opts?: RunCommandOpts,
      handlers?: ExecutionHandlers,
      signal?: AbortSignal,
    ): Promise<Execution>;
  }

  interface SandboxFiles {
    createDirectories(
      entries: Array<{ path: string; mode?: number }>,
    ): Promise<void>;
    writeFiles(entries: WriteEntry[]): Promise<void>;
    readFile(path: string, opts?: { encoding?: string }): Promise<string>;
    readBytes(path: string, opts?: { range?: string }): Promise<Uint8Array>;
  }

  interface SandboxInstance {
    readonly id: string;
    readonly commands: ExecdCommands;
    readonly files: SandboxFiles;
    kill(): Promise<void>;
    close(): Promise<void>;
  }

  export class Sandbox {
    static create(options: Record<string, unknown>): Promise<SandboxInstance>;
  }

  export class ConnectionConfig {
    constructor(options?: {
      domain?: string;
      apiKey?: string;
      protocol?: string;
      requestTimeoutSeconds?: number;
      debug?: boolean;
      headers?: Record<string, string>;
    });
  }
}
