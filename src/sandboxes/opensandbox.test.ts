import { describe, expect, it } from "vitest";
import { openSandbox } from "./opensandbox.js";

describe("openSandbox()", () => {
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
});
