/**
 * OpenSandbox isolated sandbox provider — wraps `@alibaba-group/opensandbox` into a SandboxProvider.
 *
 * Usage:
 *   import { openSandbox } from "@ai-hero/sandcastle/sandboxes/opensandbox";
 *   await run({ agent: claudeCode("claude-opus-4-6"), sandbox: openSandbox({ image: "ubuntu" }) });
 */

import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import {
  createIsolatedSandboxProvider,
  type ExecResult,
  type IsolatedSandboxHandle,
  type IsolatedSandboxProvider,
} from "../SandboxProvider.js";

const OPENSANDBOX_WORKTREE_PATH = "/home/user/workspace";

export interface OpenSandboxOptions {
  /**
   * OpenSandbox server domain (host:port).
   * Falls back to the `OPENSANDBOX_DOMAIN` environment variable.
   * Defaults to `"localhost:8080"`.
   */
  readonly domain?: string;

  /**
   * API key for authentication.
   * Falls back to the `OPENSANDBOX_API_KEY` environment variable.
   */
  readonly apiKey?: string;

  /**
   * Connection protocol (`"http"` or `"https"`).
   * Defaults to `"http"`.
   */
  readonly protocol?: "http" | "https";

  /**
   * Container image to use for the sandbox.
   * Supports a plain image string or an object with auth credentials.
   */
  readonly image?:
    | string
    | { uri: string; auth?: { username: string; password: string } };

  /**
   * Create the sandbox from an existing snapshot instead of an image.
   */
  readonly snapshotId?: string;

  /**
   * Sandbox timeout in seconds. `null` disables the timeout.
   * Defaults to 600 (10 minutes).
   */
  readonly timeoutSeconds?: number | null;

  /**
   * Container entrypoint override.
   */
  readonly entrypoint?: string[];

  /**
   * Resource limits (e.g. `{ cpu: "2", memory: "4096Mi" }`).
   */
  readonly resource?: Record<string, string>;

  /**
   * Network policy for egress control.
   */
  readonly networkPolicy?: {
    defaultAction: string;
    egress: Array<{ action: string; target: string }>;
  };

  /** Environment variables injected by this provider. Merged at launch time with env resolver and agent provider env. */
  readonly env?: Record<string, string>;
}

/**
 * Create an OpenSandbox isolated sandbox provider.
 *
 * The returned provider creates ephemeral OpenSandbox containers via the
 * `@alibaba-group/opensandbox` SDK. Each sandbox is ephemeral — one sandbox per run.
 *
 * Requires `@alibaba-group/opensandbox` to be installed as a peer dependency.
 */
export const openSandbox = (
  options?: OpenSandboxOptions,
): IsolatedSandboxProvider =>
  createIsolatedSandboxProvider({
    name: "opensandbox",
    env: options?.env,
    create: async (createOptions): Promise<IsolatedSandboxHandle> => {
      const { Sandbox, ConnectionConfig } =
        await import("@alibaba-group/opensandbox");

      const connectionConfig = new ConnectionConfig({
        domain: options?.domain,
        apiKey: options?.apiKey,
        protocol: options?.protocol,
      });

      const createParams: Record<string, unknown> = {
        connectionConfig,
      };

      if (options?.image) createParams.image = options.image;
      if (options?.snapshotId) createParams.snapshotId = options.snapshotId;
      if (options?.timeoutSeconds !== undefined)
        createParams.timeoutSeconds = options.timeoutSeconds;
      if (options?.entrypoint) createParams.entrypoint = options.entrypoint;
      if (options?.resource) createParams.resource = options.resource;
      if (options?.networkPolicy)
        createParams.networkPolicy = options.networkPolicy;

      createParams.env = createOptions.env;

      const sandbox = await Sandbox.create(
        createParams as Parameters<typeof Sandbox.create>[0],
      );

      await sandbox.files.createDirectories([
        { path: OPENSANDBOX_WORKTREE_PATH },
      ]);

      const handle: IsolatedSandboxHandle = {
        worktreePath: OPENSANDBOX_WORKTREE_PATH,

        exec: async (
          command: string,
          opts?: {
            onLine?: (line: string) => void;
            cwd?: string;
            sudo?: boolean;
          },
        ): Promise<ExecResult> => {
          const effectiveCommand = opts?.sudo ? `sudo ${command}` : command;
          const runOpts = {
            workingDirectory: opts?.cwd ?? OPENSANDBOX_WORKTREE_PATH,
          };

          if (opts?.onLine) {
            const onLine = opts.onLine;
            const stdoutLines: string[] = [];
            const stderrChunks: string[] = [];
            let stdoutPartial = "";
            let stderrPartial = "";

            const execution = await sandbox.commands.run(
              effectiveCommand,
              runOpts,
              {
                onStdout: (msg: { text: string }) => {
                  const text = stdoutPartial + msg.text;
                  const lines = text.split("\n");
                  stdoutPartial = lines.pop() ?? "";
                  for (const line of lines) {
                    stdoutLines.push(line);
                    onLine(line);
                  }
                },
                onStderr: (msg: { text: string }) => {
                  const text = stderrPartial + msg.text;
                  const lines = text.split("\n");
                  stderrPartial = lines.pop() ?? "";
                  for (const line of lines) {
                    stderrChunks.push(line);
                  }
                },
              },
            );

            if (stdoutPartial) {
              stdoutLines.push(stdoutPartial);
              onLine(stdoutPartial);
            }
            if (stderrPartial) {
              stderrChunks.push(stderrPartial);
            }

            return {
              stdout: stdoutLines.join("\n"),
              stderr: stderrChunks.join("\n"),
              exitCode: execution.exitCode ?? 0,
            };
          }

          const execution = await sandbox.commands.run(
            effectiveCommand,
            runOpts,
          );

          const stdout = execution.logs.stdout
            .map((m: { text: string }) => m.text)
            .join("");
          const stderr = execution.logs.stderr
            .map((m: { text: string }) => m.text)
            .join("");

          return {
            stdout,
            stderr,
            exitCode: execution.exitCode ?? 0,
          };
        },

        copyIn: async (
          hostPath: string,
          sandboxPath: string,
        ): Promise<void> => {
          const info = await stat(hostPath);
          if (info.isDirectory()) {
            const walk = async (dir: string): Promise<string[]> => {
              const entries = await readdir(dir, { withFileTypes: true });
              const files: string[] = [];
              for (const entry of entries) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                  files.push(...(await walk(full)));
                } else {
                  files.push(full);
                }
              }
              return files;
            };
            const files = await walk(hostPath);
            for (const file of files) {
              const rel = relative(hostPath, file);
              const content = await readFile(file);
              await sandbox.files.writeFiles([
                { path: join(sandboxPath, rel), data: content },
              ]);
            }
          } else {
            const content = await readFile(hostPath);
            await sandbox.files.writeFiles([
              { path: sandboxPath, data: content },
            ]);
          }
        },

        copyFileOut: async (
          sandboxPath: string,
          hostPath: string,
        ): Promise<void> => {
          const content = await sandbox.files.readBytes(sandboxPath);
          await mkdir(dirname(hostPath), { recursive: true });
          await writeFile(hostPath, content);
        },

        close: async (): Promise<void> => {
          await sandbox.kill();
        },
      };

      return handle;
    },
  });
