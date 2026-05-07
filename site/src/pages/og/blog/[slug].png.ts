import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OgImage } from '../../../components/OgImage';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return new Response('Not found', { status: 404 });
  }

  const posts = await getCollection('blog');
  const post = posts.find(p => p.id === slug);
  if (!post || post.data.draft) {
    return new Response('Not found', { status: 404 });
  }

  const { title, tags } = post.data;
  const tag = tags[0];

  const fontUrl = 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf';
  const fontResponse = await fetch(fontUrl);
  const fontData = await fontResponse.arrayBuffer();

  const svg = await satori(OgImage({ title, tag }), {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'DM Sans',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'DM Sans',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts
    .filter(post => !post.data.draft)
    .map(post => ({
      params: { slug: post.id },
    }));
}
