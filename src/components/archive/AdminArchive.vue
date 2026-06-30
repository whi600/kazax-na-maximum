<script setup>
import { BarChart3, Calendar, Clock, PackageSearch, User } from 'lucide-vue-next'
import NativeDateButton from '../shared/NativeDateButton.vue'
import { useArchiveData } from './useArchiveData'

const props = defineProps({
  lockedMode: { type: String, default: '' },
  hideToggle: { type: Boolean, default: false },
  canViewAudit: { type: Boolean, default: false },
})

const {
  archiveView,
  recordsLoading,
  shiftsLoading,
  auditLoading,
  analyticsLoading,
  analyticsDetailsLoading,
  selectedEmployee,
  periodStart,
  periodEnd,
  recordsLoadMoreRef,
  baseShifts,
  employees,
  groupedShiftHistory,
  selectedEmployeeSummary,
  periodShifts,
  periodEmployeeStats,
  periodTotalHours,
  periodLabel,
  archiveTabs,
  archiveViewIndex,
  recordsDaySections,
  hasMoreRecordDays,
  hasMoreShifts,
  hasMoreAudit,
  shiftsLoadMoreRef,
  auditLoadMoreRef,
  auditLogs,
  writeOffChartDays,
  writeOffDetails,
  selectedWriteOffDate,
  selectedWriteOffLabel,
  loadWriteOffDetails,
  formatDateTimeLabel,
  formatAuditAction,
  formatAuditEntity,
  formatAuditSummary,
  formatDateLabel,
  formatHours,
  formatShiftDay,
  formatShiftWeekday,
} = useArchiveData(props)
</script>

