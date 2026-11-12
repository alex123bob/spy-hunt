import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sheet } from './Sheet'

describe('Sheet', () => {
  it('Escape closes a dismissible sheet', () => {
    const onClose = vi.fn()
    render(<Sheet label="x" onClose={onClose}><button>a</button></Sheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  it('Escape does nothing when not dismissible', () => {
    const onClose = vi.fn()
    render(<Sheet label="x" onClose={onClose} dismissible={false}><button>a</button></Sheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
  it('has dialog role and label', () => {
    render(<Sheet label="Settings" onClose={() => {}}><button>a</button></Sheet>)
    const d = screen.getByRole('dialog', { name: 'Settings' })
    expect(d).toHaveAttribute('aria-modal', 'true')
  })
  it('focuses first control', () => {
    render(<Sheet label="x" onClose={() => {}}><button>first</button><button>second</button></Sheet>)
    expect(screen.getByText('first')).toHaveFocus()
  })
  it('Tab from the last control wraps to the first', () => {
    render(<Sheet label="x" onClose={() => {}}><button>first</button><button>second</button></Sheet>)
    screen.getByText('second').focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByText('first')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('second')).toHaveFocus()
  })
  it('focuses the dialog when it has no controls', () => {
    render(<Sheet label="x" onClose={() => {}}><p>hi</p></Sheet>)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
