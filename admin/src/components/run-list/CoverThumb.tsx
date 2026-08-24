import { useState } from 'react'
import { useAuthorizedImageUrl } from '../../hooks/useAuthorizedImageUrl'

const THUMB_STYLE: React.CSSProperties = {
  width: 56,
  height: 76,
  objectFit: 'cover',
  borderRadius: 6,
}

/**
 * 视频列表里的封面缩略图。
 *
 * 封面地址可能是需要登录鉴权的相对 API 路径（例如
 * /api/v1/runs/<id>/media/cover）。<img> 不携带 Authorization 头，必须通过
 * useAuthorizedImageUrl 用 Bearer token 拉取后再展示。加载失败时自动回退到
 * 视频预览帧，再不行就显示占位块，避免列表出现破图或空白。
 */
export default function CoverThumb({
  coverUrl,
  previewUrl,
  contentType,
}: {
  coverUrl?: string
  previewUrl?: string
  contentType?: string
}) {
  const displayUrl = useAuthorizedImageUrl(coverUrl)
  const [imgFailed, setImgFailed] = useState(false)

  if (displayUrl && !imgFailed) {
    return (
      <img
        src={displayUrl}
        alt=""
        style={THUMB_STYLE}
        onError={() => setImgFailed(true)}
      />
    )
  }

  if (previewUrl && contentType !== 'html') {
    return (
      <video
        src={previewUrl}
        muted
        preload="metadata"
        style={{ ...THUMB_STYLE, background: '#111' }}
      />
    )
  }

  return (
    <div
      style={{
        width: 56,
        height: 76,
        borderRadius: 6,
        background: '#1f2937',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: 11,
      }}
    >
      {contentType === 'html' ? 'HTML' : '视频'}
    </div>
  )
}
