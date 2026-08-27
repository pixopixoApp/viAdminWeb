import { Button, Card, Result } from 'antd'
import { useState } from 'react'
import { SERVICE_BUSY_MESSAGE } from '../apiError'

type ServiceBusyCardProps = {
  onRetry: () => void | Promise<unknown>
}

export default function ServiceBusyCard({ onRetry }: ServiceBusyCardProps) {
  const [retrying, setRetrying] = useState(false)

  return (
    <Card>
      <Result
        status="warning"
        title={SERVICE_BUSY_MESSAGE}
        subTitle="已保留当前页面和登录状态，请等待服务恢复后原地重试。"
        extra={(
          <Button
            type="primary"
            loading={retrying}
            onClick={async () => {
              setRetrying(true)
              try {
                await onRetry()
              } finally {
                setRetrying(false)
              }
            }}
          >
            重试
          </Button>
        )}
      />
    </Card>
  )
}
