import { fireEvent, render, screen } from '@testing-library/react'
import { LangMenu } from './LangMenu'

const setup = (onChange = vi.fn()) => {
  render(<div><LangMenu value="en" onChange={onChange} label="Language" /><span data-testid="out">x</span></div>)
  return screen.getByRole('button', { name: 'Language: English' })
}

test('closed by default with labelled button', () => {
  const btn = setup()
  expect(btn).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('click opens listbox with options, current selected', () => {
  const btn = setup()
  fireEvent.click(btn)
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /English/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: /简体中文/ })).toHaveAttribute('aria-selected', 'false')
})

test('picking calls onChange and closes', () => {
  const onChange = vi.fn()
  setup(onChange)
  fireEvent.click(screen.getByRole('button', { name: 'Language: English' }))
  fireEvent.click(screen.getByRole('option', { name: /简体中文/ }))
  expect(onChange).toHaveBeenCalledWith('zh-Hans')
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('picking the current language closes without calling onChange', () => {
  const onChange = vi.fn()
  const btn = setup(onChange)
  fireEvent.click(btn)
  fireEvent.click(screen.getByRole('option', { name: /English/ }))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('Escape closes and refocuses button', () => {
  const btn = setup()
  fireEvent.click(btn)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(btn).toHaveFocus()
})

test('pointerdown outside closes', () => {
  const btn = setup()
  fireEvent.click(btn)
  fireEvent.pointerDown(screen.getByTestId('out'))
  expect(screen.queryByRole('listbox')).toBeNull()
})
