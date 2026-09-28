import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  assertMigrationChecksumManifest,
  loadMigrationInventory,
} from "../lib/migration-readiness";

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const PLATFORM_SUFFIXES = new Set(["android", "ios", "native", "web"]);

export type MobilePlatform = "all" | "android" | "ios" | "native" | "web";

export interface SourceRef {
  path: string;
}

export interface WebRouteItem {
  id: string;
  path: string;
  routeGroups: string[];
  dynamicParameters: string[];
  source: SourceRef;
}

export interface MobileRouteItem {
  id: string;
  routerPath: string;
  urlPattern: string;
  kind: "screen" | "layout" | "not-found";
  platform: MobilePlatform;
  dynamicParameters: string[];
  source: SourceRef;
}

export interface HttpMethodItem {
  id: string;
  method: string;
  path: string;
  scope: "api" | "auth-handler";
  source: SourceRef;
  implementationSource?: SourceRef;
}

export interface SettingsSectionItem {
  id: string;
  section: string;
  group: string;
  defaultLabel: string;
  route: string;
  accessPredicates: string[];
  descriptorSource: SourceRef;
  panelSource: SourceRef;
}

export interface PermissionItem {
  id: string;
  key: string;
  sourceOrder: number;
  roleDefaults: {
    user: boolean;
    admin: boolean;
    superAdmin: boolean;
    gridmaster: boolean;
  };
  impliedBy: string[];
  uiModules: string[];
  mobileContract: boolean;
  source: SourceRef;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  version: string;
  private: boolean;
  source: SourceRef;
}

export interface PackageScriptItem {
  id: string;
  package: string;
  workspacePath: string;
  name: string;
  command: string;
  source: SourceRef;
}

export interface SupportedCommandItem {
  id: string;
  scriptId: string;
  invocation: string;
  audience: "developer" | "ci" | "operations";
  status: "supported" | "internal" | "deprecated";
  reason?: string;
}

export interface DocumentationSourcePolicy {
  schemaVersion: 1;
  commands: Record<
    string,
    {
      audience: SupportedCommandItem["audience"];
      status: SupportedCommandItem["status"];
      reason?: string;
    }
  >;
  environment: Record<
    string,
    {
      declaration: "required" | "optional" | "conditional" | "usage-only";
      exposure: "public" | "server-config" | "secret" | "provider-injected";
    }
  >;
  scheduledJobs?: Record<string, { category: ScheduledJobItem["category"] }>;
}

export interface MigrationItem {
  id: string;
  version: string;
  name: string;
  file: string;
  sha256: string;
  source: SourceRef;
}

export interface RlsTableItem {
  id: string;
  schema: string;
  table: string;
  enabled: true;
  createdIn: SourceRef;
  enabledIn: SourceRef;
}

export interface EnvironmentKeyItem {
  id: string;
  name: string;
  scopes: string[];
  declaration: DocumentationSourcePolicy["environment"][string]["declaration"];
  exposure: DocumentationSourcePolicy["environment"][string]["exposure"];
  declarations: SourceRef[];
  usages: SourceRef[];
  exampleFiles: string[];
}

export interface ScheduledJobItem {
  id: string;
  provider: "vercel" | "github-actions";
  schedule: string;
  target: { kind: "http"; path: string } | { kind: "workflow"; workflow: string };
  category: "product" | "repository-maintenance";
  source: SourceRef;
}

