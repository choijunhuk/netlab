import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function open(page: Page) {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('./')
  await expect(page.getByTestId('topology-canvas')).toBeVisible()
}
async function runCommand(page: Page, text?: string) {
  if (text) await page.getByLabel('Terminal command').fill(text)
  await page.getByRole('button', { name: 'Run command', exact: true }).click()
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click()
}

test('two-router ping, pause, trace inspection and reset are wired to engine', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page)
  await runCommand(page)
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText(
    'Reply from 192.168.2.10',
  )
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText('TTL=62')
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
  const clock = await page.getByTestId('runtime-clock').getAttribute('data-time-us')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0
        const tick = () => {
          if (++frames === 6) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  expect(await page.getByTestId('runtime-clock').getAttribute('data-time-us')).toBe(clock)
  await page.getByLabel('Protocol filter').selectOption('ARP')
  await page.getByRole('log', { name: 'Simulation events' }).getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: /Historical packet/ })).toBeVisible()
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click()
  await expect(page.getByTestId('runtime-clock')).toHaveAttribute('data-time-us', '0')
  await expect(page.getByRole('log', { name: 'Command output' })).not.toContainText('Reply from')
  expect(errors).toEqual([])
})

test('DNS, web and NAT examples execute real terminal flows', async ({ page }) => {
  await open(page)
  await page.getByLabel('Example topology').selectOption('dns-web')
  await runCommand(page)
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText('HTTP/1.0 200 OK')
  await page.getByLabel('Example topology').selectOption('nat')
  await runCommand(page)
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText('UDP reply: hello')
})

test('manual port wiring, IP editing, undo and roundtrip persist real configuration', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('button', { name: 'Add PC', exact: true }).click()
  await page.getByLabel('IPv4 address', { exact: true }).fill('192.168.7.10')
  await page.getByLabel('Prefix length', { exact: true }).fill('24')
  await page.getByRole('button', { name: 'Apply configuration & reset run', exact: true }).click()
  await page.getByRole('button', { name: 'Add switch', exact: true }).click()
  await page.getByRole('button', { name: 'Add server', exact: true }).click()
  await page.getByLabel('IPv4 address', { exact: true }).fill('192.168.7.20')
  await page.getByLabel('Prefix length', { exact: true }).fill('24')
  await page.getByRole('button', { name: 'Apply configuration & reset run', exact: true }).click()
  async function wire(source: string, target: string) {
    const a = page.locator(`.react-flow__handle[data-handleid="${source}"]`)
    const b = page.locator(`.react-flow__handle[data-handleid="${target}"]`)
    await expect(a).toBeVisible()
    await expect(b).toBeVisible()
    await a.dragTo(b)
  }
  await wire('pc1-eth0', 'switch1-eth0')
  await wire('switch1-eth1', 'server1-eth0')
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.getByLabel('Terminal device').selectOption('pc1')
  await runCommand(page, 'ping 192.168.7.20')
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText(
    'Reply from 192.168.7.20',
  )
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click()
  const file = await download
  const path = await file.path()
  const project = JSON.parse(await readFile(path!, 'utf8'))
  expect(project.devices).toHaveLength(3)
  expect(project.links).toHaveLength(2)
  expect(project).not.toHaveProperty('arp')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(path!)
  await expect(page.getByTestId('device-pc1')).toBeVisible()
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.getByLabel('Terminal device').selectOption('pc1')
  await runCommand(page, 'ping 192.168.7.20')
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText(
    'Reply from 192.168.7.20',
  )
})

test('invalid import preserves the document and autosave restores after reload', async ({
  page,
}) => {
  await open(page)
  await page.getByLabel('Example topology').selectOption('same-lan')
  await expect(page.getByRole('status')).toContainText('Autosaved locally')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  })
  await expect(page.getByRole('alert')).toContainText('current project kept')
  await expect(page.getByTestId('device-pc1')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Restore autosave', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
})

test('narrow workspace exposes usable panels without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.getByRole('button', { name: 'console', exact: true }).click()
  await expect(page.getByLabel('Terminal command')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  expect(overflow).toBe(false)
})

test('initial fit shows every device and packet animation stops at power failure', async ({
  page,
}) => {
  await open(page)
  const canvas = await page.getByTestId('topology-canvas').boundingBox()
  await expect
    .poll(async () => {
      const boxes = await page
        .locator('.react-flow__node')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))
      return (
        boxes.length === 6 &&
        boxes.every(
          (box) =>
            box.x >= canvas!.x &&
            box.y >= canvas!.y &&
            box.right <= canvas!.x + canvas!.width &&
            box.bottom <= canvas!.y + canvas!.height,
        )
      )
    })
    .toBe(true)
  const { examples } = await import('../../src/examples')
  const document = structuredClone(examples.find((lab) => lab.id === 'same-lan')!.document)
  document.links.forEach((link) => {
    link.latencyMs = 500
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'animation.netlab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  })
  await page.getByLabel('Simulation speed').selectOption('0.25')
  await page.getByLabel('Terminal command').fill('ping 192.168.1.20')
  await page.getByRole('button', { name: 'Run command', exact: true }).click()
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click()
  const packet = page.getByRole('button', { name: 'Inspect ARP packet', exact: true }).first()
  await expect(packet).toBeVisible()
  const start = await packet.getAttribute('style')
  await expect.poll(() => packet.getAttribute('style')).not.toBe(start)
  await packet.click()
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Historical packet/ })).toBeVisible()
  await page.getByRole('button', { name: 'Power off', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inspect ARP packet', exact: true })).toHaveCount(0)
})

test('changing learning modes preserves unsaved topology and undo history', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('button', { name: 'Add PC', exact: true }).click()
  await page.getByRole('button', { name: 'Dijkstra 알고리즘 실습', exact: true }).click()
  await page.getByRole('button', { name: '프로토콜 실습', exact: true }).click()
  await expect(page.locator('.protocol-lab .react-flow__node')).toHaveCount(1)
  await expect(page.getByTestId('device-pc1')).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.protocol-lab .react-flow__node')).toHaveCount(0)
})

test('100-device import batches node measurements without React errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page)
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/stress.netlab.json')
  await expect(page.locator('.react-flow__node')).toHaveCount(100)
  await expect(page.locator('.react-flow__node').nth(99)).toBeVisible()
  await page.getByLabel('Terminal device').selectOption('r0')
  await runCommand(page, 'ping 10.1.0.2')
  await expect(page.getByRole('log', { name: 'Command output' })).toContainText(
    'Reply from 10.1.0.2',
  )
  expect(errors).toEqual([])
})
