/**
 * no-inline-api-shape — bans hand-written object type literals in the API client layer.
 *
 * `src/client/lib/api/**` talks to a server whose request/response shapes are already
 * defined once, in `packages/protocol/schemas/`. A hand-typed object type here
 * (`data: { name: string; phone: string }`, `Promise<{ users: User[] }>`) is invisible to
 * the server: it stays internally consistent, so `tsc` passes even as it silently drifts
 * from the schema the route actually validates against. That is exactly how `createUser`
 * (4 hand-typed fields vs. `createUserBodySchema`'s 10) and `listUsers` (claims
 * `userAdminResponseSchema`'s `phone` field via a hand-wrapped `User[]`, when the route
 * returns `userListResponseSchema`, whose members have no `phone`) drifted — see the
 * `ll-api-schema-binding` binding report (`scripts/api-schema-binding/report.md`) for the
 * full inventory this rule exists to stop from growing.
 *
 * Fix: import the type from `@protocol/schemas` (adding a one-line
 * `export type X = z.infer<typeof someSchema>` beside the schema if one doesn't exist yet —
 * never redefine the shape at the call site).
 *
 * Escape hatch (rare — a shape with no server-validated schema at all, e.g. a value
 * assembled purely client-side): silence a single line with a reason, so it stays
 * greppable and doesn't become the default:
 *   // eslint-disable-next-line local/no-inline-api-shape -- <why this has no protocol schema>
 */

/** @type {import('eslint').Rule.RuleModule} */
const noInlineApiShape = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow inline object type literals in src/client/lib/api/** — import the shape from @protocol/schemas instead.',
      recommended: true,
    },
    schema: [],
    messages: {
      inlineShape:
        'Inline object type literal in the API client layer. Import the request/response type from ' +
        '@protocol/schemas instead of hand-writing its shape here — see scripts/api-schema-binding/report.md ' +
        'for why this specific pattern already caused real client/server drift.',
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        context.report({ node, messageId: 'inlineShape' })
      },
    }
  },
}

export default noInlineApiShape
