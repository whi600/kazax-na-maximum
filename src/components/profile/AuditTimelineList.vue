<script setup>
import {
  BellRing,
  CalendarClock,
  ClipboardCheck,
  History,
  Package,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-vue-next'
import { computed } from 'vue'
import {
  formatAuditTime,
  groupAuditTimelineByDay,
} from '../../audit/auditPresentation'

const props = defineProps({
  entries: { type: Array, default: () => [] },
})

const iconByCategory = {
  access: ShieldCheck,
  notification: BellRing,
  product: Package,
  report: ClipboardCheck,
  schedule: CalendarClock,
  other: History,
}

const toneByCategory = {
  access: 'bg-violet-50 text-violet-600',
  notification: 'bg-orange-50 text-orange-600',
  product: 'bg-emerald-50 text-emerald-600',
  report: 'bg-blue-50 text-blue-600',
  schedule: 'bg-sky-50 text-sky-600',
  other: 'bg-slate-100 text-slate-500',
}

const groups = computed(() => groupAuditTimelineByDay(props.entries))
const iconFor = (entry) => iconByCategory[entry.category] || UserRoundPlus
const toneFor = (entry) => toneByCategory[entry.category] || toneByCategory.other
const initial = (name) => String(name || 'С').trim().charAt(0).toUpperCase() || 'С'
</script>

<template>
  <div class="space-y-5">
    <section v-for="group in groups" :key="group.label" class="space-y-2">
      <p class="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {{ group.label }}
      </p>

      <div class="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <article
          v-for="entry in group.items"
          :key="entry.id"
          class="flex gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white"
            :aria-label="entry.actorName"
          >
            {{ initial(entry.actorName) }}
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-2">
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                :class="toneFor(entry)"
              >
                <component :is="iconFor(entry)" class="h-3.5 w-3.5" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-black leading-snug text-slate-800">{{ entry.title }}</p>
                <p class="mt-0.5 text-[10px] font-bold text-slate-400">
                  {{ entry.actorName }} · {{ formatAuditTime(entry.createdAt) }}
                </p>
              </div>
            </div>

            <details v-if="entry.details.length" class="group mt-2 pl-8">
              <summary class="cursor-pointer text-[10px] font-black text-blue-600 marker:content-none">
                Подробнее
              </summary>
              <ul class="mt-1.5 space-y-1 text-[10px] font-semibold leading-relaxed text-slate-500">
                <li v-for="detail in entry.details" :key="detail">{{ detail }}</li>
              </ul>
            </details>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
