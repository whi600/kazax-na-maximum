<script setup>
import { assistantApi } from '../../api'
import { createOperationId } from '../../utils/operationId'
import VoiceAssistant from './VoiceAssistant.vue'

defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['inventory-actions', 'schedule-completed', 'calendar-completed'])

const runCommand = async (command) => {
  const route = await assistantApi.global(command)
  if (route.target === 'inventory') {
    const result = await assistantApi.command(route.command)
    if (Array.isArray(result?.actions) && result.actions.length) {
      emit('inventory-actions', result.actions)
    }
    return { ...result, reply: result?.reply || route.reply, target: route.target }
  }
  if (route.target === 'schedule') {
    const result = await assistantApi.schedule(route.command, { operationId: createOperationId() })
    if (Array.isArray(result?.actions) && result.actions.length) emit('schedule-completed', result)
    return { ...result, reply: result?.reply || route.reply, target: route.target }
  }
  if (route.target === 'calendar') {
    const result = await assistantApi.calendar(route.command, { operationId: createOperationId() })
    if (Array.isArray(result?.actions) && result.actions.length) emit('calendar-completed', result)
    return { ...result, reply: result?.reply || route.reply, target: route.target }
  }
  return route
}
</script>

<template>
  <VoiceAssistant
    :disabled="disabled"
    :command-api="runCommand"
    prompt-hint="Скажите, что нужно сделать в приложении"
    placeholder="Например: добавь событие на пятницу или займи смену"
    description="Один помощник для остатков, смен и календаря. Говорите обычными словами — он выберет нужный раздел и выполнит действие."
    fallback-reply="Уточните, что нужно сделать."
  />
</template>
