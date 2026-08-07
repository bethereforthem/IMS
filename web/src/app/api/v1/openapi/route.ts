import { NextRequest } from 'next/server'
import { withAuth, apiSuccess } from '@/lib/api-middleware'
import spec from '@/generated/openapi.json'

// ---------------------------------------------------------------------------
// GET /api/v1/openapi
// Serves the OpenAPI 3.0.3 spec generated from the route handlers by
// scripts/generate-openapi.js. Auth-gated: the spec exposes the full endpoint
// and permission map, which is RESTRICTED material.
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req: NextRequest) => {
  return apiSuccess(spec)
})
