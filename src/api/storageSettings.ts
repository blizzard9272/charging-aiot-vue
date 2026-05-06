import request from '@/utils/request'
import type { ApiResponse } from './common'

export interface StorageCategorySetting {
  category_key: string
  name: string
  description: string
  path_template: string
  default_template: string
  is_recommended: 0 | 1
  example_path: string
  placeholders?: string[]
}

export interface StorageSettingsListVO {
  records: StorageCategorySetting[]
}

export interface StorageMigrationSummary {
  updated_rows: number
  moved_files: number
  missing_files: number
  errors: number
}

export function fetchStorageSettings() {
  return request.get<any, ApiResponse<StorageSettingsListVO>>('/charging-aiot-php/api/information-management/storage/list.php')
}

export function updateStorageSettings(payload: {
  settings: Array<{ category_key: string; path_template: string }>
  run_migration?: 0 | 1
}) {
  return request.put<any, ApiResponse<{ records: StorageCategorySetting[]; migration: StorageMigrationSummary | null }>>(
    '/charging-aiot-php/api/information-management/storage/update.php',
    payload
  )
}




