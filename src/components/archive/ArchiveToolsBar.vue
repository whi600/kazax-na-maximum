<script setup>
import { computed } from 'vue'
import { ArrowLeft, BarChart3, Clock, History } from 'lucide-vue-next'

const props = defineProps({
  activeView: { type: String, required: true },
})

const emit = defineEmits(['open', 'back'])

const tools = [
  { key: 'shiftHistory', label: 'Смены', title: 'История смен', icon: History },
  { key: 'shiftHours', label: 'Часы', title: 'Часы сотрудников', icon: Clock },
  { key: 'writeOffs', label: 'Списания', title: 'Списания', icon: BarChart3 },
]

const activeTool = computed(
  () => tools.find((tool) => tool.key === props.activeView) || tools[0],
)
</script>

<template>
  <section
    v-if="activeView === 'records'"
    class="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm"
    aria-label="Инструменты архива"
  >
    <button
      v-for="tool in tools"
      :key="tool.key"
      type="button"
      class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-slate-500 transition-colors active:bg-blue-50 active:text-blue-600"
      @click="emit('open', tool.key)"
    >
      <component :is="tool.icon" class="h-4 w-4" />
      <span class="text-[10px] font-black uppercase leading-none">{{ tool.label }}</span>
    </button>
  </section>

  <section v-else class="flex h-10 items-center gap-2 px-1">
    <button
      type="button"
      class="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-black uppercase text-slate-500 transition-colors active:bg-slate-100"
      @click="emit('back')"
    >
      <ArrowLeft class="h-4 w-4" />
      Отчеты
    </button>
    <span class="h-5 w-px bg-slate-200" />
    <component :is="activeTool.icon" class="h-4 w-4 text-blue-600" />
    <h2 class="text-sm font-black text-slate-800">{{ activeTool.title }}</h2>
  </section>
</template>
