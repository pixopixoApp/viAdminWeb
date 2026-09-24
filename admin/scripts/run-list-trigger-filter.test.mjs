import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const listPage = await readFile(
  new URL('../src/pages/RunListPage.tsx', import.meta.url),
  'utf8',
)
const filterBar = await readFile(
  new URL('../src/components/run-list/RunFilterBar.tsx', import.meta.url),
  'utf8',
)
const triggerFilter = await readFile(
  new URL('../src/components/run-list/InteractionTriggerFilter.tsx', import.meta.url),
  'utf8',
)

test('SEO summary stays hidden unless failed work exists', () => {
  assert.match(listPage, /seoStatus\?\.failed/)
  assert.doesNotMatch(listPage, /Google SEO 状态/)
  assert.doesNotMatch(listPage, /只有审核通过、分发开启/)
  assert.match(listPage, /查看失败视频/)
  assert.match(listPage, /重新排队/)
})

test('video list exposes the expert-editor trigger hierarchy with video counts', () => {
  assert.match(filterBar, /<InteractionTriggerFilter/)
  assert.match(triggerFilter, /INTERACTION_TYPE_OPTIONS/)
  assert.match(triggerFilter, /defaultActiveKey=\{\['0'\]\}/)
  assert.match(triggerFilter, /option\.children/)
  assert.match(triggerFilter, /个视频/)
  assert.match(listPage, /new Set\(row\.interaction_triggers \|\| \[\]\)/)
  assert.match(listPage, /row\.interaction_triggers\?\.includes\(triggerFilter\)/)
})
