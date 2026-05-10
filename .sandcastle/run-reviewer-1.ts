import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const ISSUE_NUMBER = 1;
const ISSUE_TITLE = "feat: add openSandbox() isolated sandbox provider";
const BRANCH = "feat/opensandbox-provider";

await using sandbox = await sandcastle.createSandbox({
  sandbox: docker(),
  branch: BRANCH,
  copyToWorkspace: ["node_modules"],
  hooks: {
    sandbox: {
      onSandboxReady: [{ command: "npm install && npm run build" }],
    },
  },
});

await sandbox.run({
  name: "Reviewer",
  agent: sandcastle.claudeCode("claude-opus-4-6"),
  promptFile: "./.sandcastle/review-prompt.md",
  promptArgs: {
    ISSUE_NUMBER: String(ISSUE_NUMBER),
    ISSUE_TITLE,
    BRANCH,
  },
});
