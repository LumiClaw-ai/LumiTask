import { describe, it, expect } from 'vitest'
import { formatTokens, formatCost, timeAgo } from '../src/lib/utils'

describe('formatTokens', () => {
  it('formats zero', () => {
    expect(formatTokens(0)).toBe('0')
  })

  it('formats small numbers', () => {
    expect(formatTokens(500)).toBe('500')
  })

  it('formats thousands with clean division', () => {
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(2000)).toBe('2k')
  })

  it('formats thousands with decimals', () => {
    expect(formatTokens(1200)).toBe('1.2k')
    expect(formatTokens(12450)).toBe('12.4k')
  })

  it('formats millions', () => {
    expect(formatTokens(1000000)).toBe('1000k')
  })
})

describe('formatCost', () => {
  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00')
  })

  it('formats small cents', () => {
    expect(formatCost(8)).toBe('$0.08')
  })

  it('formats dollars', () => {
    expect(formatCost(150)).toBe('$1.50')
  })
})

describe('timeAgo', () => {
  it('returns just now for recent timestamps', () => {
    expect(timeAgo(Date.now())).toBe('just now')
  })

  it('returns seconds ago', () => {
    expect(timeAgo(Date.now() - 30000)).toBe('30s ago')
  })

  it('returns minutes ago', () => {
    expect(timeAgo(Date.now() - 300000)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(timeAgo(Date.now() - 7200000)).toBe('2h ago')
  })

  it('returns days ago', () => {
    expect(timeAgo(Date.now() - 172800000)).toBe('2d ago')
  })

  it('returns a non-empty string', () => {
    expect(timeAgo(Date.now() - 100000000)).toBeTruthy()
  })
})
