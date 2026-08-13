import { Card, Collapse, Table, Typography } from 'antd'
import type { RunDetail } from '../../types/run'

type Props = {
  data: RunDetail
  visible: boolean
}

export default function RunDetailInteraction({ data, visible }: Props) {
  if (!visible) return null

  const interactions = data.analysis_refine.interactions || []
  const dropped = data.gameplay.dropped || []
  const model = data.analysis_refine.model || data.run.model_name

  return (
    <Card className="page-card" title="分析明细" size="small">
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        模型：{model}
      </Typography.Paragraph>
      <Collapse
        items={[
          {
            key: 'model',
            label: '模型分析结构',
            children: (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => `a-${i}`}
                dataSource={interactions}
                columns={[
                  { title: '手势', dataIndex: 'gesture' },
                  {
                    title: '模型时刻',
                    dataIndex: 'model_reaction_at_ms',
                    render: (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(2)}s` : '-'),
                  },
                  {
                    title: '精修后',
                    dataIndex: 'first_changed_ms',
                    render: (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(2)}s` : '-'),
                  },
                  { title: '精修方式', dataIndex: 'refined_by', ellipsis: true },
                  { title: 'Hint', dataIndex: 'hint', ellipsis: true },
                ]}
              />
            ),
          },
          {
            key: 'dropped',
            label: `丢弃候选（${dropped.length}）`,
            children: (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => `d-${i}`}
                dataSource={dropped}
                locale={{ emptyText: '无丢弃候选' }}
                columns={[
                  { title: '手势', dataIndex: 'gesture' },
                  {
                    title: '时刻',
                    dataIndex: 'first_changed_ms',
                    render: (ms?: number) => (ms != null ? `${ms}ms` : '-'),
                  },
                  {
                    title: '原因',
                    dataIndex: 'reason_codes',
                    render: (codes?: string[]) => (codes || []).join(', ') || '-',
                  },
                  { title: 'Hint', dataIndex: 'hint', ellipsis: true },
                ]}
              />
            ),
          },
        ]}
      />
    </Card>
  )
}