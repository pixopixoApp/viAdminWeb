/**
 * 构造带鉴权的封面请求地址。
 *
 * 后台的本地封面接口形如 `/api/v1/runs/<id>/media/cover`：更换封面后这个地址
 * **不会变化**，只有响应内容变化。为了在同一页面内换封面后能拿到新图，需要把
 * 封面版本（一般是 `cover_media_object_id`）作为查询参数附加在地址后面，既能
 * 触发 React effect 重新拉取，也能绕过浏览器/中间层缓存。
 *
 * 公开的绝对地址（http/https）以及 data:/blob: 地址不需要附加版本。
 */
export function buildAuthorizedImageRequestUrl(
  src: string,
  version?: string | null,
): string {
  if (!version) return src
  const separator = src.includes('?') ? '&' : '?'
  return `${src}${separator}v=${encodeURIComponent(version)}`
}
