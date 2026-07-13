<script setup>
import { ArrowLeft } from 'lucide-vue-next'
import AdminArchive from '../archive/AdminArchive.vue'

const emit = defineEmits(['back'])
</script>

<template>
  <section class="space-y-3">
    <div class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        @click="emit('back')"
        class="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        Назад в профиль
      </button>
      <h2 class="text-xl font-black uppercase italic text-slate-800">
        Журнал изменений
      </h2>
      <p class="mt-1 text-xs font-bold text-slate-400">
        Доступен только супер-админу
      </p>
    </div>

    <AdminArchive
      locked-mode="audit"
      hide-toggle
      can-view-audit
    />
  </section>
</template>
