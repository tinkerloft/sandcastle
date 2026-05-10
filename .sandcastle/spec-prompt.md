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

1. Read the issue body and every comment carefully. Extract each discrete requirement — including implementation details, option shapes, naming conventions, and acceptance criteria.

2. For each requirement, check the diff and decide: SATISFIED, UNSATISFIED, or N/A.

3. For every UNSATISFIED requirement, make the fix directly on this branch. Run `npm run typecheck` and `npm test` after each fix to confirm nothing is broken.

4. Once all requirements are satisfied, commit any fixes with a message starting with `RALPH: Spec -`.

If everything was already correct, do nothing.

Once complete, output <promise>COMPLETE</promise>.

# RULES

- Only fix spec compliance gaps. Do not refactor, rename, or improve code quality — that is the next pass.
- Do not add features beyond what the issue requires.
- If a requirement is ambiguous, resolve it conservatively (closest to what the issue literally says).
