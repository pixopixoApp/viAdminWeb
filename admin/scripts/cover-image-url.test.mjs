import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const sourceUrl = new URL('../src/hooks/coverImageUrl.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithEsbuild(source, sourceUrl.pathname, {
  loader: 'ts',
  format: 'esm',
})
const encoded = Buffer.from(transformed.code).toString('base64')
const { buildAuthorizedImageRequestUrl } = await import(
  `data:text/javascript;base64,${encoded}`
)

test('appends the cover version to a relative cover api path', () => {
  assert.equal(
    buildAuthorizedImageRequestUrl('/api/v1/runs/abc/media/cover', 'sha123'),
    '/api/v1/runs/abc/media/cover?v=sha123',
  )
})

test('appends the version using & when a query string already exists', () => {
  assert.equal(
    buildAuthorizedImageRequestUrl('/api/v1/runs/abc/media/cover?x=1', 'sha123'),
    '/api/v1/runs/abc/media/cover?x=1&v=sha123',
  )
})

test('url-encodes the version to keep the request valid', () => {
  assert.equal(
    buildAuthorizedImageRequestUrl('/api/v1/runs/abc/media/cover', 'mo_x/y'),
    '/api/v1/runs/abc/media/cover?v=mo_x%2Fy',
  )
})

test('returns the original url when no version is provided', () => {
  assert.equal(
    buildAuthorizedImageRequestUrl('/api/v1/runs/abc/media/cover', null),
    '/api/v1/runs/abc/media/cover',
  )
})
