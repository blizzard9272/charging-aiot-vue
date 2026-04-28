import request from '@/utils/request'
import type { ApiResponse } from './common'

export interface AiotObject {
  obj_type?: number
  track_id: number | string
  bbox: number[]
  confidence?: number
}

export interface AiotStreamMessage {
  msg_type: number
  camera_id: string
  timestamp: number
  object_count: number
  objects: AiotObject[]
  frame_width?: number
  frame_height?: number
  [key: string]: unknown
}

export function getStreamList() {
  return request
    .get<any, ApiResponse<{ records?: Array<any> }>>('/charging-aiot-php/api/protocol-data/data-center/records.php', {
      params: {
        protocol: 101,
        limit: 100
      }
    })
    .then((res) => {
      const list: AiotStreamMessage[] = Array.isArray(res.data?.records)
        ? res.data.records.map((record: any) => {
            const targets = Array.isArray(record?.details?.targets) ? record.details.targets : []

            return {
              msg_type: 101,
              camera_id: String(record?.camera_id ?? `cam${record?.cam_id ?? ''}`),
              timestamp: Number(record?.timestamp ?? Date.now()),
              object_count: Number(record?.details?.count ?? targets.length),
              objects: targets.map((target: any) => ({
                obj_type: Number(target?.type ?? 0),
                track_id: target?.tid ?? '',
                bbox: [
                  Number(target?.x1 ?? 0),
                  Number(target?.y1 ?? 0),
                  Number(target?.x2 ?? 0),
                  Number(target?.y2 ?? 0)
                ],
                confidence: typeof target?.conf === 'number' ? target.conf : undefined
              }))
            }
          })
        : []

      return {
        ...res,
        data: list
      }
    })
}

