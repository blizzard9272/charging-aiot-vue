type EChartsModule = typeof import('echarts')

let echartsLoader: Promise<EChartsModule> | null = null

export function loadEcharts() {
  if (!echartsLoader) {
    echartsLoader = import('echarts')
  }
  return echartsLoader
}
