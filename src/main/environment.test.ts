import { describe, expect, it } from 'vitest'
import { loginEnvironment, mergeEnvironment, needsLoginEnvironment, parseMarkedEnv } from './environment'

const M = 'MARK-1234'

describe('needsLoginEnvironment', () => {
  it('a desktop start reads the login shell, a terminal start does not', () => {
    expect(needsLoginEnvironment({})).toBe(true)
    expect(needsLoginEnvironment({ TERM: '' })).toBe(true)
    expect(needsLoginEnvironment({ TERM: 'xterm-256color' })).toBe(false)
  })
})

describe('parseMarkedEnv', () => {
  it('only what lies between the markers counts', () => {
    const output = [
      'Welcome to oh-my-zsh',
      '\x1b[?2004h\x1b]0;p10k instant prompt\x07',
      M,
      'PATH=/home/d/.local/bin:/usr/bin',
      'NVM_DIR=/home/d/.nvm',
      'EQUALS=a=b=c',
      'BASH_FUNC_x%%=() {  echo hi',
      '}',
      M,
      '% ',
    ].join('\n')
    expect(parseMarkedEnv(output, M)).toEqual({
      PATH: '/home/d/.local/bin:/usr/bin',
      NVM_DIR: '/home/d/.nvm',
      EQUALS: 'a=b=c',
    })
  })

  it('a missing marker gives nothing', () => {
    expect(parseMarkedEnv(`${M}\nPATH=/usr/bin\n`, M)).toBeNull()
    expect(parseMarkedEnv('PATH=/usr/bin\n', M)).toBeNull()
  })
})

describe('mergeEnvironment', () => {
  it('the login PATH replaces the current one, and only missing variables are added', () => {
    const merged = mergeEnvironment(
      { PATH: '/usr/bin', HOME: '/home/d', LANG: 'C' },
      {
        PATH: '/opt/homebrew/bin:/usr/bin',
        HOME: '/elsewhere',
        LANG: 'en_US.UTF-8',
        NVM_DIR: '/home/d/.nvm',
      },
    )
    expect(merged).toEqual({
      PATH: '/opt/homebrew/bin:/usr/bin',
      HOME: '/home/d',
      LANG: 'C',
      NVM_DIR: '/home/d/.nvm',
    })
  })

  it("the shell's own bookkeeping never comes across", () => {
    const merged = mergeEnvironment(
      {},
      { PWD: '/x', OLDPWD: '/y', SHLVL: '2', _: '/usr/bin/env', TERM: 'dumb' },
    )
    expect(merged).toEqual({})
  })
})

describe('loginEnvironment', () => {
  it('runs the login shell, interactive, and reads its environment', async () => {
    let seen: { file: string; args: string[] } | undefined
    const env = await loginEnvironment(
      '/bin/zsh',
      async (file, args) => {
        seen = { file, args }
        return `banner\n${M}\nPATH=/a:/b\n${M}\n`
      },
      M,
    )
    expect(env).toEqual({ PATH: '/a:/b' })
    expect(seen?.file).toBe('/bin/zsh')
    expect(seen?.args.slice(0, 3)).toEqual(['-i', '-l', '-c'])
  })

  it('a shell that fails or runs too long changes nothing', async () => {
    expect(await loginEnvironment('/bin/zsh', () => Promise.reject(new Error('timed out')), M)).toBeNull()
    expect(await loginEnvironment('/bin/zsh', async () => 'no markers here', M)).toBeNull()
  })
})
