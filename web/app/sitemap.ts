import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ['', '/es', '/download', '/privacy', '/terms', '/impressum', '/account', '/freelancers', '/es/freelancers', '/pt/freelancers'].map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' || path === '/es' ? 1 : path === '/download' ? 0.9 : 0.3
  }))
}
