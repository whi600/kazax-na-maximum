import { ref } from 'vue'

export const useNativeInputPicker = () => {
  const input = ref(null)

  const openPicker = (event) => {
    if (!input.value?.showPicker) return

    try {
      input.value.showPicker()
      event.preventDefault()
    } catch {
      // Safari opens the native picker through the label's default interaction.
    }
  }

  return { input, openPicker }
}