<template>
  <div class="space-y-4 pb-10">
    <div
      v-if="!hideToggle"
      class="relative grid gap-1.5 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm overflow-hidden"
      :style="{ gridTemplateColumns: `repeat(${archiveTabs.length}, minmax(0, 1fr))` }"
    >
      <div
        class="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-blue-600 shadow-lg shadow-blue-100 transition-transform duration-300 ease-out pointer-events-none"
        :style="{
          width: `calc((100% - ${(archiveTabs.length - 1) * 0.375 + 0.75}rem) / ${archiveTabs.length})`,
          transform: `translateX(calc(${archiveViewIndex} * (100% + 0.375rem)))`,
        }"
        aria-hidden="true"
      />
      <button
        v-for="tab in archiveTabs"
        :key="tab.key"
        @click="archiveView = tab.key"
        :class="archiveView === tab.key ? 'text-white' : 'text-slate-400'"
        class="relative z-10 text-[10px] font-black uppercase py-2 rounded-xl transition-colors duration-300"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="archiveView === 'records'">
      <div v-if="recordsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка истории...
      </div>

      <div
        v-else-if="recordsDaySections.length === 0"
        class="text-center py-10 text-slate-400 text-xs font-bold uppercase"
      >
        Архив пуст
      </div>

      <div
        v-for="section in recordsDaySections"
        :key="section.key"
        class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm"
      >
        <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <Calendar class="w-5 h-5 text-blue-600" />
          <span class="text-xs font-black text-slate-500 uppercase tracking-normal">
            {{ section.dateLabel }} • {{ section.weekDayLabel }}
          </span>
        </div>
        <div class="p-3">
          <table class="w-full table-fixed text-sm">
            <thead>
              <tr class="text-slate-500 uppercase text-[11px] font-black">
                <th class="text-left px-2.5 py-2.5 w-[43%] border-b border-r border-slate-100">Продукт</th>
                <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-r border-slate-100">Приход</th>
                <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-r border-slate-100">Остаток</th>
                <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-slate-100">Списание</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in section.rows"
                :key="record.id"
                :class="[
                  record.rowType === 'category' ? 'font-black' : 'font-bold',
                  record.hasCategoryDivider ? 'border-t-[3px] border-slate-300' : 'border-t border-slate-100',
                ]"
              >
                <td
                  v-if="record.rowType === 'category'"
                  colspan="4"
                  class="bg-slate-50 px-2.5 py-2 text-[12px] uppercase tracking-[0.12em] text-slate-500"
                >
                  {{ record.categoryLabel }}
                </td>
                <template v-else>
                  <td class="px-2.5 py-3 leading-tight text-slate-900 border-r border-slate-100">{{ record.products?.name || 'Удален' }}</td>
                  <td class="px-1.5 py-3 text-right text-blue-600 border-r border-slate-100">{{ record.arrival }}</td>
                  <td class="px-1.5 py-3 text-right text-slate-800 border-r border-slate-100">{{ record.remainder }}</td>
                  <td class="px-1.5 py-3 text-right text-red-500">{{ record.write_off }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="hasMoreRecordDays"
        ref="recordsLoadMoreRef"
        class="py-2 text-center text-[10px] font-black uppercase text-slate-300"
      >
        Загружаем еще...
      </div>
    </div>

    <div v-else-if="archiveView === 'writeOffs'" class="space-y-3">
      <div v-if="analyticsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка списаний...
      </div>

      <div
        v-else-if="writeOffChartDays.length === 0"
        class="text-center py-10 text-slate-400 text-xs font-bold uppercase"
      >
        Списаний пока нет
      </div>

      <template v-else>
        <section class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div class="mb-4 flex items-center gap-2">
            <BarChart3 class="h-5 w-5 text-blue-600" />
            <div>
              <p class="text-xs font-black uppercase text-slate-700">Списания по дням</p>
              <p class="text-[10px] font-bold text-slate-400">Нажмите на день, чтобы увидеть позиции</p>
            </div>
          </div>

          <div class="flex h-44 items-end gap-2 overflow-x-auto pb-1">
            <button
              v-for="day in writeOffChartDays"
              :key="day.date"
              type="button"
              @click="loadWriteOffDetails(day.date)"
              class="flex min-w-12 flex-1 flex-col items-center justify-end gap-2 rounded-lg px-1 py-1 transition-all active:scale-95"
              :class="selectedWriteOffDate === day.date ? 'bg-blue-50' : 'bg-slate-50'"
            >
              <span class="text-[10px] font-black text-slate-500">
                {{ day.totalWriteOff }}
              </span>
              <span
                class="w-full max-w-8 rounded-t-lg transition-all duration-300"
                :class="selectedWriteOffDate === day.date ? 'bg-blue-600' : 'bg-slate-300'"
                :style="{ height: `${day.heightPercent}%` }"
              />
              <span class="text-[9px] font-black uppercase text-slate-400">
                {{ formatShiftDay(day.date) }}
              </span>
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <PackageSearch class="h-5 w-5 text-blue-600" />
            <div>
              <p class="text-xs font-black uppercase text-slate-700">
                {{ selectedWriteOffLabel || 'Детализация' }}
              </p>
              <p class="text-[10px] font-bold text-slate-400">Все списанные позиции за день</p>
            </div>
          </div>

          <div v-if="analyticsDetailsLoading" class="py-6 text-center text-xs font-bold uppercase text-slate-300">
            Загружаем...
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in writeOffDetails"
              :key="item.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-black text-slate-800">{{ item.product_name }}</p>
                <p class="text-[10px] font-bold uppercase text-slate-400">{{ item.product_unit }}</p>
              </div>
              <p class="shrink-0 text-base font-black text-red-500">{{ item.write_off }}</p>
            </div>
          </div>
        </section>
      </template>
    </div>

    <div v-else>
      <div v-if="archiveView === 'shiftHistory'" class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <User class="w-4 h-4 text-blue-600" />
            <span class="text-[10px] font-black uppercase text-slate-400">Сотрудник</span>
          </div>
          <p class="text-sm font-black text-slate-800">{{ selectedEmployeeSummary }}</p>
        </div>

        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            @click="selectedEmployee = 'all'"
            class="shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-20"
            :class="
              selectedEmployee === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-500 border-slate-100'
            "
          >
            <span class="block text-[10px] font-black uppercase">Все</span>
            <span class="block text-xs font-black">{{ baseShifts.length }} смен</span>
          </button>

          <button
            v-for="employee in employees"
            :key="employee.key"
            @click="selectedEmployee = employee.key"
            class="shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-24"
            :class="
              selectedEmployee === employee.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-500 border-slate-100'
            "
          >
            <span class="block text-[10px] font-black uppercase max-w-28 truncate">{{ employee.name }}</span>
            <span class="block text-xs font-black">{{ employee.count }} смен</span>
          </button>
        </div>
      </div>

      <div v-if="archiveView === 'shiftHours'" class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <Clock class="w-4 h-4 text-blue-600" />
            <span class="text-[10px] font-black uppercase text-slate-400">Часы за период</span>
          </div>
          <p class="text-sm font-black text-slate-800">
            {{ formatHours(periodTotalHours) }} ч • {{ periodShifts.length }} смен
          </p>
          <p class="text-[10px] font-bold text-slate-400 mt-0.5">{{ periodLabel }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <NativeDateButton
            v-model="periodStart"
            label="Начало"
            :display-value="formatDateLabel(periodStart)"
          />
          <NativeDateButton
            v-model="periodEnd"
            label="Конец"
            :display-value="formatDateLabel(periodEnd)"
          />
        </div>
      </div>

      <div v-if="shiftsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка смен...
      </div>

      <div v-else-if="archiveView === 'shiftHistory' && groupedShiftHistory.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Смен нет
      </div>

      <div v-else-if="archiveView === 'shiftHours' && periodEmployeeStats.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        В этом периоде смен нет
      </div>
      <div v-else-if="archiveView === 'audit' && !auditLoading && auditLogs.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Изменений пока нет
      </div>

      <template v-if="archiveView === 'shiftHistory'">
        <div v-for="group in groupedShiftHistory" :key="group.label" class="space-y-2">
          <div class="px-1 flex items-center gap-2">
            <Calendar class="w-3.5 h-3.5 text-blue-600" />
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">{{ group.label }}</span>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="shift in group.items"
              :key="shift.id"
              class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[13px] font-black text-slate-800 truncate">
                    {{ formatShiftDay(shift.date) }}
                  </div>
                  <div class="text-[10px] text-slate-400 font-black uppercase">
                    {{ formatShiftWeekday(shift.date) }}
                    <span v-if="selectedEmployee === 'all'"> • {{ shift.employee_name }}</span>
                  </div>
                </div>

                <div class="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-right shrink-0">
                  <div class="text-[12px] font-black text-slate-800">
                    {{ shift.start_time }}–{{ shift.end_time }}
                  </div>
                  <div class="text-[9px] font-black text-blue-600 uppercase flex items-center justify-end gap-1">
                    <Clock class="w-3 h-3" />
                    смена
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="hasMoreShifts"
          ref="shiftsLoadMoreRef"
          class="py-2 text-center text-[10px] font-black uppercase text-slate-300"
        >
          Загружаем еще...
        </div>
      </template>

      <div v-if="archiveView === 'shiftHours' && periodEmployeeStats.length > 0" class="space-y-2">
        <div
          v-for="employee in periodEmployeeStats"
          :key="employee.name"
          class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[13px] font-black text-slate-800 truncate">
                {{ employee.name }}
              </div>
              <div class="text-[10px] text-slate-400 font-black uppercase">
                {{ employee.shiftsCount }} смен
              </div>
            </div>

            <div class="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-right shrink-0">
              <div class="text-base font-black text-blue-600">
                {{ formatHours(employee.hours) }} ч
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="archiveView === 'audit'" class="space-y-2">
        <div v-if="auditLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
          Загрузка изменений...
        </div>

        <div
          v-for="log in auditLogs"
          :key="log.id"
          class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-black text-slate-800 uppercase">{{ formatAuditAction(log.action) }}</p>
            <p class="text-[9px] font-black text-slate-400">{{ formatDateTimeLabel(log.created_at) }}</p>
          </div>
          <p class="text-[10px] font-black text-blue-600 mt-1 uppercase">
            {{ log.actor_name }} • {{ formatAuditEntity(log.entity_type) }}<span v-if="log.entity_id"> #{{ log.entity_id }}</span>
          </p>
          <p v-if="formatAuditSummary(log)" class="text-[10px] font-bold text-slate-500 mt-1">
            {{ formatAuditSummary(log) }}
          </p>
        </div>
        <div
          v-if="hasMoreAudit"
          ref="auditLoadMoreRef"
          class="py-2 text-center text-[10px] font-black uppercase text-slate-300"
        >
          Загружаем еще...
        </div>
      </div>
    </div>

  </div>
</template>
