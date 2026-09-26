#!/usr/bin/env bun
/**
 * codemod.ts — rewrite one exported api-client function from a hand-written
 * request/response shape to the protocol schema's type alias, driven
 * entirely by bind-report.ts's classification. No shape is invented here:
 * every replacement type name comes from `packages/protocol/schemas`, and a
 * function is only touched when the report says UNBOUND *and* names a
 * `schemaTypeAlias` to switch to.
 *
 * A MISMATCHED binding (client imports a real protocol type, but not the one
 * this route's schema actually maps to — e.g. `createUser`'s response using
 * `User`/`userAdminResponseSchema` when the route validates against
 * `userResponseSchema`) is never silently "corrected": swapping the type
 * changes what the client claims the server returns, which is a product
 * decision, not a mechanical one. Instead the codemod inserts a loud,
 * greppable comment naming both types, for a human to resolve.
 *
 * Modes:
 *   --write            rewrite the function(s) in place in --source
 *   --extract-to FILE  read the function(s) from --source (leaving it
 *                      untouched) and emit the transformed versions,
 *                      together with the imports they need, to FILE
 *
 * `--extract-to` exists for exactly one situation: `src/client/lib/api.ts`
 * is being split into per-domain modules by a concurrent PR (#874) that owns
 * every edit to that file. Demonstrating the codemod on a domain module
 * (`users.ts`) without waiting for that PR, and without touching a file this
 * change doesn't own, means reading the "before" shape out of api.ts and
 * writing the "after" shape to the new module — never editing api.ts itself.
 * The normal, intended end-state for every other module is `--write`,
 * applied directly to each new module file once it exists.
 *
 * Usage:
 *   bun scripts/api-schema-binding/codemod.ts \
 *     --source src/client/lib/api.ts \
 *     --function listUsers,createUser,updateUser,deleteUser \
 *     --extract-to src/client/lib/api/users.ts
 */
import { writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'
import { findCalls, parseFile } from './ast-utils'
import { buildBindingReport, type BindingRow } from './bind-report'

interface Edit {
  start: number
  end: number
  replacement: string
}

interface FunctionCodemodResult {
  functionName: string
  transformedText: string
  importsNeeded: Set<string> // PascalCase type names to import from '@protocol/schemas'
  mismatchNotes: string[]
  fnStart: number
  fnEnd: number
}

function unwrapPromise(t: ts.TypeNode): ts.TypeNode {
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'Promise' && t.typeArguments?.[0]) {
    return t.typeArguments[0]
  }
  return t
}

/** Re-locate the exact type nodes bind-report.ts classified for this function, for editing. */
function locateTypeNodes(sf: ts.SourceFile, fn: ts.FunctionDeclaration, requestCall: ts.CallExpression) {
  const optionsArg = requestCall.arguments[1]
  let bodyTypeNode: ts.TypeNode | undefined
  if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
    const bodyProp = optionsArg.properties.find(
      (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'body',
    )
    const init = bodyProp?.initializer
    if (init && ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) &&
        ts.isIdentifier(init.expression.expression) && init.expression.expression.text === 'JSON' && init.expression.name.text === 'stringify') {
      const arg = init.arguments[0]
      if (arg && ts.isIdentifier(arg)) {
        const param = fn.parameters.find(p => ts.isIdentifier(p.name) && p.name.text === arg.text)
        bodyTypeNode = param?.type
      }
    }
  }

  let responseTypeNode: ts.TypeNode | undefined
  if (requestCall.typeArguments?.[0]) {
    responseTypeNode = requestCall.typeArguments[0]
  } else if (fn.type) {
    responseTypeNode = unwrapPromise(fn.type)
  }

  return { bodyTypeNode, responseTypeNode }
}