export interface DocumentationSourceInventory {
  schemaVersion: 1;
  sourceDigest: string;
  webRoutes: WebRouteItem[];
  mobileRoutes: MobileRouteItem[];
  settingsSections: SettingsSectionItem[];
  httpMethods: HttpMethodItem[];
  permissions: PermissionItem[];
  workspaces: WorkspaceItem[];
  migrations: MigrationItem[];
  rlsTables: RlsTableItem[];
  environmentKeys: EnvironmentKeyItem[];
  cronJobs: ScheduledJobItem[];
  packageScripts: PackageScriptItem[];
  supportedCommands: SupportedCommandItem[];
}

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function repositoryPath(repoRoot: string, filePath: string): string {
  const relative = path.relative(repoRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Source is outside the repository: ${filePath}`);
  }
  return posixPath(relative);
}

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root).sort((left, right) => left.localeCompare(right, "en"))) {
    const entryPath = path.join(root, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) files.push(...walkFiles(entryPath, predicate));
    else if (stats.isFile() && predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

function routeGroups(segments: readonly string[]): string[] {
  return segments
    .filter((segment) => /^\([^/]+\)$/.test(segment))
    .map((segment) => segment.slice(1, -1));
}

function withoutRouteGroups(segments: readonly string[]): string[] {
  return segments.filter((segment) => !/^\([^/]+\)$/.test(segment));
}

function routePath(segments: readonly string[]): string {
  const visible = withoutRouteGroups(segments);
  return visible.length === 0 ? "/" : `/${visible.join("/")}`;
}

function dynamicParameters(segments: readonly string[]): string[] {
  return segments.flatMap((segment) => {
    const match = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/.exec(segment);
    return match ? [match[1]] : [];
  });
}

function assertUnique<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const seen = new Map<string, T>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.set(value, item);
  }
}

function asciiSort<T>(items: T[], key: (item: T) => string): T[] {
  return items.sort((left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function parseTypeScript(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function propertyName(node: ts.PropertyName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      return property.initializer;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name;
    }
  }
  return undefined;
}

function stringFallback(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  let result: string | undefined;
  const visit = (current: ts.Node) => {
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      result = current.text;
    }
    current.forEachChild(visit);
  };
  visit(node);
  return result;
}

function variableInitializer(sourceFile: ts.SourceFile, name: string): ts.Expression {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }
  throw new Error(`Missing canonical declaration ${name} in ${sourceFile.fileName}`);
}

function stringArray(node: ts.Expression, label: string): string[] {
  if (!ts.isArrayLiteralExpression(node)) throw new Error(`${label} must be an array literal.`);
  return node.elements.map((element) => {
    if (!ts.isStringLiteral(element)) throw new Error(`${label} contains a non-string entry.`);
    return element.text;
  });
}

export function collectWebRoutes(repoRoot: string): WebRouteItem[] {
  const appRoot = path.join(repoRoot, "apps/web/src/app");
  const pages = walkFiles(appRoot, (file) => {
    const extension = path.extname(file);
    return CODE_EXTENSIONS.has(extension) && path.basename(file, extension) === "page";
  });

  const routes = pages.map((file) => {
    const segments = posixPath(path.relative(appRoot, path.dirname(file)))
      .split("/")
      .filter(Boolean);
    const url = routePath(segments);
    return {
      id: `web:${url}`,
      path: url,
      routeGroups: routeGroups(segments),
      dynamicParameters: dynamicParameters(segments),
      source: { path: repositoryPath(repoRoot, file) },
    };
  });

  assertUnique(routes, (route) => route.id, "web route");
  return asciiSort(routes, (route) => route.id);
}

function splitPlatformSuffix(fileName: string): { name: string; platform: MobilePlatform } {
  const parts = fileName.split(".");
  const possiblePlatform = parts.at(-1);
  if (possiblePlatform && PLATFORM_SUFFIXES.has(possiblePlatform)) {
    return { name: parts.slice(0, -1).join("."), platform: possiblePlatform as MobilePlatform };
  }
  return { name: fileName, platform: "all" };
}

function mobileRouterPath(segments: readonly string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function collectMobileRoutes(repoRoot: string): MobileRouteItem[] {
  const appRoot = path.join(repoRoot, "apps/mobile/app");
  const files = walkFiles(appRoot, (file) => CODE_EXTENSIONS.has(path.extname(file)));
  const routes = files.map((file) => {
    const extension = path.extname(file);
    const relativeDirectory = posixPath(path.relative(appRoot, path.dirname(file)));
    const directorySegments = relativeDirectory === "" ? [] : relativeDirectory.split("/");
    const rawBase = path.basename(file, extension);
    const { name, platform } = splitPlatformSuffix(rawBase);
    let kind: MobileRouteItem["kind"] = "screen";
    let routeSegments = directorySegments;
    if (name === "_layout") kind = "layout";
    else if (name === "+not-found") kind = "not-found";
    else if (name !== "index") routeSegments = [...directorySegments, name];

    if (name.startsWith("+") && name !== "+not-found") {
      throw new Error(`Unsupported Expo special route: ${repositoryPath(repoRoot, file)}`);
    }

    const routerPath = mobileRouterPath(routeSegments);
    const url = routePath(routeSegments);
    return {
      id: `mobile:${kind}:${routerPath}:${platform}`,
      routerPath,
      urlPattern: url,
      kind,
      platform,
      dynamicParameters: dynamicParameters(routeSegments),
      source: { path: repositoryPath(repoRoot, file) },
    };
  });

  assertUnique(routes, (route) => route.id, "mobile route");
  const screens = routes.filter((route) => route.kind === "screen");
  assertUnique(screens, (route) => `${route.urlPattern}:${route.platform}`, "mobile screen URL");
  return asciiSort(routes, (route) => route.id);
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    : false;
}

interface ExportedMethod {
  method: string;
  implementationPath?: string;
}

function exportedHttpMethods(sourceText: string, filePath: string): ExportedMethod[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const methods: ExportedMethod[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name) {
      if (HTTP_METHODS.has(statement.name.text)) methods.push({ method: statement.name.text });
      continue;
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) {
          methods.push({ method: declaration.name.text });
        }
      }
      continue;
    }
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.exportClause) {
      throw new Error(`Wildcard Route Handler export is not supported: ${filePath}`);
    }
    if (!ts.isNamedExports(statement.exportClause)) {
      throw new Error(`Unsupported Route Handler export form: ${filePath}`);
    }
    const modulePath =
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text;
      if (HTTP_METHODS.has(exportedName)) {
        methods.push({ method: exportedName, implementationPath: modulePath });
      }
    }
  }
  assertUnique(methods, (method) => method.method, `HTTP method export in ${filePath}`);
  return asciiSort(methods, (method) => method.method);
}

function resolveImplementationSource(
  repoRoot: string,
  routeFile: string,
  specifier: string,
): SourceRef | undefined {
  const absoluteBase = specifier.startsWith(".")
    ? path.resolve(path.dirname(routeFile), specifier)
    : specifier.startsWith("@/")
      ? path.join(repoRoot, "apps/web/src", specifier.slice(2))
      : undefined;
  if (!absoluteBase) return undefined;
  const candidates = [
    absoluteBase,
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${absoluteBase}${extension}`),
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) =>
      path.join(absoluteBase, `index${extension}`),
    ),
  ];
  const resolved = candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!resolved) {
    throw new Error(`Unable to resolve Route Handler re-export ${specifier} from ${routeFile}`);
  }
  return { path: repositoryPath(repoRoot, resolved) };
}

