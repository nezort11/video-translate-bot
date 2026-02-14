---
description: An active debugging skill focused on rapid experimentation, logging, and verification rather than passive analysis.
---

# Debug First Skill

You are now in **Debug First** mode. Your priority is to understand the problem through _action_ and _observation_.

## 🚨 Core Philosophy: "Stop Thinking, Start Doing"

When debugging, prioritize empirical evidence over theoretical reasoning.

- **Don't** stare at code hoping to spot the bug.
- **Do** run the code, log the state, and verify your assumptions immediately.
- **Do** create minimal reproduction scripts to isolate the issue.

## 🛠️ The Debugging Loop

Follow this loop rigorously:

### 1. 🔍 Reproduce & Isolate

- **Immediate Goal**: creating a reliable way to make the bug happen.
- Create a standalone script (e.g., `debug_repro.ts`) that calls the problematic function directly, mocking inputs if necessary.
- If you can't isolate it, add verbose logging to the main application flow and trigger the bug there.

### 2. 📝 Instrument & Observe

- Add extensive `console.log` or `logger.info` statements.
  - Log **Entry**: arguments, "entering function X"
  - Log **State**: key variables, potential nulls/undefineds
  - Log **Exit**: return values, "exiting function X"
- Use distinctive prefixes like `[DEBUG] >>>` so you can spot them easily.
- **Do not assume anything.** Log it to proves it.

### 3. 🧪 Hypothesize & Experiment

- Form a hypothesis: "I think X is happening because Y."
- **Test it**:
  - Validating the hypothesis: "If I change variable Z, the error should change/disappear."
  - Modifying code: Comment out a block, hardcode a return value, or bypass a check.
- **Run the reproduction script again.**
- Did the behavior change as expected?
  - **Yes**: You found the cause.
  - **No**: Your hypothesis was wrong. Use the new logs to form a new one.

### 4. ✅ Fix & Verify

- Once you've confirmed the root cause with evidence:
  - Apply the fix.
  - Run the reproduction script to ensure it passes.
  - **Cleanup**: Remove all temporary logs and the reproduction script (unless useful as a regression test).

## ⚡ Tactics

- **Binary Search**: If you have a large block of code, comment out half of it. Does the error persist?
- **Rubber Duck**: Explain what _should_ be happening in code comments before writing the logs to see what _is_ happening.
- **Check Boundaries**: Off-by-one errors, null/undefined checks, and type mismatches are common. Log them.

## 🚫 Anti-Patterns

- Changing code randomly ("shotgun debugging").
- Assuming a library or framework is broken (it's usually your code).
- Spending > 5 minutes reading code without running it.

## Example

**Instead of:**

> "I think the user object might be null here, let me check the types..."

**Do this:**

> "I'm adding `console.log('User object:', user)` right before line 50 and running the script to see what it actually is."
