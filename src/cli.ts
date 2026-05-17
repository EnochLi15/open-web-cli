#!/usr/bin/env node
import { inspectProject } from './index.js';

type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export async function runCli(args = process.argv.slice(2), io: CliIo = DEFAULT_IO): Promise<number> {
  const [command, ...rest] = args;

  if (command !== 'inspect') {
    io.stderr(helpText());
    return 1;
  }

  const options = parseInspectArgs(rest);
  if (!options.projectRoot) {
    io.stderr('Missing required --project <path> option.\n');
    return 1;
  }

  const report = await inspectProject({ projectRoot: options.projectRoot });
  if (options.json) {
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    io.stdout(formatInspectReport(report));
  }

  return 0;
}

function parseInspectArgs(args: string[]): { projectRoot?: string; json: boolean } {
  let projectRoot: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--project') {
      projectRoot = args[index + 1];
      index += 1;
    } else if (arg === '--json') {
      json = true;
    }
  }

  return { projectRoot, json };
}

function formatInspectReport(report: Awaited<ReturnType<typeof inspectProject>>): string {
  return [
    `Axios atoms: ${report.axiosAtoms.length}`,
    ...report.axiosAtoms.map((atom) => `- ${atom.id} ${atom.method} ${atom.url} (${atom.source})`),
    `Card candidates: ${report.cardCandidates.length}`,
    ...report.cardCandidates.map((card) => `- ${card.id} (${card.source})`),
    '',
  ].join('\n');
}

function helpText(): string {
  return ['Usage:', '  open-web inspect --project <path> [--json]', ''].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
