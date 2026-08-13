export type SeedanceImageInput = {
  data_url?: string
  url?: string
  role: 'first_frame' | 'reference_image' | 'last_frame'
}

export type SeedanceVideoInput = {
  file?: string
  url?: string
}

export type SeedanceTask = {
  id: string
  mode: 'text' | 'image' | 'video'
  prompt: string
  project?: string
  images: Array<SeedanceImageInput & { file?: string }>
  videos: Array<SeedanceVideoInput>
  params: {
    resolution?: string
    duration?: number
    ratio?: string
    generate_audio?: boolean
    watermark?: boolean
  }
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  error?: string | null
  video_url?: string | null
  video_file?: string | null
  last_frame_url?: string | null
  last_frame_file?: string | null
  created_at?: string
  updated_at?: string
}

export type SeedanceSettings = {
  has_api_key: boolean
  model: string
  base_url: string
  public_base_url: string
}

export type SeedanceSettingsPatch = {
  api_key?: string
  model?: string
  base_url?: string
  public_base_url?: string
}

export type SeedanceGenerateParams = {
  prompt: string
  images: SeedanceImageInput[]
  videos: SeedanceVideoInput[]
  resolution?: string
  duration?: number
  ratio?: string
  generate_audio?: boolean
  watermark?: boolean
}