export function collectHttpMethods(repoRoot: string): HttpMethodItem[] {
  const appRoot = path.join(repoRoot, "apps/web/src/app");
  const routeFiles = walkFiles(appRoot, (file) => path.basename(file) === "route.ts");
  const methods = routeFiles.flatMap((file) => {
    const segments = posixPath(path.relative(appRoot, path.dirname(file)))
      .split("/")
      .filter(Boolean);
    const url = routePath(segments);
    const scope: HttpMethodItem["scope"] =
      url.startsWith("/api/") || url === "/api" ? "api" : "auth-handler";
    if (scope === "auth-handler" && !url.startsWith("/auth/")) {
      throw new Error(`Route Handler is outside /api or /auth: ${repositoryPath(repoRoot, file)}`);
    }
    const sourcePath = repositoryPath(repoRoot, file);
    const exports = exportedHttpMethods(readFileSync(file, "utf8"), sourcePath);
    if (exports.length === 0)
      throw new Error(`Route Handler exports no HTTP method: ${sourcePath}`);
    return exports.map((entry) => {
      const implementationSource = entry.implementationPath
        ? resolveImplementationSource(repoRoot, file, entry.implementationPath)
        : undefined;
      return {
        id: `http:${entry.method}:${url}`,
        method: entry.method,
        path: url,
        scope,
        source: { path: sourcePath },
        ...(implementationSource ? { implementationSource } : {}),
      };
    });
  });
  assertUnique(methods, (method) => method.id, "HTTP method");
  return asciiSort(methods, (method) => method.id);
}

function dynamicImports(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      let specifier: string | undefined;
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          specifier = node.arguments[0].text;
        }
        node.forEachChild(visit);
      };
      visit(declaration.initializer);
      if (specifier) imports.set(declaration.name.text, specifier);
    }
  }
  return imports;
}

