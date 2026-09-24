import {
  DownOutlined,
  FilterOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button, Collapse, Popover } from 'antd'
import { useMemo, useState } from 'react'
import { INTERACTION_TYPE_OPTIONS } from '../editor/InteractionInspector'

type Props = {
  value: string
  counts: Record<string, number>
  onChange: (value: string) => void
}

function optionLabel(value: string) {
  for (const group of INTERACTION_TYPE_OPTIONS) {
    for (const option of group.options) {
      if (option.value === value) return option.label
      const child = option.children?.find((item) => item.value === value)
      if (child) return child.label
    }
  }
  return value
}

export default function InteractionTriggerFilter({ value, counts, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [expandedType, setExpandedType] = useState<string | null>(null)
  const selectedLabel = useMemo(() => optionLabel(value), [value])

  const select = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const content = (
    <div className="trigger-filter-panel" aria-label="按互动触发器筛选视频">
      <div className="trigger-filter-header">
        <strong>互动触发器</strong>
        <Button
          type="link"
          size="small"
          disabled={!value}
          onClick={() => select('')}
        >
          清除筛选
        </Button>
      </div>
      <Collapse
        className="trigger-filter-groups"
        ghost
        size="small"
        accordion
        defaultActiveKey={['0']}
        expandIconPosition="end"
        items={INTERACTION_TYPE_OPTIONS.map((group, groupIndex) => ({
          key: String(groupIndex),
          label: (
            <span className="trigger-filter-group-label">
              <strong>{group.label}</strong>
              <small>{group.options.length} 种</small>
            </span>
          ),
          children: (
            <div className="trigger-filter-options">
              {group.options.map((option) => {
                const key = String(option.value)
                const count = counts[key] || 0
                const hasChildren = Boolean(option.children?.length)
                const expanded = expandedType === key
                return (
                  <div
                    key={key}
                    className={`trigger-filter-option${expanded ? ' is-expanded' : ''}`}
                  >
                    <div className="trigger-filter-primary-row">
                      <button
                        type="button"
                        className={value === key ? 'is-selected' : undefined}
                        disabled={count === 0}
                        aria-pressed={value === key}
                        onClick={() => select(key)}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.code || key}</small>
                        </span>
                        <b aria-label={`${count} 个视频`}>{count}</b>
                      </button>
                      {hasChildren ? (
                        <button
                          type="button"
                          className="trigger-filter-expand"
                          aria-label={`${expanded ? '收起' : '展开'}${option.label}的二级触发器`}
                          aria-expanded={expanded}
                          onClick={() => setExpandedType(expanded ? null : key)}
                        >
                          {expanded ? <DownOutlined /> : <RightOutlined />}
                        </button>
                      ) : null}
                    </div>
                    {hasChildren && expanded ? (
                      <div className="trigger-filter-secondary">
                        {option.children?.map((child) => {
                          const childKey = String(child.value)
                          const childCount = counts[childKey] || 0
                          return (
                            <button
                              key={childKey}
                              type="button"
                              className={value === childKey ? 'is-selected' : undefined}
                              disabled={childCount === 0}
                              aria-pressed={value === childKey}
                              onClick={() => select(childKey)}
                            >
                              <span>
                                <strong>{child.label}</strong>
                                <small>{child.code || childKey}</small>
                              </span>
                              <b aria-label={`${childCount} 个视频`}>{childCount}</b>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ),
        }))}
      />
    </div>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      content={content}
    >
      <Button
        icon={<FilterOutlined />}
        type={value ? 'primary' : 'default'}
        aria-label={value ? `互动触发器筛选：${selectedLabel}` : '按互动触发器筛选视频'}
      >
        {value ? selectedLabel : '互动触发器'}
        {value ? <span className="trigger-filter-selected-count">{counts[value] || 0}</span> : null}
      </Button>
    </Popover>
  )
}
