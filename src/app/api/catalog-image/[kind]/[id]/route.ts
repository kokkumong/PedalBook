import { cachedCatalogImage, imageSources } from '../../../../../server/catalog-image';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  const sources = imageSources(kind, id);
  if (!sources.length) return new Response('Unknown catalog image', { status: 404 });
  try {
    const image = await cachedCatalogImage(sources);
    return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('Image temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
}
