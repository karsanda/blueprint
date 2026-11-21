import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
} from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export interface Token {
  text: string
  color?: string
}

const LANGS: Record<string, () => Promise<LanguageInput>> = {
  typescript: async () => (await import('shiki/langs/typescript.mjs')).default,
  tsx: async () => (await import('shiki/langs/tsx.mjs')).default,
  javascript: async () => (await import('shiki/langs/javascript.mjs')).default,
  jsx: async () => (await import('shiki/langs/jsx.mjs')).default,
  json: async () => (await import('shiki/langs/json.mjs')).default,
  css: async () => (await import('shiki/langs/css.mjs')).default,
  html: async () => (await import('shiki/langs/html.mjs')).default,
  markdown: async () => (await import('shiki/langs/markdown.mjs')).default,
  shellscript: async () => (await import('shiki/langs/shellscript.mjs')).default,
  python: async () => (await import('shiki/langs/python.mjs')).default,
  yaml: async () => (await import('shiki/langs/yaml.mjs')).default,
  toml: async () => (await import('shiki/langs/toml.mjs')).default,
  rust: async () => (await import('shiki/langs/rust.mjs')).default,
  go: async () => (await import('shiki/langs/go.mjs')).default,
}

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  rs: 'rust',
  go: 'go',
}

const theme = createCssVariablesTheme({
  name: 'blueprint',
  variablePrefix: '--bp-code-',
  variableDefaults: {},
  fontStyle: true,
})

let highlighter: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<void>>()

function core(): Promise<HighlighterCore> {
  if (highlighter === undefined) {
    // The JavaScript engine: the renderer's CSP allows no WebAssembly.
    const made = createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() })
    highlighter = made
    // A failed start is dropped, so a later call can try again.
    made.catch(() => {
      if (highlighter === made) highlighter = undefined
    })
  }
  return highlighter
}

/** Loads a language once, however many calls ask for it at the same time. A failure can be retried. */
function loadOnce(h: HighlighterCore, lang: string, load: () => Promise<LanguageInput>): Promise<void> {
  let p = loading.get(lang)
  if (p === undefined) {
    p = load().then((input) => h.loadLanguage(input))
    loading.set(lang, p)
    p.catch(() => {
      if (loading.get(lang) === p) loading.delete(lang)
    })
  }
  return p
}

/**
 * Colours each line by the file's language, or gives null when the extension is unknown or the
 * highlighter or language cannot load. Lines run as one block.
 */
export async function highlightLines(path: string, lines: string[]): Promise<Token[][] | null> {
  const lang = BY_EXTENSION[path.split('.').pop()?.toLowerCase() ?? '']
  const load = lang === undefined ? undefined : LANGS[lang]
  if (lang === undefined || load === undefined) return null
  try {
    const h = await core()
    await loadOnce(h, lang, load)
    const { tokens } = h.codeToTokens(lines.join('\n'), { lang, theme: 'blueprint' })
    return tokens.map((line) => line.map((t) => ({ text: t.content, color: t.color })))
  } catch {
    return null
  }
}
