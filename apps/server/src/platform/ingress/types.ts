/** Ingress admit stub — Wave 3. Not wired to Fastify chat routes. */

export type IngressPrincipal = {
  kind: string
  id?: string
  sessionId?: string
}

export type Envelope = {
  traceId: string
  origin: string
  text: string
  sessionId?: string
  /** Optional job id attached by job.wake admit (Wave 6A). */
  jobId?: string
  principal?: IngressPrincipal
}

export type IngressAdmitResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; error: string }

export type IngressRouter = {
  admit(
    origin: string,
    raw: { text?: string; sessionId?: string },
  ): IngressAdmitResult
}
