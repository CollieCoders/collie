import pc from "picocolors";

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`${pc.bold("collie")} (MVP stub)

Commands:
  collie init   Initialize Collie in a Vite+React project (later)
`);
    process.exit(0);
  }

  console.error(pc.red(`Unknown command: ${cmd}`));
  process.exit(1);
}

main();
