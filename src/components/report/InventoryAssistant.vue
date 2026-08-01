<script setup>
import { assistantApi } from '../../api'
import VoiceAssistant from '../shared/VoiceAssistant.vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['actions'])

const handleResponse = (response) => {
  const actions = Array.isArray(response?.actions) ? response.actions : []
  if (actions.length) emit('actions', actions)
}
</script>

<template>
  <VoiceAssistant
    :disabled="props.disabled"
    :command-api="assistantApi.command"
    prompt-hint="Нажмите и скажите: «Остаток молока — 7»"
    disabled-hint="Отчёт закрыт для изменений"
    placeholder="Например: поставь остаток молока 7"
    description="Скажите или напишите, какой остаток нужно указать. Например: «Остаток круассана — 12»."
    fallback-reply="Уточните товар и количество остатка."
    @response="handleResponse"
  />
</template>
