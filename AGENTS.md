# AI Assistant Rules

## CRITICAL: No Git Commands

This project strictly prohibits the use of any git commands. Do not run git commands under any circumstances.

## Required Skill: flywave-dev

Before any task that involves reading, modifying, debugging, or testing code under
`@flywave/`, load the `flywave-dev` skill (`.agents/skills/flywave-dev/SKILL.md`).
It contains the architecture mental model, iron rules (RTE/geo coordinates, scene
rebuild, worker decoder registration, etc.), task routing, and an honest list of
which test/build commands actually work in this repo.