function resolveSourceModule(repoRoot: string, fromFile: string, specifier: string): SourceRef {
  if (!specifier.startsWith(".")) return { path: specifier };
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${base}${extension}`),
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => path.join(base, `index${extension}`)),
  ];
  const resolved = candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!resolved) throw new Error(`Unable to resolve ${specifier} from ${fromFile}`);
  return { path: repositoryPath(repoRoot, resolved) };
}

function settingsRenderTargets(
  repoRoot: string,
  filePath: string,
  sections: readonly string[],
): Map<string, SourceRef> {
  const sourceFile = parseTypeScript(filePath);
  const imports = dynamicImports(sourceFile);
  const targets = new Map<string, SourceRef>();
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === "activeSection" &&
      ts.isStringLiteral(node.right) &&
      sections.includes(node.right.text)
    ) {
      let container: ts.Node | undefined = node;
      while (container && !ts.isJsxExpression(container)) container = container.parent;
      if (!container) throw new Error(`Settings guard has no JSX container: ${node.right.text}`);
      const componentNames = new Set<string>();
      const findComponents = (current: ts.Node) => {
        if (ts.isJsxSelfClosingElement(current) || ts.isJsxOpeningElement(current)) {
          const tag = current.tagName;
          if (ts.isIdentifier(tag) && imports.has(tag.text)) componentNames.add(tag.text);
        }
        current.forEachChild(findComponents);
      };
      findComponents(container);
      if (componentNames.size !== 1) {
        throw new Error(
          `Settings section ${node.right.text} must render exactly one lazy panel, found ${[
            ...componentNames,
          ].join(", ")}.`,
        );
      }
      const component = [...componentNames][0];
      if (targets.has(node.right.text))
        throw new Error(`Duplicate Settings render guard: ${node.right.text}`);
      targets.set(
        node.right.text,
        resolveSourceModule(repoRoot, filePath, imports.get(component)!),
      );
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return targets;
}

function ancestorPredicates(node: ts.Node): string[] {
  const predicates = new Set<string>();
  let current: ts.Node | undefined = node;
  while (current?.parent) {
    if (ts.isIfStatement(current.parent)) predicates.add(current.parent.expression.getText());
    current = current.parent;
  }
  return [...predicates].sort();
}

interface SettingsDescriptor {
  section: string;
  group: string;
  label: string;
  predicates: string[];
}

function settingsDescriptors(
  sourceFile: ts.SourceFile,
  validSections: readonly string[],
): SettingsDescriptor[] {
  const groupVariables = new Map<string, string>();
  const inlineGroups = new Map<ts.ArrayLiteralExpression, string>();
  const findGroups = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "groups" &&
      node.expression.name.text === "push" &&
      node.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const group = stringFallback(objectProperty(node.arguments[0], "label"));
      const items = objectProperty(node.arguments[0], "items");
      if (!group || !items) throw new Error("Settings navigation group is missing label or items.");
      if (ts.isIdentifier(items)) groupVariables.set(items.text, group);
      else if (ts.isArrayLiteralExpression(items)) inlineGroups.set(items, group);
      else throw new Error(`Unsupported Settings group items expression: ${items.getText()}`);
    }
    node.forEachChild(findGroups);
  };
  findGroups(sourceFile);

  const descriptors: SettingsDescriptor[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const section = stringFallback(objectProperty(node, "id"));
      if (section && validSections.includes(section)) {
        const label = stringFallback(objectProperty(node, "label"));
        if (!label) throw new Error(`Settings section ${section} has no default label.`);
        let group: string | undefined;
        let current: ts.Node | undefined = node;
        while (current?.parent && !group) {
          if (
            ts.isCallExpression(current.parent) &&
            ts.isPropertyAccessExpression(current.parent.expression) &&
            ts.isIdentifier(current.parent.expression.expression) &&
            current.parent.expression.name.text === "push"
          ) {
            group = groupVariables.get(current.parent.expression.expression.text);
          }
          if (ts.isArrayLiteralExpression(current.parent)) group = inlineGroups.get(current.parent);
          current = current.parent;
        }
        if (!group) throw new Error(`Unable to resolve Settings group for ${section}.`);
        descriptors.push({ section, group, label, predicates: ancestorPredicates(node) });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  assertUnique(descriptors, (descriptor) => descriptor.section, "Settings descriptor");
  return descriptors;
}

export function collectSettingsSections(repoRoot: string): SettingsSectionItem[] {
  const descriptorFile = path.join(repoRoot, "apps/web/src/components/settings/nav-config.tsx");
  const renderFile = path.join(repoRoot, "apps/web/src/components/settings/SettingsPage.tsx");
  const sourceFile = parseTypeScript(descriptorFile);
  const validSections = stringArray(
    variableInitializer(sourceFile, "VALID_SECTIONS"),
    "VALID_SECTIONS",
  );
  const descriptors = settingsDescriptors(sourceFile, validSections);
  const renderTargets = settingsRenderTargets(repoRoot, renderFile, validSections);
  const descriptorBySection = new Map(
    descriptors.map((descriptor) => [descriptor.section, descriptor]),
  );
  const items = validSections.map((section) => {
    const descriptor = descriptorBySection.get(section);
    const panelSource = renderTargets.get(section);
    if (!descriptor)
      throw new Error(`VALID_SECTIONS entry has no navigation descriptor: ${section}`);
    if (!panelSource) throw new Error(`VALID_SECTIONS entry has no rendered panel: ${section}`);
    return {
      id: `settings:${section}`,
      section,
      group: descriptor.group,
      defaultLabel: descriptor.label,
      route: `/settings?section=${section}`,
      accessPredicates: descriptor.predicates,
      descriptorSource: { path: repositoryPath(repoRoot, descriptorFile) },
      panelSource,
    };
  });
  return asciiSort(items, (item) => item.id);
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) return unwrapExpression(node.expression);
  return node;
}

function booleanObject(sourceFile: ts.SourceFile, name: string): Record<string, boolean> {
  const cache = new Map<string, Record<string, boolean>>();
  const read = (variableName: string): Record<string, boolean> => {
    const cached = cache.get(variableName);
    if (cached) return cached;
    const expression = unwrapExpression(variableInitializer(sourceFile, variableName));
    if (!ts.isObjectLiteralExpression(expression)) {
      throw new Error(`${variableName} must be an object literal.`);
    }
    const result: Record<string, boolean> = {};
    cache.set(variableName, result);
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        if (!ts.isIdentifier(property.expression)) {
          throw new Error(`Unsupported spread in ${variableName}: ${property.getText()}`);
        }
        Object.assign(result, read(property.expression.text));
        continue;
      }
      if (!ts.isPropertyAssignment(property)) continue;
      const key = propertyName(property.name);
      if (
        !key ||
        (property.initializer.kind !== ts.SyntaxKind.TrueKeyword &&
          property.initializer.kind !== ts.SyntaxKind.FalseKeyword)
      ) {
        throw new Error(`Non-boolean permission value in ${variableName}: ${property.getText()}`);
      }
      result[key] = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
    return result;
  };
  return read(name);
}

function implicationMap(sourceFile: ts.SourceFile): Record<string, string[]> {
  const expression = unwrapExpression(variableInitializer(sourceFile, "VIEW_IMPLICATIONS"));
  if (!ts.isObjectLiteralExpression(expression))
    throw new Error("VIEW_IMPLICATIONS must be an object.");
  const result: Record<string, string[]> = {};
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) throw new Error(`Unsupported VIEW_IMPLICATIONS key: ${property.getText()}`);
    result[key] = stringArray(unwrapExpression(property.initializer), `VIEW_IMPLICATIONS.${key}`);
  }
  return result;
}

function permissionModules(sourceFile: ts.SourceFile): Map<string, string[]> {
  const expression = unwrapExpression(variableInitializer(sourceFile, "PERMISSION_MODULES"));
  if (!ts.isArrayLiteralExpression(expression))
    throw new Error("PERMISSION_MODULES must be an array.");
  const modules = new Map<string, string[]>();
  for (const element of expression.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const moduleId = stringFallback(objectProperty(element, "id"));
    if (!moduleId) throw new Error(`Permission module has no id: ${element.getText()}`);
    for (const field of ["viewKeys", "editKeys", "viewIncludedWith"] as const) {
      const value = objectProperty(element, field);
      if (!value) continue;
      for (const key of stringArray(unwrapExpression(value), `${moduleId}.${field}`)) {
        const current = modules.get(key) ?? [];
        current.push(moduleId);
        modules.set(key, current);
      }
    }
  }
  return modules;
}

function mobilePermissionKeys(sourceFile: ts.SourceFile): Set<string> {
  const initializer = unwrapExpression(variableInitializer(sourceFile, "mobilePermissionsSchema"));
  if (!ts.isCallExpression(initializer) || initializer.arguments.length === 0) {
    throw new Error("mobilePermissionsSchema must be a z.object call.");
  }
  const object = unwrapExpression(initializer.arguments[0]);
  if (!ts.isObjectLiteralExpression(object))
    throw new Error("mobilePermissionsSchema has no object shape.");
  return new Set(
    object.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return [];
      const key = propertyName(property.name);
      return key ? [key] : [];
    }),
  );
}

export function collectPermissions(repoRoot: string): PermissionItem[] {
  const domainFile = path.join(repoRoot, "packages/domain/src/permissions.ts");
  const authzFile = path.join(repoRoot, "packages/authz/src/index.ts");
  const editorFile = path.join(repoRoot, "apps/web/src/components/PermissionsEditor.tsx");
  const mobileFile = path.join(repoRoot, "packages/contracts/src/mobile.ts");
  const domain = parseTypeScript(domainFile);
  const declaration = domain.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === "AdminPermissions",
  );
  if (!declaration) throw new Error("Missing AdminPermissions interface.");
  const keys = declaration.members.map((member) => {
    if (!ts.isPropertySignature(member))
      throw new Error("AdminPermissions contains a non-property member.");
    const key = propertyName(member.name);
    if (!key) throw new Error(`Unsupported AdminPermissions key: ${member.getText()}`);
    return key;
  });
  const authz = parseTypeScript(authzFile);
  const userDefaults = booleanObject(authz, "READ_ONLY_PERMS");
  const adminDefaults = booleanObject(authz, "ADMIN_DEFAULT_PERMS");
  const allDefaults = booleanObject(authz, "ALL_PERMS");
  const implications = implicationMap(authz);
  const modules = permissionModules(parseTypeScript(editorFile));
  const mobileKeys = mobilePermissionKeys(parseTypeScript(mobileFile));
  for (const key of keys) {
    if (!(key in userDefaults) || !(key in adminDefaults) || !(key in allDefaults)) {
      throw new Error(`Permission defaults are incomplete for ${key}.`);
    }
    if (!mobileKeys.has(key)) throw new Error(`Mobile permission contract is missing ${key}.`);
  }
  for (const key of [...modules.keys(), ...Object.keys(implications)]) {
    if (!keys.includes(key)) throw new Error(`Unknown permission reference: ${key}`);
  }
  return keys.map((key, sourceOrder) => ({
    id: `permission:${key}`,
    key,
    sourceOrder,
    roleDefaults: {
      user: userDefaults[key],
      admin: adminDefaults[key],
      superAdmin: allDefaults[key],
      gridmaster: allDefaults[key],
    },
    impliedBy: [...(implications[key] ?? [])].sort(),
    uiModules: [...new Set(modules.get(key) ?? [])].sort(),
    mobileContract: mobileKeys.has(key),
    source: { path: repositoryPath(repoRoot, domainFile) },
  }));
}

interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  workspaces?: string[];
  scripts?: Record<string, string>;
}

function readPackage(filePath: string): PackageManifest {
  return JSON.parse(readFileSync(filePath, "utf8")) as PackageManifest;
}

export function collectWorkspaces(repoRoot: string): WorkspaceItem[] {
  const rootManifest = readPackage(path.join(repoRoot, "package.json"));
  const patterns = rootManifest.workspaces;
  if (!patterns || patterns.length === 0) throw new Error("Root package.json has no workspaces.");
  const items: WorkspaceItem[] = [];
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) throw new Error(`Unsupported workspace pattern: ${pattern}`);
    const parentRelative = pattern.slice(0, -2);
    const parent = path.join(repoRoot, parentRelative);
    for (const entry of readdirSync(parent).sort()) {
      const workspacePath = path.join(parent, entry);
      const manifestPath = path.join(workspacePath, "package.json");
      try {
        if (!statSync(manifestPath).isFile()) continue;
      } catch {
        continue;
      }
      const realWorkspace = realpathSync(workspacePath);
      if (!realWorkspace.startsWith(`${realpathSync(repoRoot)}${path.sep}`)) {
        throw new Error(`Workspace resolves outside repository: ${workspacePath}`);
      }
      const manifest = readPackage(manifestPath);
      if (!manifest.name) throw new Error(`Workspace has no package name: ${manifestPath}`);
      items.push({
        id: `workspace:${manifest.name}`,
        name: manifest.name,
        path: posixPath(path.relative(repoRoot, workspacePath)),
        version: manifest.version ?? "0.0.0",
        private: manifest.private === true,
        source: { path: repositoryPath(repoRoot, manifestPath) },
      });
    }
  }
  assertUnique(items, (item) => item.id, "workspace package name");
  assertUnique(items, (item) => item.path, "workspace path");
  return asciiSort(items, (item) => item.id);
}

export function collectPackageScripts(repoRoot: string): PackageScriptItem[] {
  const owners = [
    { packageName: "root", workspacePath: ".", manifestPath: path.join(repoRoot, "package.json") },
    ...collectWorkspaces(repoRoot).map((workspace) => ({
      packageName: workspace.name,
      workspacePath: workspace.path,
      manifestPath: path.join(repoRoot, workspace.source.path),
    })),
  ];
  const scripts = owners.flatMap((owner) => {
    const manifest = readPackage(owner.manifestPath);
    return Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
      id: `script:${owner.packageName}:${name}`,
      package: owner.packageName,
      workspacePath: owner.workspacePath,
      name,
      command,
      source: { path: repositoryPath(repoRoot, owner.manifestPath) },
    }));
  });
  assertUnique(scripts, (script) => script.id, "package script");
  return asciiSort(scripts, (script) => script.id);
}

export function collectSupportedCommands(
  repoRoot: string,
  scripts = collectPackageScripts(repoRoot),
): SupportedCommandItem[] {
  const policyPath = path.join(repoRoot, "internal/documentation/source-policy.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8")) as DocumentationSourcePolicy;
  if (policy.schemaVersion !== 1)
    throw new Error("Unsupported documentation source policy schema.");
  const scriptsById = new Map(scripts.map((script) => [script.id, script]));
  const commands = Object.entries(policy.commands).map(([scriptId, classification]) => {
    const script = scriptsById.get(scriptId);
    if (!script)
      throw new Error(`Documentation command policy names a missing script: ${scriptId}`);
    return {
      id: `command:${script.package}:${script.name}`,
      scriptId,
      invocation:
        script.package === "root"
          ? `npm run ${script.name}`
          : `npm --workspace ${script.package} run ${script.name}`,
      audience: classification.audience,
      status: classification.status,
      ...(classification.reason ? { reason: classification.reason } : {}),
    };
  });
  const unclassified = scripts
    .filter((script) => script.package === "root" && !policy.commands[script.id])
    .map((script) => script.id);
  if (unclassified.length > 0)
    throw new Error(`Unclassified root scripts: ${unclassified.join(", ")}`);
  assertUnique(commands, (command) => command.id, "supported command");
  return asciiSort(commands, (command) => command.id);
}

function loadSourcePolicy(repoRoot: string): DocumentationSourcePolicy {
  const policyPath = path.join(repoRoot, "internal/documentation/source-policy.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8")) as DocumentationSourcePolicy;
  if (policy.schemaVersion !== 1)
    throw new Error("Unsupported documentation source policy schema.");
  if (!policy.commands || !policy.environment) {
    throw new Error(
      "Documentation source policy is missing commands or environment classifications.",
    );
  }
  return policy;
}

export function collectMigrations(repoRoot: string): MigrationItem[] {
  const directory = path.join(repoRoot, "supabase/migrations");
  const inventory = loadMigrationInventory(directory);
  assertMigrationChecksumManifest(inventory, path.join(directory, "checksums.sha256"));
  return inventory.map((migration) => ({
    id: `migration:${migration.file}`,
    version: migration.version,
    name: migration.name,
    file: migration.file,
    sha256: migration.sha256,
    source: { path: `supabase/migrations/${migration.file}` },
  }));
}

function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ");
}

function sqlIdentifier(value: string): { schema: string; table: string } | undefined {
  const cleaned = value.replaceAll('"', "");
  const parts = cleaned.split(".");
  if (parts.length === 1) return { schema: "public", table: parts[0] };
  if (parts.length === 2) return { schema: parts[0], table: parts[1] };
  return undefined;
}

interface TableState {
  schema: string;
  table: string;
  createdIn: SourceRef;
  enabledIn?: SourceRef;
  enabled: boolean;
  dropped: boolean;
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export function collectRlsTables(repoRoot: string): RlsTableItem[] {
  const migrations = collectMigrations(repoRoot);
  const tables = new Map<string, TableState>();
  for (const migration of migrations) {
    const source = migration.source;
    const sql = stripSqlNoise(readFileSync(path.join(repoRoot, source.path), "utf8"));
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      const create =
        /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)/i.exec(
          statement,
        );
      if (create) {
        const name = sqlIdentifier(create[1]);
        if (name?.schema === "public") {
          const key = tableKey(name.schema, name.table);
          tables.set(key, { ...name, createdIn: source, enabled: false, dropped: false });
        }
        continue;
      }
      const alterRls =
        /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?((?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY/i.exec(
          statement,
        );
      if (alterRls) {
        const name = sqlIdentifier(alterRls[1]);
        if (name?.schema === "public") {
          const state = tables.get(tableKey(name.schema, name.table));
          if (!state) throw new Error(`RLS mutation references an unknown table: ${alterRls[1]}`);
          state.enabled = alterRls[2].toUpperCase() === "ENABLE";
          state.enabledIn = source;
        }
        continue;
      }
      const rename =
        /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?((?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)\s+RENAME\s+TO\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i.exec(
          statement,
        );
      if (rename) {
        const current = sqlIdentifier(rename[1]);
        const next = sqlIdentifier(rename[2]);
        if (current?.schema === "public" && next) {
          const currentKey = tableKey(current.schema, current.table);
          const state = tables.get(currentKey);
          if (!state) throw new Error(`Table rename references an unknown table: ${rename[1]}`);
          tables.delete(currentKey);
          state.table = next.table;
          tables.set(tableKey(state.schema, state.table), state);
        }
        continue;
      }
      const drop =
        /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(
          statement,
        );
      if (drop) {
        for (const listed of drop[1].split(",")) {
          const name = sqlIdentifier(listed.trim());
          if (name?.schema === "public") {
            const state = tables.get(tableKey(name.schema, name.table));
            if (state) state.dropped = true;
          }
        }
      }
    }
  }
  const surviving = [...tables.values()].filter((table) => !table.dropped);
  const missingRls = surviving.filter((table) => !table.enabled || !table.enabledIn);
  if (missingRls.length > 0) {
    throw new Error(
      `Public tables without enabled RLS: ${missingRls
        .map((table) => table.table)
        .sort()
        .join(", ")}`,
    );
  }
  return asciiSort(
    surviving.map((table) => ({
      id: `rls:${table.schema}.${table.table}`,
      schema: table.schema,
      table: table.table,
      enabled: true as const,
      createdIn: table.createdIn,
      enabledIn: table.enabledIn!,
    })),
    (table) => table.id,
  );
}

interface EnvironmentDiscovery {
  name: string;
  declarations: Set<string>;
  usages: Set<string>;
  examples: Set<string>;
  scopes: Set<string>;
}

function environmentScope(relativePath: string): string {
  if (relativePath.startsWith("apps/mobile/")) return "mobile-client";
  if (relativePath.startsWith("apps/web/src/") && relativePath.includes("env.client"))
    return "web-client";
  if (relativePath.startsWith("apps/web/")) return "web-server";
  if (relativePath.startsWith(".github/workflows/")) return "ci";
  if (relativePath.startsWith("scripts/") || relativePath.startsWith("seed")) return "script";
  return "provider";
}

function addEnvironmentReference(
  entries: Map<string, EnvironmentDiscovery>,
  name: string,
  sourcePath: string,
  kind: "declaration" | "usage" | "example",
): void {
  const entry = entries.get(name) ?? {
    name,
    declarations: new Set<string>(),
    usages: new Set<string>(),
    examples: new Set<string>(),
    scopes: new Set<string>(),
  };
  if (kind === "declaration") entry.declarations.add(sourcePath);
  else if (kind === "usage") entry.usages.add(sourcePath);
  else entry.examples.add(sourcePath);
  entry.scopes.add(environmentScope(sourcePath));
  entries.set(name, entry);
}

const ENVIRONMENT_SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
const ENV_NAME = "[A-Z](?:[A-Z0-9_]*[A-Z0-9])?";

/** Uppercase names read from `process.env` (dot, optional-chain, bracket or destructured) or an `env` object. */
export function environmentReadsIn(source: string): string[] {
  const names = new Set<string>();
  const member = new RegExp(
    `\\b(?:process\\.env|env)(?:\\??\\.(${ENV_NAME})(?![A-Za-z0-9_])|\\??\\.?\\[\\s*["'](${ENV_NAME})["']\\s*\\])`,
    "g",
  );
  for (const match of source.matchAll(member)) names.add(match[1] ?? match[2]);
  for (const match of source.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)) {
    for (const part of match[1].split(",")) {
      const name = /^\s*(?:\.\.\.)?\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(part)?.[1];
      if (name && new RegExp(`^${ENV_NAME}$`).test(name)) names.add(name);
    }
  }
  return [...names];
}

export function discoverEnvironmentKeys(repoRoot: string): Map<string, EnvironmentDiscovery> {
  const entries = new Map<string, EnvironmentDiscovery>();
  const roots = [
    "apps/web/src",
    "apps/mobile/src",
    "apps/mobile/app",
    "scripts",
    "e2e",
    ".github/workflows",
  ];
  const files = roots.flatMap((relativeRoot) => {
    const absolute = path.join(repoRoot, relativeRoot);
    try {
      return walkFiles(absolute, (file) =>
        [...ENVIRONMENT_SOURCE_EXTENSIONS, ".yml", ".yaml"].includes(path.extname(file)),
      );
    } catch {
      return [];
    }
  });
  // Root and app-level config files (Sentry, Playwright, Next, seed) read keys too.
  for (const directory of [".", "apps/web", "apps/mobile"]) {
    const absolute = path.join(repoRoot, directory);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isFile() && ENVIRONMENT_SOURCE_EXTENSIONS.includes(path.extname(entry.name)))
        files.push(path.join(absolute, entry.name));
    }
  }
  // Unit tests are not configuration; E2E specs are, since operators tune them by key.
  const isTest = (file: string) => /(^|\/)__tests__\/|\.test\.[cm]?[jt]sx?$/.test(file);
  for (const file of [...new Set(files)].filter((file) => !isTest(file)).sort()) {
    const relative = repositoryPath(repoRoot, file);
    const source = readFileSync(file, "utf8");
    const declares = relative.includes("/env.") || relative.endsWith("/env.ts");
    // A workflow's `env` members are its own constants; its keys come from `secrets` and `vars`.
    const reads = /\.ya?ml$/.test(relative) ? [] : environmentReadsIn(source);
    for (const name of reads) {
      addEnvironmentReference(entries, name, relative, declares ? "declaration" : "usage");
    }
    // The env modules declare keys as schema properties read through `safeParse(process.env)`.
    if (declares) {
      for (const match of source.matchAll(new RegExp(`^\\s+(${ENV_NAME})\\s*:`, "gm"))) {
        addEnvironmentReference(entries, match[1], relative, "declaration");
      }
    }
    for (const match of source.matchAll(
      /\b(?:secrets|vars)\.([A-Z](?:[A-Z0-9_]*[A-Z0-9])?)(?![A-Z0-9_])/g,
    )) {
      addEnvironmentReference(entries, match[1], relative, "declaration");
    }
  }
  for (const example of [".env.example", "apps/web/.env.example", "apps/mobile/.env.example"]) {
    const file = path.join(repoRoot, example);
    try {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        // A commented `# KEY=` line documents an optional key.
        const match = /^(?:#\s*)?([A-Z][A-Z0-9_]*)=/.exec(line.trim());
        if (match) addEnvironmentReference(entries, match[1], example, "example");
      }
    } catch {
      // Optional in fixtures.
    }
  }
  return entries;
}

