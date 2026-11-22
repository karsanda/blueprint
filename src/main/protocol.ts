import { isAbsolute, relative, resolve } from 'node:path'

/**
 * The file a `blueprint://app/…` URL names inside the built renderer folder, or null for another scheme
 * or host, or a path that leaves the folder once decoded (such as `..%2f..%2fetc`). A query is ignored.
 */
export function rendererFile(rendererDir: string, url: string): string | null {
  let parsed: URL
  let path: string
  try {
    parsed = new URL(url)
    path = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (parsed.protocol !== 'blueprint:' || parsed.host !== 'app') return null
  const file = resolve(rendererDir, `.${path}`)
  const inside = relative(rendererDir, file)
  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? null : file
}

/** Whether `url` is the pop-out page beside the page at `pageUrl`: the only window Blueprint opens. */
export function isPopoutUrl(url: string, pageUrl: string): boolean {
  try {
    return new URL(url).href === new URL('popout.html', pageUrl).href
  } catch {
    return false
  }
}
