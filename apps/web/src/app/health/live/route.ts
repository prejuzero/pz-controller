// Liveness do contêiner (HEALTHCHECK e ALB, ADR-010): o processo do Next.js responde.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