export function collectEnvironmentKeys(repoRoot: string): EnvironmentKeyItem[] {
  const entries = discoverEnvironmentKeys(repoRoot);
  const policy = loadSourcePolicy(repoRoot);
  const unknown = [...entries.keys()].filter((name) => !policy.environment[name]).sort();
  if (unknown.length > 0) throw new Error(`Unclassified environment keys: ${unknown.join(", ")}`);
  const stale = Object.keys(policy.environment)
    .filter((name) => !entries.has(name))
    .sort();
  if (stale.length > 0)
    throw new Error(`Environment policy contains undiscovered keys: ${stale.join(", ")}`);
  return asciiSort(
    [...entries.values()].map((entry) => ({
      id: `env:${entry.name}`,
      name: entry.name,
      scopes: [...entry.scopes].sort(),
      declaration: policy.environment[entry.name].declaration,
      exposure: policy.environment[entry.name].exposure,
      declarations: [...entry.declarations].sort().map((sourcePath) => ({ path: sourcePath })),
      usages: [...entry.usages].sort().map((sourcePath) => ({ path: sourcePath })),
      exampleFiles: [...entry.examples].sort(),
    })),
    (entry) => entry.id,
  );
}

function workflowCrons(source: string, filePath: string): string[] {
  const lines = source.split("\n");
  const crons: string[] = [];
  let scheduleIndent: number | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (/^schedule:\s*$/.test(trimmed)) {
      scheduleIndent = indent;
      continue;
    }
    if (scheduleIndent !== undefined && trimmed && indent <= scheduleIndent)
      scheduleIndent = undefined;
    if (scheduleIndent !== undefined) {
      const match = /^-\s+cron:\s*["']([^"']+)["']/.exec(trimmed);
      if (match) crons.push(match[1]);
    }
  }
  if (/\bcron:/.test(source) && crons.length === 0) {
    throw new Error(`Unable to parse scheduled workflow cron: ${filePath}`);
  }
  return crons;
}

