/**
 * ast-utils.ts — shared TypeScript-compiler-API helpers for the route/schema
 * binding tools in this directory.
 *
 * Deliberately uses the `typescript` package directly (already a devDependency)
 * rather than adding ts-morph: this tool's owned-path list does not include
 * package.json/bun.lockb, and the compiler API is sufficient for the AST shapes
 * this codebase actually uses (call expressions, object literals, type nodes).
 */
import ts from 'typescript'
import { readFileSync } from 'node:fs'

export function parseFile(filePath: string): ts.SourceFile {
  const text = readFileSync(filePath, 'utf-8')
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS)
}

/** 1-indexed line number for a node, for human-readable report rows. */
export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

/** Exact source text of a node, whitespace-normalized to one line for table display. */
export function textOf(sf: ts.SourceFile, node: ts.Node): string {
  return node.getText(sf).replace(/\s+/g, ' ').trim()
}

/** Resolve `foo.bar(...)` / `foo(...)` call identifiers — returns the last property/identifier name. */
export function calleeName(expr: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return undefined
}

/** True when `node` is a string literal, and returns its value. */
export function stringLiteralValue(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

/**
 * Renders a template literal (`` `/users/${id}` ``) to a path pattern with
 * every substitution replaced by `:param` — good enough to compare against
 * Hono's `:param` route syntax. Returns undefined for non-template, non-string nodes.
 */
export function templateToPattern(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text
    for (const span of node.templateSpans) {
      out += ':param' + span.literal.text
    }
    return out
  }
  return undefined
}

/** Find the first call expression matching `calleeName` anywhere under `node` (pre-order). */
export function findCalls(node: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && calleeName(n.expression) === name) out.push(n)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

/** Reads a string-literal-keyed property off an object literal, if present. */
export function getObjectProperty(obj: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && (
      (ts.isIdentifier(prop.name) && prop.name.text === key) ||
      (ts.isStringLiteral(prop.name) && prop.name.text === key)
    )) {
      return prop.initializer
    }
    // Shorthand `{ key }` — initializer === name reference.
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === key) {
      return prop.name
    }
  }
  return undefined
}
