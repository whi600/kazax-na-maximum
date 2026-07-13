// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NativeDateButton from '../../src/components/shared/NativeDateButton.vue'

describe('NativeDateButton', () => {
  it('opens the native picker from the whole control', async () => {
    const showPicker = vi.fn()
    HTMLInputElement.prototype.showPicker = showPicker
    const wrapper = mount(NativeDateButton, {
      props: {
        modelValue: '2026-07-13',
        label: 'Дата',
        displayValue: '13 июля 2026 г.',
      },
    })

    await wrapper.get('label').trigger('click')
    expect(showPicker).toHaveBeenCalledOnce()
  })
})