export function collectScheduledJobs(repoRoot: string): ScheduledJobItem[] {
  const jobs: ScheduledJobItem[] = [];
  const vercelPath = path.join(repoRoot, "apps/web/vercel.json");
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  for (const cron of vercel.crons ?? []) {
    jobs.push({
      id: `schedule:vercel:${cron.path}`,
      provider: "vercel",
      schedule: cron.schedule,
      target: { kind: "http", path: cron.path },
      category: "product",
      source: { path: repositoryPath(repoRoot, vercelPath) },
    });
  }
  const workflowsRoot = path.join(repoRoot, ".github/workflows");
  for (const file of walkFiles(workflowsRoot, (candidate) =>
    [".yml", ".yaml"].includes(path.extname(candidate)),
  )) {
    const relative = repositoryPath(repoRoot, file);
    const crons = workflowCrons(readFileSync(file, "utf8"), relative);
    crons.forEach((schedule, index) => {
      const workflow = path.basename(file).replace(/\.ya?ml$/, "");
      jobs.push({
        id: `schedule:github:${workflow}:${index + 1}`,
        provider: "github-actions",
        schedule,
        target: { kind: "workflow", workflow: relative },
        category: "product",
        source: { path: relative },
      });
    });
  }
  assertUnique(jobs, (job) => job.id, "scheduled job");
  const classifications = loadSourcePolicy(repoRoot).scheduledJobs ?? {};
  const unclassified = jobs.filter((job) => !classifications[job.id]).map((job) => job.id);
  if (unclassified.length > 0)
    throw new Error(`Unclassified scheduled jobs: ${unclassified.sort().join(", ")}`);
  const known = new Set(jobs.map((job) => job.id));
  const stale = Object.keys(classifications).filter((id) => !known.has(id));
  if (stale.length > 0)
    throw new Error(`Scheduled job policy contains undiscovered jobs: ${stale.sort().join(", ")}`);
  return asciiSort(
    jobs.map((job) => ({ ...job, category: classifications[job.id].category })),
    (job) => job.id,
  );
}

