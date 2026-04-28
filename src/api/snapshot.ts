import request from '@/utils/request'
import type { ApiResponse, PageResult } from './common'
import type {
  StreamDataVO,
  Stream101VO,
  Stream102VO,
  Stream103VO,
  StatsQueryDTO,
  StreamPageQueryDTO,
  StreamQueryDTO
} from '@/shared/types/snapshot-center'


export function fetch101Data(data: StreamQueryDTO) {
  return request.post<any, ApiResponse<Stream101VO[]>>('/charging-aiot-php/api/protocol-data/data-center/query-101.php', data)
}

export function fetch102Data(data: StreamQueryDTO) {
  return request.post<any, ApiResponse<Stream102VO[]>>('/charging-aiot-php/api/protocol-data/data-center/query-102.php', data)
}

export function fetch103Data(data: StreamQueryDTO) {
  return request.post<any, ApiResponse<Stream103VO[]>>('/charging-aiot-php/api/protocol-data/data-center/query-103.php', data)
}

export function fetchStatsData(params?: StatsQueryDTO) {
  return request.get<any, ApiResponse<Record<string, number>>>('/charging-aiot-php/api/protocol-data/data-center/stats.php', {
    params
  })
}

export function fetchStreamPageData(data: StreamPageQueryDTO) {
  return request.get<any, ApiResponse<PageResult<StreamDataVO>>>('/charging-aiot-php/api/protocol-data/data-center/page.php', {
    params: data
  })
}



