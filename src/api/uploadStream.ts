import request from '@/utils/request'
import type { ApiResponse } from './common'

export interface StreamTarget {
  type: number
  tid: number
  face_id?: number
  x1: number
  y1: number
  x2: number
  y2: number
  conf?: number | null
  object_index?: number
}

export interface StreamRecord101Details {
  count: number
  target_count?: number
  obj_type?: number
  frame_face_count?: number
  frame_width?: number
  frame_height?: number
  reserved_value?: number
  targets: StreamTarget[]
  payload_hex_rebuilt: string
  frame_target_count?: number
}

export interface StreamRecord102Details {
  payload_size: number
  target_count?: number
  obj_type?: number
  face_id?: number
  vector_base64_preview: string
  vector_hex_preview: string
  vector_payload_hex_preview: string
  vector_base64?: string
  embedding_dim?: number
  embedding_file_path?: string
  embedding_preview?: string
  information?: string
  person_name?: string
  status?: string
}

export interface StreamRecord103Details {
  tid?: number
  face_id?: number
  payload_size: number
  image_hex_preview: string
  base64_image: string
  image_data_url: string
  frame_image_url?: string
  image_fetch_status?: string
  local_image_path?: string
  media_kind?: string
  media_url?: string
  payload_type?: number
  media_type?: number
  start_timestamp?: number
  end_timestamp?: number
  total_packets?: number
  packet_index?: number
  received_packets?: number
  media_total_size?: number
  chunk_length?: number
  received_media_size?: number
  is_complete_media?: boolean
  source_file_name?: string
  error_message?: string
  person_count?: number
  animal_count?: number
  car_count?: number
}

export interface UploadStreamRecord {
  record_id: number
  cam_id: number
  camera_id?: string
  track_id?: number
  face_id?: number
  protocol_id: 101 | 102 | 103
  timestamp: number
  batch_id?: number
  source_file_name: string
  source_file_size: number
  create_time: string
  frame_header?: number
  frame_tail?: number
  crc_value?: number
  frame_length?: number
  frame_seq?: number
  error_message?: string
  quality_status?: 'normal' | 'error' | 'missing' | 'error_missing'
  raw_protocol_hex_preview?: string
  raw_protocol_hex_size?: number
  normalized_json?: Record<string, unknown>
  details: StreamRecord101Details | StreamRecord102Details | StreamRecord103Details
}

export interface LinkedStreamPacket {
  link_key: string
  cam_id: number
  camera_id?: string
  timestamp: number
  create_time: string
  protocol_101_record_ids: number[]
  protocol_102_record_ids: number[]
  protocol_103_record_ids: number[]
  protocols: Array<101 | 102 | 103>
  target_total: number
  vector_total: number
  image_total: number
}

export interface UploadStreamRecordQuery {
  limit?: number
  offset?: number
  protocol?: 101 | 102 | 103
  cam_id?: number
  camera_id?: string
  timestamps?: string
  start_event_time?: number | string
  end_event_time?: number | string
  include_payload?: 0 | 1
  quality_status?: 'all' | 'error' | 'missing' | 'normal'
}


export interface UploadStreamRecordListVO {
  total: number
  records: UploadStreamRecord[]
  linked_packets?: LinkedStreamPacket[]
  protocol_totals?: Record<101 | 102 | 103, number>
  quality_summary?: {
    error_count: number
    missing_count: number
    missing_frames: number
  }
}

export interface ProtocolFrameVO {
  protocol_id: 101 | 102 | 103
  record_id: number
  camera_id: string
  cam_id: number
  timestamp: number
  create_time: string
  raw_protocol_hex: string
  raw_protocol_hex_size: number
}

export interface CameraOptionVO {
  camera_id: string
  cam_id: number
  label: string
  value: string
}

export function fetchUploadStreamRecords(params?: UploadStreamRecordQuery) {
  return request.get<any, ApiResponse<UploadStreamRecordListVO>>('/charging-aiot-php/api/protocol-data/data-center/records.php', {
    params
  })
}

export function fetchProtocolFrame(params: { protocol: 101 | 102 | 103; record_id: number }) {
  return request.get<any, ApiResponse<ProtocolFrameVO>>('/charging-aiot-php/api/protocol-data/data-center/frame.php', {
    params: {
      protocol: params.protocol,
      record_id: params.record_id
    }
  })
}

export function fetchUploadStreamCameraOptions(params?: { protocol?: 101 | 102 | 103 }) {
  return request.get<any, ApiResponse<{ records: CameraOptionVO[] }>>('/charging-aiot-php/api/protocol-data/data-center/cameras.php', {
    params: {
      protocol: params?.protocol
    }
  })
}

export function deleteProtocolMedia(params: { protocol: 103; record_id: number }) {
  return request.delete<any, ApiResponse<{ record_id: number; deleted: boolean; path: string }>>(
    '/charging-aiot-php/api/protocol-data/data-center/media-delete.php',
    {
      params: {
        protocol: params.protocol,
        record_id: params.record_id
      }
    }
  )
}

