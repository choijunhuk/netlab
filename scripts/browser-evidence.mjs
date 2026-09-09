import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
const baseURL = process.env.NETLAB_EVIDENCE_URL || 'http://127.0.0.1:4175/netlab/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
let phase = 'initial'
page.on('pageerror', (error) => errors.push({ phase, message: error.message, stack: error.stack }))
page.on('dialog', (dialog) => dialog.accept())
await page.goto(baseURL)
await page.getByTestId('device-server1').waitFor()
await page.getByRole('button', { name: 'Run command', exact: true }).click()
await page.getByRole('button', { name: 'Play simulation', exact: true }).click()
await page
  .getByRole('log', { name: 'Command output' })
  .getByText(/Reply from/)
  .waitFor()
await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
await page.screenshot({ path: 'docs/evidence/protocol-desktop.png', fullPage: true })
phase = 'mobile'
await page.setViewportSize({ width: 390, height: 844 })
await page.getByRole('button', { name: 'console', exact: true }).click()
await page.screenshot({ path: 'docs/evidence/protocol-mobile.png', fullPage: true })
phase = 'restore-desktop'
await page.setViewportSize({ width: 1600, height: 1000 })
const devices = Array.from({ length: 100 }, (_, i) => ({
  id: `r${i}`,
  name: `Router ${i}`,
  kind: 'router',
  position: { x: (i % 10) * 300, y: Math.floor(i / 10) * 200 },
  powered: true,
  routes: [],
  interfaces: Array.from({ length: 4 }, (_, port) => ({
    id: `r${i}-eth${port}`,
    name: `eth${port}`,
    mac: `02:00:00:00:${i.toString(16).padStart(2, '0')}:${port.toString(16).padStart(2, '0')}`,
    mode: 'static',
    up: true,
  })),
}))
const links = []
function link(a, ai, b, bi) {
  const n = links.length,
    third = Math.floor(n / 64),
    last = (n % 64) * 4
  devices[a].interfaces[ai].ip = `10.1.${third}.${last + 1}`
  devices[a].interfaces[ai].prefix = 30
  devices[b].interfaces[bi].ip = `10.1.${third}.${last + 2}`
  devices[b].interfaces[bi].prefix = 30
  links.push({
    id: `l${n}`,
    a: { deviceId: `r${a}`, interfaceId: `r${a}-eth${ai}` },
    b: { deviceId: `r${b}`, interfaceId: `r${b}-eth${bi}` },
    latencyMs: 10,
    bandwidthMbps: 100,
    lossPercent: 0,
    queueCapacity: 64,
    up: true,
  })
}
for (let i = 0; i < 100; i++) link(i, 1, (i + 1) % 100, 0)
for (let i = 0; i < 50; i++) link(i, 2, i + 50, 2)
const fixture = { schemaVersion: 1, name: '100 routers / 150 links', seed: 42, devices, links }
await fs.mkdir('tests/fixtures', { recursive: true })
await fs.writeFile('tests/fixtures/stress.netlab.json', JSON.stringify(fixture, null, 2) + '\n')
phase = 'large-import'
const start = performance.now()
await page.locator('input[type="file"]').setInputFiles({
  name: 'stress.netlab.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(fixture)),
})
await page.locator('.react-flow__node').nth(99).waitFor()
const importMs = performance.now() - start
await page.evaluate(() => {
  window.netlabLongTasks = []
  new PerformanceObserver((list) =>
    window.netlabLongTasks.push(...list.getEntries().map((e) => e.duration)),
  ).observe({ type: 'longtask', buffered: false })
})
await page.getByLabel('Terminal device').selectOption('r0')
const interaction = []
for (let i = 0; i < 20; i++) {
  await page.getByLabel('Terminal command').fill('ping 10.1.0.2')
  const t = performance.now()
  await page.getByRole('button', { name: 'Run command', exact: true }).click()
  interaction.push(performance.now() - t)
}
await page.getByRole('button', { name: 'Play simulation', exact: true }).click()
const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const intervals = []
      let last = performance.now()
      const tick = (now) => {
        intervals.push(now - last)
        last = now
        if (intervals.length >= 120) resolve(intervals)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }),
)
await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
const replies = await page
  .getByRole('log', { name: 'Command output' })
  .getByText(/Reply from/)
  .count()
const longTasks = await page.evaluate(() => window.netlabLongTasks)
const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]
const result = {
  measuredAt: new Date().toISOString(),
  machine: os.cpus()[0].model,
  platform: `${os.platform()}/${os.arch()}`,
  node: process.version,
  browser: await browser.version(),
  build: 'production',
  fixture: { devices: 100, links: 150, seed: 42, pings: 20 },
  importMs,
  interactionP95Ms: percentile(interaction, 0.95),
  frameP95Ms: percentile(frames, 0.95),
  averageFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
  longTasksMs: longTasks,
  replies,
  browserErrors: errors,
  limits:
    'Headless Chromium on this machine; not a physical-device FPS guarantee. Interaction timing includes Playwright dispatch.',
}
await fs.writeFile('docs/evidence/browser-performance.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
await browser.close()
if (errors.length || replies !== 20) process.exitCode = 1
