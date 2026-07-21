import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopUpdateNotice } from './DesktopUpdateNotice'

describe('DesktopUpdateNotice', () => {
  afterEach(() => {
    delete window.tcmDesktop
  })

  it('downloads an available update when clicked', async () => {
    const download = vi.fn().mockResolvedValue(undefined)
    window.tcmDesktop = {
      isDesktop: true,
      platform: 'win32',
      updater: {
        getState: vi.fn().mockResolvedValue({ status: 'available', currentVersion: '0.1.0', version: '0.2.0' }),
        check: vi.fn(),
        download,
        onStateChange: vi.fn(() => vi.fn()),
      },
    }

    render(<DesktopUpdateNotice />)
    await userEvent.click(await screen.findByRole('button', { name: '更新到 0.2.0' }))

    expect(download).toHaveBeenCalledOnce()
  })

  it('shows download progress and prevents a second click', async () => {
    window.tcmDesktop = {
      isDesktop: true,
      platform: 'win32',
      updater: {
        getState: vi.fn().mockResolvedValue({ status: 'downloading', currentVersion: '0.1.0', version: '0.2.0', percent: 42.3 }),
        check: vi.fn(),
        download: vi.fn(),
        onStateChange: vi.fn(() => vi.fn()),
      },
    }

    render(<DesktopUpdateNotice />)

    expect(await screen.findByRole('button', { name: '正在更新 42%' })).toBeDisabled()
  })
})
