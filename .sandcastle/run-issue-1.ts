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

const result = await sandbox.run({
  name: "Implementer",
  agent: sandcastle.claudeCode("claude-opus-4-6"),
  promptFile: "./.sandcastle/implement-prompt.md",
  promptArgs: {
    ISSUE_NUMBER: String(ISSUE_NUMBER),
    ISSUE_TITLE,
    BRANCH,
  },
});

if (result.commits.length > 0) {
  console.log(
    `\nImplementation produced ${result.commits.length} commit(s). Running spec compliance check...`,
  );
  await sandbox.run({
    name: "Spec",
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/spec-prompt.md",
    promptArgs: {
      ISSUE_NUMBER: String(ISSUE_NUMBER),
      ISSUE_TITLE,
      BRANCH,
    },
  });

  console.log("\nRunning code quality review...");
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
} else {
  console.log("\nNo commits produced.");
}

console.log(`\nDone. Branch: ${BRANCH}`);
