#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generateAdapter, inspectProject } from './index.js';

const execFileAsync = promisify(execFile);

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

  if (command === 'inspect') {
    return runInspect(rest, io);
  }

  if (command === 'generate') {
    return runGenerate(rest, io);
  }

  if (command === 'build') {
    return runBuild(rest, io);
  }

  io.stderr(helpText());
  return 1;
}

async function runInspect(args: string[], io: CliIo): Promise<number> {
  const options = parseProjectArgs(args);
  const report = await inspectProject({ projectRoot: options.projectRoot });
  if (options.json) {
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    io.stdout(formatInspectReport(report));
  }

  return 0;
}

async function runGenerate(args: string[], io: CliIo): Promise<number> {
  const options = parseProjectArgs(args);
  const result = await generateAdapter({ projectRoot: options.projectRoot, configPath: options.configPath });
  if (options.json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    io.stdout(`Generated adapter package at ${result.packageDir}\n`);
  }

  return 0;
}

async function runBuild(args: string[], io: CliIo): Promise<number> {
  const options = parseProjectArgs(args);
  const result = await generateAdapter({ projectRoot: options.projectRoot, configPath: options.configPath });
  await execFileAsync('npm', ['install', '--ignore-scripts'], { cwd: result.packageDir });
  await execFileAsync('npm', ['run', 'build'], { cwd: result.packageDir });

  if (options.json) {
    io.stdout(`${JSON.stringify({ ...result, built: true }, null, 2)}\n`);
  } else {
    io.stdout(`Built adapter package at ${result.packageDir}\n`);
  }

  return 0;
}

function parseProjectArgs(args: string[]): { projectRoot: string; configPath?: string; json: boolean } {
  let projectRoot = process.cwd();
  let configPath: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--project') {
      projectRoot = resolve(args[index + 1] ?? process.cwd());
      index += 1;
    } else if (arg === '--config') {
      configPath = args[index + 1];
      index += 1;
    } else if (arg === '--json') {
      json = true;
    }
  }

  if (configPath) {
    configPath = resolve(projectRoot, configPath);
  }

  return { projectRoot, configPath, json };
}

function helpText(): string {
  return [
    'Usage:',
    '  open-web inspect [--project <path>] [--json]',
    '  open-web generate [--project <path>] [--config <path>] [--json]',
    '  open-web build [--project <path>] [--config <path>] [--json]',
    '',
    'Defaults:',
    '  --project defaults to the current working directory.',
    '  --config is resolved from the project directory.',
    '',
  ].join('\n');
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

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
