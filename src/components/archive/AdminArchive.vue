<script setup>
import { computed } from 'vue'
import ArchiveAuditLogList from './ArchiveAuditLogList.vue'
import ArchiveHoursView from './ArchiveHoursView.vue'
import ArchiveReportsView from './ArchiveReportsView.vue'
import ArchiveShiftHistoryView from './ArchiveShiftHistoryView.vue'
import ArchiveToolsBar from './ArchiveToolsBar.vue'
import ArchiveWriteOffsView from './ArchiveWriteOffsView.vue'
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
  baseShifts,
  employees,
  groupedShiftHistory,
  periodShifts,
  periodEmployeeStats,
  periodTotalHours,
  periodLabel,
  recordsDaySections,
  hasMoreRecordDays,
  hasMoreShifts,
  hasMoreAudit,
  hasMoreWriteOffDays,
  auditLogs,
  shiftHistoryTotal,
  writeOffChartDays,
  writeOffDetails,
  selectedWriteOffDate,
  selectedWriteOffLabel,
  loadWriteOffDetails,
  loadMoreRecordDays,
  loadMoreShifts,
  loadMoreAudit,
  loadMoreWriteOffDays,
  formatDateTimeLabel,
  formatAuditAction,
  formatAuditEntity,
  formatAuditSummary,
  formatDateLabel,
  formatHours,
  formatShiftDay,
  formatShiftWeekday,
} = useArchiveData(props)

const showTools = computed(() => !props.lockedMode && props.canViewAudit && !props.hideToggle)
const totalShiftHistory = computed(() => shiftHistoryTotal.value || baseShifts.value.length)
const selectedShiftHistoryCount = computed(() => {
  if (selectedEmployee.value === 'all') return totalShiftHistory.value

  return (
    employees.value.find((employee) => employee.key === selectedEmployee.value)?.count ||
    groupedShiftHistory.value.reduce((total, group) => total + group.items.length, 0)
  )
})
</script>

<template>
  <div class="space-y-3 pb-10">
    <ArchiveToolsBar
      v-if="showTools"
      :active-view="archiveView"
      @open="archiveView = $event"
      @back="archiveView = 'records'"
    />

    <Transition name="archive-panel" mode="out-in">
      <ArchiveReportsView
        v-if="archiveView === 'records'"
        key="records"
        :loading="recordsLoading"
        :sections="recordsDaySections"
        :has-more="hasMoreRecordDays"
        @load-more="loadMoreRecordDays"
      />

      <ArchiveShiftHistoryView
        v-else-if="archiveView === 'shiftHistory'"
        key="shift-history"
        :loading="shiftsLoading"
        :selected-employee="selectedEmployee"
        :employees="employees"
        :total-shifts="selectedShiftHistoryCount"
        :groups="groupedShiftHistory"
        :has-more="hasMoreShifts"
        :format-shift-day="formatShiftDay"
        :format-shift-weekday="formatShiftWeekday"
        @update:selected-employee="selectedEmployee = $event"
        @load-more="loadMoreShifts"
      />

      <ArchiveHoursView
        v-else-if="archiveView === 'shiftHours'"
        key="shift-hours"
        :loading="shiftsLoading"
        :period-start="periodStart"
        :period-end="periodEnd"
        :period-label="periodLabel"
        :total-hours="periodTotalHours"
        :shifts-count="periodShifts.length"
        :employee-stats="periodEmployeeStats"
        :format-date-label="formatDateLabel"
        :format-hours="formatHours"
        @update:period-start="periodStart = $event"
        @update:period-end="periodEnd = $event"
      />

      <ArchiveWriteOffsView
        v-else-if="archiveView === 'writeOffs'"
        key="write-offs"
        :loading="analyticsLoading"
        :details-loading="analyticsDetailsLoading"
        :days="writeOffChartDays"
        :details="writeOffDetails"
        :selected-date="selectedWriteOffDate"
        :selected-label="selectedWriteOffLabel"
        :has-more="hasMoreWriteOffDays"
        @select-day="loadWriteOffDetails"
        @load-more="loadMoreWriteOffDays"
      />

      <ArchiveAuditLogList
        v-else
        key="audit"
        :loading="auditLoading"
        :logs="auditLogs"
        :has-more="hasMoreAudit"
        :format-date-time-label="formatDateTimeLabel"
        :format-audit-action="formatAuditAction"
        :format-audit-entity="formatAuditEntity"
        :format-audit-summary="formatAuditSummary"
        @load-more="loadMoreAudit"
      />
    </Transition>
  </div>
</template>

<style scoped>
.archive-panel-enter-active,
.archive-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.archive-panel-enter-from,
.archive-panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
