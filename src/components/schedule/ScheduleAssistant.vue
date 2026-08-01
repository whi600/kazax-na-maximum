<script setup>
import { computed } from 'vue'
import { assistantApi } from '../../api'
import { createOperationId } from '../../utils/operationId'
import VoiceAssistant from '../shared/VoiceAssistant.vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  canManageSchedule: { type: Boolean, default: false },
  baseRevision: { type: Number, default: 0 },
})

const emit = defineEmits(['completed'])

const promptHint = computed(() => props.canManageSchedule
  ? 'Нажмите и скажите: «Создай смену в пятницу с 10 до 18»'
  : 'Нажмите и скажите: «Займи смену в пятницу с 10 до 18»')

const description = computed(() => props.canManageSchedule
  ? 'Создавайте и меняйте смены, назначайте сотрудников или занимайте свободную смену.'
  : 'Скажите, какую свободную смену хотите занять. Помощник запишет только вас.')

const placeholder = computed(() => props.canManageSchedule
  ? 'Например: создай смену в пятницу с 10:00 до 18:00 и назначь Анну'
  : 'Например: займи смену в пятницу с 10:00 до 18:00')

const sendScheduleCommand = (command) => assistantApi.schedule(command, {
  operationId: createOperationId(),
  baseRevision: props.baseRevision,
})

const handleResponse = (response) => {
  if (Array.isArray(response?.actions) && response.actions.length > 0) {
    emit('completed', response)
  }
}
</script>

<template>
  <VoiceAssistant
    :disabled="props.disabled"
    :command-api="sendScheduleCommand"
    :prompt-hint="promptHint"
    disabled-hint="Сначала сохраните изменения расписания"
    :placeholder="placeholder"
    :description="description"
    fallback-reply="Уточните дату, время или нужную смену."
    @response="handleResponse"
  />
</template>