function codemodFunction(sf: ts.SourceFile, fn: ts.FunctionDeclaration, row: BindingRow): FunctionCodemodResult {
  const functionName = fn.name!.text
  const importsNeeded = new Set<string>()
  const mismatchNotes: string[] = []
  const edits: Edit[] = []

  const requestCalls = fn.body ? findCalls(fn.body, 'request') : []
  const requestCall = requestCalls[0]

  if (requestCall) {
    const { bodyTypeNode, responseTypeNode } = locateTypeNodes(sf, fn, requestCall)

    if (row.body.verdict === 'UNBOUND' && row.body.schemaTypeAlias && bodyTypeNode) {
      edits.push({ start: bodyTypeNode.getStart(sf), end: bodyTypeNode.getEnd(), replacement: row.body.schemaTypeAlias })
      importsNeeded.add(row.body.schemaTypeAlias)
    } else if (row.body.verdict === 'UNBOUND' && !row.body.schemaTypeAlias && row.body.schemaIdent) {
      mismatchNotes.push(`body: no PascalCase type alias exists yet for \`${row.body.schemaIdent}\` — add one in packages/protocol/schemas, then re-run the codemod`)
    } else if (row.body.verdict === 'MISMATCHED') {
      mismatchNotes.push(`body: client uses \`${row.body.clientType}\`, but this route's schema is \`${row.body.schemaIdent}\`${row.body.schemaTypeAlias ? ` (\`${row.body.schemaTypeAlias}\`)` : ' (no type alias yet)'} — needs human review, not auto-fixed`)
      // Left unchanged (see note above), but it's still referenced in the sliced function
      // text below and must stay importable — MISMATCHED only fires for a type already
      // confirmed (in bind-report.ts's classifyType) to be imported from @protocol/schemas.
      if (row.body.clientType) importsNeeded.add(row.body.clientType)
    }

    if (row.response.verdict === 'UNBOUND' && row.response.schemaTypeAlias && responseTypeNode) {
      edits.push({ start: responseTypeNode.getStart(sf), end: responseTypeNode.getEnd(), replacement: row.response.schemaTypeAlias })
      importsNeeded.add(row.response.schemaTypeAlias)
    } else if (row.response.verdict === 'UNBOUND' && !row.response.schemaTypeAlias && row.response.schemaIdent) {
      mismatchNotes.push(`response: no PascalCase type alias exists yet for \`${row.response.schemaIdent}\` — add one in packages/protocol/schemas, then re-run the codemod`)
    } else if (row.response.verdict === 'MISMATCHED') {
      mismatchNotes.push(`response: client uses \`${row.response.clientType}\`, but this route's schema is \`${row.response.schemaIdent}\`${row.response.schemaTypeAlias ? ` (\`${row.response.schemaTypeAlias}\`)` : ' (no type alias yet)'} — needs human review, not auto-fixed`)
      if (row.response.clientType) importsNeeded.add(row.response.clientType)
    }
  }

  const fullStart = fn.getStart(sf)
  const fullEnd = fn.getEnd()
  let text = sf.text.slice(fullStart, fullEnd)
  // Apply edits back-to-front so earlier offsets stay valid.
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start - fullStart) + edit.replacement + text.slice(edit.end - fullStart)
  }

  if (mismatchNotes.length) {
    const banner = mismatchNotes
      .map(n => `// SCHEMA MISMATCH (api-schema-binding, ${functionName}): ${n}`)
      .join('\n')
    text = `${banner}\n${text}`
  }

  return { functionName, transformedText: text, importsNeeded, mismatchNotes, fnStart: fullStart, fnEnd: fullEnd }
}

function findExportedFunction(sf: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return stmt
  }
  return undefined
}

/** True if `hp(...)` is called anywhere in the function — the codemod must supply an equivalent helper. */
function usesHp(fn: ts.FunctionDeclaration): boolean {
  return fn.body ? findCalls(fn.body, 'hp').length > 0 : false
}

export function runCodemod(sourcePath: string, functionNames: string[]): {
  sf: ts.SourceFile
  results: FunctionCodemodResult[]
  anyUsesHp: boolean
  allImports: string[]
} {
  const { rows } = buildBindingReport()
  const sf = parseFile(sourcePath)
  const relSource = relative(process.cwd(), resolve(sourcePath))

  const results: FunctionCodemodResult[] = []
  let anyUsesHp = false
  const allImports = new Set<string>()

  for (const name of functionNames) {
    const fn = findExportedFunction(sf, name)
    if (!fn) throw new Error(`codemod: function "${name}" not found in ${sourcePath}`)
    const row = rows.find(r => r.functionName === name && r.file === relSource)
    if (!row) throw new Error(`codemod: no binding report row for "${name}" in ${relSource} — run bind-report.ts first`)

    const result = codemodFunction(sf, fn, row)
    results.push(result)
    if (usesHp(fn)) anyUsesHp = true
    for (const imp of result.importsNeeded) allImports.add(imp)
  }

  return { sf, results, anyUsesHp, allImports: [...allImports].sort() }
}

/** Every identifier already reachable via an import in `sf` — used to avoid re-importing a name that's already in scope. */
function allImportedIdentifiers(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const clause = stmt.importClause
    if (!clause) continue
    if (clause.name) names.add(clause.name.text)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) names.add(el.name.text)
    }
  }
  return names
}

