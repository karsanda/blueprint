import { describe, expect, it } from 'vitest'
import { isPopoutUrl, rendererFile } from './protocol'

const D = '/opt/bp/out/renderer'

describe('rendererFile', () => {
  it('a renderer URL gives its file', () => {
    expect(rendererFile(D, 'blueprint://app/index.html')).toBe(`${D}/index.html`)
    expect(rendererFile(D, 'blueprint://app/assets/a%20b.js?x=1')).toBe(`${D}/assets/a b.js`)
  })

  it('dot segments resolve inside the renderer folder', () => {
    // URL parsing resolves `..` and `%2e%2e` segments before Blueprint sees the path.
    expect(rendererFile(D, 'blueprint://app/%2e%2e/%2e%2e/etc/passwd')).toBe(`${D}/etc/passwd`)
    expect(rendererFile(D, 'blueprint://app/../renderer2/x.js')).toBe(`${D}/renderer2/x.js`)
  })

  it('a path out of the renderer folder gives nothing', () => {
    // Encoded slashes become `../..` only once decoded.
    expect(rendererFile(D, 'blueprint://app/..%2f..%2fetc%2fpasswd')).toBeNull()
    expect(rendererFile(D, 'blueprint://app/%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBeNull()
    expect(rendererFile(D, 'blueprint://app/..%2frenderer2%2fx.js')).toBeNull()
  })

  it('another host or scheme gives nothing', () => {
    expect(rendererFile(D, 'blueprint://evil/index.html')).toBeNull()
    expect(rendererFile(D, 'file:///etc/passwd')).toBeNull()
    expect(rendererFile(D, 'not a url')).toBeNull()
  })
})

describe('isPopoutUrl', () => {
  it('only the pop-out page may open', () => {
    const page = 'blueprint://app/index.html'
    expect(isPopoutUrl('blueprint://app/popout.html', page)).toBe(true)
    expect(isPopoutUrl('blueprint://app/index.html', page)).toBe(false)
    expect(isPopoutUrl('https://example.com/popout.html', page)).toBe(false)
    expect(isPopoutUrl('http://localhost:5173/popout.html', 'http://localhost:5173/')).toBe(true)
  })
})
