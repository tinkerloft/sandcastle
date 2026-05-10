# TASK

Verify that the implementation on branch {{BRANCH}} satisfies every requirement in issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.

# CONTEXT

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

<issue>

!`gh issue view {{ISSUE_NUMBER}} --comments`

</issue>

<diff-to-main>

!`git diff main..HEAD`

</diff-to-main>

# PROCESS

1. Read the issue body AND every comment. Comments are not feedback — they are **additional or corrective requirements** that override or extend the original issue body. The most recent comment is the most authoritative.

2. Produce an explicit numbered list of every requirement, sourcing each one as either "issue body" or "comment (N)". Do not skip requirements from comments.

3. For each requirement in your list, check the diff and state: SATISFIED, UNSATISFIED, or N/A. Be strict — "close enough" is UNSATISFIED.

4. For every UNSATISFIED requirement, make the fix directly on this branch. Run `npm run typecheck` and `npm test` after each fix to confirm nothing is broken.

5. Once all requirements are SATISFIED, commit any fixes with a message starting with `RALPH: Spec -`.

If everything was already correct, do nothing.

Once complete, output <promise>COMPLETE</promise>.

# RULES

- Only fix spec compliance gaps. Do not refactor, rename, or improve code quality — that is the next pass.
- Do not add features beyond what the issue requires.
- If a requirement is ambiguous, resolve it conservatively (closest to what the issue literally says).
- You MUST work through every item in your numbered list. Do not stop after fixing the first unsatisfied requirement.