// Hashes the extracted facts, not source bodies, so an edit that changes no fact
// (a comment, a refactor) leaves the committed inventory current.
export function inventoryDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function buildDocumentationInventory(repoRoot: string): DocumentationSourceInventory {
  const packageScripts = collectPackageScripts(repoRoot);
  const withoutDigest = {
    schemaVersion: 1 as const,
    webRoutes: collectWebRoutes(repoRoot),
    mobileRoutes: collectMobileRoutes(repoRoot),
    settingsSections: collectSettingsSections(repoRoot),
    httpMethods: collectHttpMethods(repoRoot),
    permissions: collectPermissions(repoRoot),
    workspaces: collectWorkspaces(repoRoot),
    migrations: collectMigrations(repoRoot),
    rlsTables: collectRlsTables(repoRoot),
    environmentKeys: collectEnvironmentKeys(repoRoot),
    cronJobs: collectScheduledJobs(repoRoot),
    packageScripts,
    supportedCommands: collectSupportedCommands(repoRoot, packageScripts),
  };
  return { ...withoutDigest, sourceDigest: inventoryDigest(withoutDigest) };
}

export function renderInventoryJson(inventory: DocumentationSourceInventory): string {
  const { schemaVersion, sourceDigest, ...collections } = inventory;
  return `${JSON.stringify({ schemaVersion, sourceDigest, ...collections }, null, 2)}\n`;
}

