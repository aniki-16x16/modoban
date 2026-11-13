import { afterPaint } from './afterPaint.ts'

const root = document.getElementById('root')!
afterPaint(() => {
  void import('./bootstrap.tsx').then(({ mountApp }) => mountApp(root)).catch(() => {
    const status = root.querySelector('[role="status"]')
    status?.setAttribute('role','alert')
    status?.querySelector('.loading-mark')?.remove()
    const label = status?.querySelector('p')
    if (label) label.textContent = '加载失败，请刷新页面重试。'
  })
})
