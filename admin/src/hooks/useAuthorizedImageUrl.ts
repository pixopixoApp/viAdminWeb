import { useEffect, useRef, useState } from 'react'
import { getToken } from '../api'

/**
 * 把图片 URL 转成可在 <img> 中直接展示的地址。
 *
 * 后台返回的封面等资源可能是「需要登录鉴权」的相对 API 路径（例如
 * /api/v1/runs/<id>/media/cover）。<img> 标签不会携带 Authorization 头，
 * 直接使用会得到 401。这里对这类路径用 fetch + Bearer token 拉取后转成
 * Blob URL，从而在管理后台里正常展示。
 */
export function useAuthorizedImageUrl(src?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const revokeRef = useRef<string | null>(null)

  useEffect(() => {
    // data:/blob: 及公开的绝对 URL 可直接展示；只有相对 API 路径需要带 token 拉取。
    if (!src || /^(https?:|data:|blob:)/i.test(src)) {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current)
        revokeRef.current = null
      }
      setUrl(src || undefined)
      return
    }

    let cancelled = false
    const token = getToken()
    setUrl(undefined)
    fetch(src, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
      // 封面地址是不变的（/runs/<id>/media/cover），但内容会变；禁用缓存以确保
      // 修改封面后视频列表能立即拿到最新封面，而不是浏览器缓存的旧图。
      cache: 'no-store',
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.blob()
      })
      .then((blob) => {
        if (cancelled) return
        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current)
        const objectUrl = URL.createObjectURL(blob)
        revokeRef.current = objectUrl
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(undefined)
      })

    return () => {
      cancelled = true
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current)
        revokeRef.current = null
      }
    }
  }, [src])

  return url
}
