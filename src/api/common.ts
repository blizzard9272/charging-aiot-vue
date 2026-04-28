export interface ApiResponse<T> {
  code: number
  msg: string | null
  data: T
}

export interface PageResult<T> {
  total: number
  records: T[]
}
