/** Convert internal camelCase API payloads to snake_case for client-ui */

export function toSnakeRating(r: Record<string, unknown>) {
  return {
    institution: r.institution,
    institution_short: r.institutionShort ?? r.institution_short,
    rating: r.rating,
    rating_cn: r.ratingCn ?? r.rating_cn,
    confidence: r.confidence,
    raw_confidence: r.rawConfidence ?? r.raw_confidence,
    method_source: r.methodSource ?? r.method_source,
    model_name: r.modelName ?? r.model_name,
    summary: r.summary,
    group: r.group,
    dimensions: r.dimensions,
  }
}

export function serializeInstitutionData(data: Record<string, unknown>) {
  const ratings = (data.ratings as Record<string, unknown>[] | undefined)?.map(toSnakeRating) ?? []
  return {
    ...data,
    ratings,
    timestamp: new Date().toISOString(),
  }
}