/**
 * Applies the function-body edits to the FULL source text in place (for `--write` mode), and
 * merges any newly-needed protocol type imports into an existing `@protocol/schemas` import
 * statement, or appends a new one after the last import if none exists.
 */
export function applyInPlace(sf: ts.SourceFile, results: FunctionCodemodResult[], allImports: string[]): string {
  const alreadyImported = allImportedIdentifiers(sf)
  const newImports = allImports.filter(name => !alreadyImported.has(name))

  const edits: Edit[] = results.map(r => ({ start: r.fnStart, end: r.fnEnd, replacement: r.transformedText }))

  const barrelImport = sf.statements.find(
    (s): s is ts.ImportDeclaration =>
      ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === '@protocol/schemas' &&
      !!s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings),
  )

  if (newImports.length) {
    if (barrelImport?.importClause?.namedBindings && ts.isNamedImports(barrelImport.importClause.namedBindings)) {
      const namedImports = barrelImport.importClause.namedBindings
      const insertAt = namedImports.elements[namedImports.elements.length - 1]?.getEnd() ?? namedImports.getStart(sf) + 1
      edits.push({ start: insertAt, end: insertAt, replacement: `, ${newImports.join(', ')}` })
    } else {
      const lastImport = [...sf.statements].reverse().find(ts.isImportDeclaration)
      const insertAt = lastImport ? lastImport.getEnd() : 0
      edits.push({ start: insertAt, end: insertAt, replacement: `\nimport type { ${newImports.join(', ')} } from '@protocol/schemas'` })
    }
  }

  let text = sf.text
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  }
  return text
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }

  const source = flag('source')
  const functionArg = flag('function')
  const extractTo = flag('extract-to')
  const write = args.includes('--write')

  if (!source || !functionArg || (!write && !extractTo)) {
    console.error('Usage: bun scripts/api-schema-binding/codemod.ts --source <file> --function <name[,name...]> (--write | --extract-to <file>)')
    process.exit(1)
  }
  const functionNames = functionArg.split(',').map(s => s.trim())

  const { sf, results, anyUsesHp, allImports } = runCodemod(source, functionNames)

  for (const r of results) {
    if (r.mismatchNotes.length) {
      console.warn(`[${r.functionName}] flagged for human review, not auto-fixed:`)
      for (const note of r.mismatchNotes) console.warn(`  - ${note}`)
    }
  }

  if (write) {
    const rewritten = applyInPlace(sf, results, allImports)
    writeFileSync(source, rewritten)
    console.log(`Rewrote ${functionNames.length} function(s) in place in ${source}`)
  }

  if (extractTo) {
    const moduleName = extractTo.split('/').pop()
    const header = [
      '/**',
      ` * ${moduleName} — split from ${source} by the api-schema-binding codemod`,
      ' * (scripts/api-schema-binding/codemod.ts), demonstrating the transform described in',
      ' * scripts/api-schema-binding/report.md.',
      ' *',
      ' * api.ts is owned by PR #874 (splitting api.ts into per-domain modules) and is NOT',
      ' * edited here — see that PR for removing this module\'s functions from api.ts once it',
      ' * lands. Until then this file and api.ts both define these functions; that',
      ' * duplication is temporary and tracked, not an oversight.',
      ' */',
      "import { request" + (anyUsesHp ? ', getActiveHub' : '') + " } from '../api'",
      allImports.length ? `import type { ${allImports.join(', ')} } from '@protocol/schemas'` : undefined,
      anyUsesHp
        ? [
          '',
          "/** Mirrors api.ts's private `hp()` — not exported from there, so re-derived from the",
          ' * same public `getActiveHub()` accessor until api.ts exports it directly. */',
          'function hp(path: string): string {',
          '  const hubId = getActiveHub()',
          '  return hubId ? `/hubs/${hubId}${path}` : path',
          '}',
        ].join('\n')
        : undefined,
      '',
      results.map(r => r.transformedText).join('\n\n'),
      '',
    ].filter((x): x is string => x !== undefined).join('\n')

    writeFileSync(extractTo, header)
    console.log(`Wrote ${extractTo}`)
  }
}

if (import.meta.main) main()
