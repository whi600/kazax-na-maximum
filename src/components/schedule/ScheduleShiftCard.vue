<script setup>
import { Pencil, Trash2, X } from 'lucide-vue-next'

defineProps({
  shift: { type: Object, required: true },
  isPast: { type: Boolean, default: false },
  isNew: { type: Boolean, default: false },
  canManageSchedule: { type: Boolean, default: false },
  canSelfCancel: { type: Boolean, default: false },
  dayDelay: { type: String, default: '0ms' },
  shiftDelay: { type: String, default: '0ms' },
})

const emit = defineEmits(['book', 'cancel', 'edit', 'delete'])
</script>

<template>
  <div
    class="p-3.5 rounded-lg border shadow-sm flex items-center justify-between transition-all"
    :class="
      isPast
        ? 'bg-slate-100 border-slate-200 opacity-70'
        : 'bg-white border-slate-100'
    "
    :style="{ '--day-delay': dayDelay, '--shift-delay': shiftDelay }"
  >
    <div class="flex items-center gap-2">
      <span
        class="text-[12px] font-black px-2 py-1.5 rounded-lg border"
        :class="
          isPast
            ? 'bg-slate-200/80 border-slate-200 text-slate-500'
            : 'bg-slate-50 border-slate-100 text-slate-800'
        "
      >
        {{ shift.start_time }}–{{ shift.end_time }}
      </span>
      <span
        v-if="isNew"
        class="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase"
      >
        New
      </span>
    </div>

    <div class="flex items-center gap-3">
      <div
        v-if="shift.employee_name"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
        :class="
          isPast
            ? 'bg-slate-200/60 border-slate-200 text-slate-500'
            : 'bg-blue-50/50 border-blue-100/50'
        "
      >
        <span
          class="text-[11px] font-black"
          :class="isPast ? 'text-slate-500' : 'text-blue-600'"
        >
          {{ shift.employee_name }}
        </span>
        <button
          v-if="!isPast && (canManageSchedule || canSelfCancel)"
          @click="emit('cancel')"
          class="p-0.5 text-red-500 transition-colors hover:bg-white rounded-md"
          aria-label="Снять сотрудника со смены"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        v-else-if="!isPast"
        @click="emit('book')"
        class="bg-slate-800 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md active:scale-95 transition-all"
      >
        Запись
      </button>

      <button
        v-if="canManageSchedule && !isPast"
        @click="emit('edit')"
        class="text-slate-300 hover:text-blue-600 transition-colors"
        aria-label="Редактировать смену"
      >
        <Pencil class="w-4 h-4" />
      </button>

      <button
        v-if="canManageSchedule && !isPast"
        @click="emit('delete')"
        class="text-slate-200 transition-colors hover:text-red-500"
        aria-label="Удалить смену"
      >
        <Trash2 class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
