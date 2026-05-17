import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { parse as parseSfc } from '@vue/compiler-sfc';
import ts from 'typescript';

export type InspectProjectOptions = {
  projectRoot: string;
};

export type OpenWebConfig = {
  output: {
    packageDir: string;
    packageName: string;
  };
  expose?: {
    capabilities?: Record<
      string,
      {
        from: string;
        description?: string;
      }
    >;
  };
  cards?: Record<
    string,
    {
      source: string;
      capability?: string;
    }
  >;
};

export type AxiosAtom = {
  id: string;
  method: string;
  source: string;
  url: string;
};

export type CardCandidate = {
  id: string;
  source: string;
  props: string[];
  warnings: string[];
};

export type InspectReport = {
  axiosAtoms: AxiosAtom[];
  cardCandidates: CardCandidate[];
};

export function defineOpenWeb<const TConfig extends OpenWebConfig>(config: TConfig): TConfig {
  return config;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export async function inspectProject(options: InspectProjectOptions): Promise<InspectReport> {
  const files = await listProjectFiles(options.projectRoot);
  const axiosAtoms: AxiosAtom[] = [];
  const cardCandidates: CardCandidate[] = [];

  for (const filePath of files) {
    const extension = extname(filePath);
    if (SOURCE_EXTENSIONS.has(extension)) {
      const sourceText = await readFile(filePath, 'utf8');
      axiosAtoms.push(...findAxiosAtoms(options.projectRoot, filePath, sourceText));
    }

    if (extension === '.vue') {
      const sourceText = await readFile(filePath, 'utf8');
      cardCandidates.push(findCardCandidate(options.projectRoot, filePath, sourceText));
    }
  }

  return {
    axiosAtoms: axiosAtoms.sort((left, right) => left.source.localeCompare(right.source)),
    cardCandidates: cardCandidates.sort((left, right) => left.source.localeCompare(right.source)),
  };
}

async function listProjectFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist']);

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(projectRoot);
  return files;
}

function findAxiosAtoms(projectRoot: string, filePath: string, sourceText: string): AxiosAtom[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const atoms: AxiosAtom[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      collectAtomsFromFunction(projectRoot, filePath, node.name.text, node, atoms);
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          collectAtomsFromFunction(projectRoot, filePath, declaration.name.text, declaration.initializer, atoms);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return atoms;
}

function collectAtomsFromFunction(
  projectRoot: string,
  filePath: string,
  functionName: string,
  functionNode: ts.Node,
  atoms: AxiosAtom[],
): void {
  function visit(node: ts.Node): void {
    const call = getHttpCall(node);
    if (call) {
      atoms.push({
        id: `${resourceNameFromFile(filePath)}.${functionName}`,
        method: call.method.toUpperCase(),
        source: `${toProjectPath(projectRoot, filePath)}#${functionName}`,
        url: call.url,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(functionNode);
}

function getHttpCall(node: ts.Node): { method: string; url: string } | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }

  const method = node.expression.name.text;
  if (!HTTP_METHODS.has(method)) {
    return undefined;
  }

  const urlArgument = node.arguments[0];
  const url = getUrlText(urlArgument);
  if (!url) {
    return undefined;
  }

  return { method, url };
}

function getUrlText(node: ts.Expression | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `\${${span.expression.getText()}}${span.literal.text}`).join('');
  }

  return undefined;
}

function findCardCandidate(projectRoot: string, filePath: string, sourceText: string): CardCandidate {
  const descriptor = parseSfc(sourceText, { filename: filePath }).descriptor;
  const scriptContent = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n');

  return {
    id: kebabCase(basename(filePath, '.vue')),
    source: toProjectPath(projectRoot, filePath),
    props: findDefineProps(scriptContent),
    warnings: findCardWarnings(scriptContent),
  };
}

function findDefineProps(scriptContent: string): string[] {
  const sourceFile = ts.createSourceFile('component.ts', scriptContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const props = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineProps' &&
      node.typeArguments?.[0] &&
      ts.isTypeLiteralNode(node.typeArguments[0])
    ) {
      for (const member of node.typeArguments[0].members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.add(member.name.getText(sourceFile).replace(/^['"]|['"]$/g, ''));
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...props].sort();
}

function findCardWarnings(scriptContent: string): string[] {
  const warnings: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\buse[A-Z]\w*Store\s*\(/, 'uses-store'],
    [/\buseRouter\s*\(|\buseRoute\s*\(/, 'uses-router'],
    [/\buseI18n\s*\(/, 'uses-i18n'],
    [/\bwindow\b|\bdocument\b/, 'uses-browser-global'],
    [/\baxios\b|\bfetch\s*\(/, 'uses-direct-api'],
  ];

  for (const [pattern, warning] of checks) {
    if (pattern.test(scriptContent)) {
      warnings.push(warning);
    }
  }

  return warnings;
}

function resourceNameFromFile(filePath: string): string {
  return basename(filePath, extname(filePath));
}

function toProjectPath(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).split(sep).join('/');
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
