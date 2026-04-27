/**
 * FirehoseInferenceClient — LLM inference for structured report extraction.
 *
 * Uses the OpenAI-compatible chat completions API (works with Ollama, vLLM,
 * llama.cpp, and any OpenAI API-compatible endpoint). Supports structured
 * output via response_format JSON schema.
 *
 * Data minimization: sender identifiers are NEVER sent to the inference
 * endpoint. Messages are anonymized before API calls.
 */
import OpenAI from 'openai'
import type { ResponseFormatJSONSchema } from 'openai/resources/shared'
import { createLogger } from '../lib/logger'

const log = createLogger('services.firehose-inference')

export interface DecryptedFirehoseMessage {
  id: string
  senderUsername: string
  content: string
  timestamp: string
}

export interface MessageCluster {
  id: string
  messages: DecryptedFirehoseMessage[]
  confidence: number
}

export interface ExtractionResult {
  fields: Record<string, string>
  confidence: number
}

export interface CustomFieldDef {
  name: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'number' | 'location'
  required: boolean
  options: string[]
}

export type FieldJsonSchema = {
  type: 'object'
  properties: Record<string, { type: string; description: string; enum?: string[] }>
  required: string[]
}

export class FirehoseInferenceClient {
  private client: OpenAI
  private model: string

  constructor(baseURL: string, model = 'Qwen/Qwen3.5-9B', apiKey = 'not-needed') {
    this.client = new OpenAI({ baseURL, apiKey })
    this.model = model
  }

  /**
   * Generate a JSON Schema from custom field definitions for use as response_format.
   */
  buildJsonSchemaFromFields(fields: CustomFieldDef[]): FieldJsonSchema {
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {}
    const required: string[] = []

    for (const field of fields) {
      const prop: { type: string; description: string; enum?: string[] } = {
        description: field.label || field.name,
        type: 'string',
      }

      switch (field.type) {
        case 'number':
          prop.type = 'string'
          prop.description = `${prop.description} (numeric value)`
          break
        case 'select':
          prop.enum = field.options
          break
        case 'multiselect':
          prop.type = 'string'
          prop.description = `${prop.description} (comma-separated from: ${field.options.join(', ')})`
          break
        case 'checkbox':
          prop.type = 'string'
          prop.description = `${prop.description} (yes or no)`
          break
        case 'date':
          prop.description = `${prop.description} (ISO 8601 datetime)`
          break
        default:
          break
      }

      properties[field.name] = prop
      if (field.required) required.push(field.name)
    }

    return { type: 'object', properties, required }
  }

  /**
   * Build a ResponseFormatJSONSchema object suitable for the OpenAI SDK.
   */
  private buildResponseFormat(name: string, schema: FieldJsonSchema): ResponseFormatJSONSchema {
    return {
      type: 'json_schema',
      json_schema: {
        name,
        schema: schema as { [key: string]: unknown },
      },
    }
  }

