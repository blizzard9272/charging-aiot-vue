export interface StreamDataVO<T = any> {
  id: number
  msgType: number
  cameraId: string
  deviceTimestamp: number
  payloadData: T
}

export interface StreamQueryDTO {
  limit: number
  startTime?: number | null
  endTime?: number | null
}

export interface StatsQueryDTO {
  startTime?: number | null
  endTime?: number | null
}

export interface StreamPageQueryDTO {
  msgType: 101 | 102 | 103
  page: number
  pageSize: number
  startTime?: number | null
  endTime?: number | null
}

export interface PageResult<T> {
  total: number
  records: T[]
}

export interface Payload101Object {
  track_id: number | string
  confidence: number
}

export interface Payload101 {
  object_count: number
  objects: Payload101Object[]
}

export interface Payload102 {
  person_name: string
  status: '已录入' | '未知人员' | string
  track_id: number | string
}

export interface Payload103 {
  frame_image: string
  track_id: number | string
}

export type Stream101VO = StreamDataVO<Payload101>
export type Stream102VO = StreamDataVO<Payload102>
export type Stream103VO = StreamDataVO<Payload103>
