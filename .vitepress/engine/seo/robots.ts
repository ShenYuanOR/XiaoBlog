import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { urlOf } from '../url.ts'

export function buildRobots(): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${urlOf('/sitemap.xml')}`,
    '',
  ].join('\n')
}

export function writeRobots(distDir: string): void {
  writeFileSync(join(distDir, 'robots.txt'), buildRobots())
}