export function renderInventoryMarkdown(inventory: DocumentationSourceInventory): string {
  const rows = [
    ["Web routes", inventory.webRoutes.length],
    ["Mobile route modules", inventory.mobileRoutes.length],
    ["Settings sections", inventory.settingsSections.length],
    ["Explicit HTTP methods", inventory.httpMethods.length],
    ["Admin permissions", inventory.permissions.length],
    ["Workspace packages", inventory.workspaces.length],
    ["Migrations", inventory.migrations.length],
    ["RLS-enabled public tables", inventory.rlsTables.length],
    ["Environment keys", inventory.environmentKeys.length],
    ["Scheduled jobs", inventory.cronJobs.length],
    ["Package scripts", inventory.packageScripts.length],
    ["Classified commands", inventory.supportedCommands.length],
  ] as const;
  return [
    "# Generated application inventory",
    "",
    "> Generated by `npm run docs:inventory`. Do not edit by hand.",
    "",
    `Source digest: \`${inventory.sourceDigest}\``,
    "",
    "| Collection | Count |",
    "| --- | ---: |",
    ...rows.map(([label, count]) => `| ${label} | ${count} |`),
    "",
    "Volatile details live in `app-inventory.json`; current prose should link here instead of copying totals.",
    "",
  ].join("\n");
}
