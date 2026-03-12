import { resolver } from 'hono-openapi'
import { errorResponseSchema } from '../schemas/common'

const errorSchema = resolver(errorResponseSchema)

/** Standard error responses for authenticated endpoints */
export const authErrors = {
  400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'Not authenticated' },
  403: { description: 'Insufficient permissions' },
}

/** Standard error responses for public endpoints */
export const publicErrors = {
  400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
}

/** 404 error */
export const notFoundError = {
  404: { description: 'Resource not found' },
}

/** Success with { ok: true } */
export const okResponse = (description: string) => ({
  200: { description },
})
