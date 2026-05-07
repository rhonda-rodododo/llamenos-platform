import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  const posts = await getCollection('blog');
  const publishedPosts = posts
    .filter(post => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Llámenos Blog',
    description: 'Updates on secure crisis hotline technology, security research, and volunteer stories.',
    site: context.site?.toString() || 'https://llamenos-hotline.com',
    items: publishedPosts.map(post => ({
      title: post.data.title,
      description: post.data.description,
      link: `/blog/${post.id}`,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
    })),
    customData: `<language>en</language>`,
  });
};
