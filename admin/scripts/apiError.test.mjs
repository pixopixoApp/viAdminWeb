import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const sourceUrl = new URL('../src/apiError.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithEsbuild(source, sourceUrl.pathname, {
  loader: 'ts',
  format: 'esm',
})
const encoded = Buffer.from(transformed.code).toString('base64')
const apiError = await import(`data:text/javascript;base64,${encoded}`)

test('only a real 401 invalidates the session', () => {
  assert.equal(apiError.shouldInvalidateSession(401), true)
  assert.equal(apiError.shouldInvalidateSession(500), false)
  assert.equal(apiError.shouldInvalidateSession(502), false)
  assert.equal(apiError.shouldInvalidateSession(503), false)
})

test('5xx and network failures use the service busy message', () => {
  const gatewayError = apiError.createServiceUnavailableError(502)
  const networkError = apiError.createServiceUnavailableError()

  assert.equal(gatewayError.message, '当前服务繁忙，请稍后重试')
  assert.equal(gatewayError.status, 502)
  assert.equal(apiError.isServiceUnavailableError(gatewayError), true)
  assert.equal(networkError.status, null)
  assert.equal(apiError.isServiceUnavailableError(new Error('boom')), false)
})