  /**
   * Detect incident boundaries in a set of messages.
   * Data minimization: sender usernames are replaced with anonymous IDs
   * before sending to the inference endpoint.
   */
  async detectIncidentBoundaries(
    messages: DecryptedFirehoseMessage[],
    candidates: MessageCluster[],
    geoContext?: string,
  ): Promise<MessageCluster[]> {
    const systemPrompt = [
      'You are an incident boundary detector. Given chat messages from a rapid response group,',
      'determine which messages are about the same incident.',
      geoContext ? `Geographic context: ${geoContext}` : '',
      'Return a JSON object with a "clusters" array. Each cluster has "id" (string), "messageIds" (array of message IDs), and "confidence" (0-1).',
    ]
      .filter(Boolean)
      .join(' ')

    // Anonymize senders — data minimization
    const senderMap = new Map<string, string>()
    let senderCounter = 0
    const getAnonSender = (username: string): string => {
      if (!senderMap.has(username)) {
        senderMap.set(username, `User${++senderCounter}`)
      }
      return senderMap.get(username)!
    }

    const messagesText = messages
      .map((m) => `[${m.id}] ${m.timestamp} ${getAnonSender(m.senderUsername)}: ${m.content}`)
      .join('\n')

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messagesText },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'incident_clusters',
          schema: {
            type: 'object',
            properties: {
              clusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    messageIds: { type: 'array', items: { type: 'string' } },
                    confidence: { type: 'number' },
                  },
                  required: ['id', 'messageIds', 'confidence'],
                },
              },
            },
            required: ['clusters'],
          },
        },
      },
      temperature: 0.1,
      max_tokens: 2048,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      log.warn('LLM returned no content for incident detection, using heuristic clusters', {
        model: this.model,
      })
      return candidates
    }

    let parsed: { clusters: Array<{ id: string; messageIds: string[]; confidence: number }> }
    try {
      parsed = JSON.parse(content)
    } catch {
      log.error('LLM returned invalid JSON for incident detection', {
        model: this.model,
        contentLength: content.length,
      })
      return candidates
    }

    if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
      log.error('LLM response missing clusters array', { model: this.model })
      return candidates
    }

    return parsed.clusters.map((c) => ({
      id: c.id,
      messages: c.messageIds
        .map((mid) => messages.find((m) => m.id === mid))
        .filter((m): m is DecryptedFirehoseMessage => m !== undefined),
      confidence: c.confidence,
    }))
  }

  /**
   * Extract a structured report from a cluster of messages.
   * Data minimization: sender usernames are replaced with generic labels.
   */
  async extractReport(
    messages: DecryptedFirehoseMessage[],
    schema: FieldJsonSchema,
    geoContext?: string,
    systemPromptSuffix?: string,
  ): Promise<ExtractionResult> {
    const systemPrompt = [
      'You are a report extraction agent. Given chat messages from a rapid response firehose group,',
      'extract structured report fields according to the schema.',
      'Include a "confidence" field (0-1) indicating how confident you are in the extraction.',
      geoContext ? `Geographic context: ${geoContext}. Use this to disambiguate locations.` : '',
      systemPromptSuffix ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    // Anonymize senders — data minimization
    const senderMap = new Map<string, string>()
    let senderCounter = 0
    const getAnonSender = (username: string): string => {
      if (!senderMap.has(username)) {
        senderMap.set(username, `Reporter${++senderCounter}`)
      }
      return senderMap.get(username)!
    }

    const messagesText = messages
      .map((m) => `${m.timestamp} ${getAnonSender(m.senderUsername)}: ${m.content}`)
      .join('\n')

    const schemaWithConfidence: FieldJsonSchema = {
      ...schema,
      properties: {
        ...schema.properties,
        confidence: { type: 'number', description: 'Extraction confidence 0-1' },
      },
      required: [...schema.required, 'confidence'],
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messagesText },
      ],
      response_format: this.buildResponseFormat('report_extraction', schemaWithConfidence),
      temperature: 0.1,
      max_tokens: 4096,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      const finishReason = response.choices[0]?.finish_reason ?? 'unknown'
      throw new Error(
        `No extraction response from LLM (model: ${this.model}, finish_reason: ${finishReason})`,
      )
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content)
    } catch (parseErr) {
      throw new Error(
        `LLM returned invalid JSON for extraction (model: ${this.model}, preview: ${content.slice(0, 200)}): ${parseErr}`,
      )
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    const { confidence: _confidence, ...rawFields } = parsed
    const fields: Record<string, string> = Object.fromEntries(
      Object.entries(rawFields).map(([k, v]) => [k, v != null ? String(v) : '']),
    )

    return { fields, confidence }
  }

  /**
   * Health check — ping the inference endpoint.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = performance.now()
    try {
      await this.client.models.list()
      return { ok: true, latencyMs: Math.round(performance.now() - start) }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
