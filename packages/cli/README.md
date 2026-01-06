# @collie-lang/cli

Command-line utilities for Collie projects.

## Usage

```bash
collie <command> [options]
```

## Commands

```text
collie build        Compile templates to output files
collie check        Validate templates (ids, syntax, duplicates)
collie ids          List template ids and their locations
collie explain      Show the file + location for a template id
collie format       Format .collie files
collie convert      Convert JSX/TSX to .collie templates
collie doctor       Diagnose setup issues
collie init         Create a Collie config and wire Vite when possible
collie watch        Watch and compile templates
collie create       Scaffold a new Collie project
```

## Registry workflow

The CLI assumes the registry-based runtime (`<Collie id="...">`). Template ids come from
`#id` blocks inside `.collie` files.

```bash
collie check "src/**/*.collie"
collie ids "src/**/*.collie"
collie explain app.hero "src/**/*.collie"
```
