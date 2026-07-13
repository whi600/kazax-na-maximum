<script setup>
import { onMounted, ref } from 'vue'
import ArchiveCalendarView from './ArchiveCalendarView.vue'
import ArchiveDayView from './ArchiveDayView.vue'
import ArchiveEmployeesView from './ArchiveEmployeesView.vue'
import ArchiveEmployeeView from './ArchiveEmployeeView.vue'
import ArchiveHomeView from './ArchiveHomeView.vue'
import ArchivePageHeader from './ArchivePageHeader.vue'
import ArchivePeriodView from './ArchivePeriodView.vue'
import ArchiveReportsView from './ArchiveReportsView.vue'
import ArchiveWriteOffsView from './ArchiveWriteOffsView.vue'
import { useArchiveCalendar } from './composables/useArchiveCalendar'
import { useArchiveEmployees } from './composables/useArchiveEmployees'
import { useArchivePeriod } from './composables/useArchivePeriod'
import { useArchiveReports } from './composables/useArchiveReports'
import { useArchiveWriteOffs } from './composables/useArchiveWriteOffs'

const props = defineProps({
  lockedMode: { type: String, default: '' },
  hideToggle: { type: Boolean, default: false },
  canViewAudit: { type: Boolean, default: false },
})

const view = ref('home')
const writeOffBackView = ref('home')
const reports = useArchiveReports()
const calendar = useArchiveCalendar()
const employeeArchive = useArchiveEmployees()
const period = useArchivePeriod()
const writeOffs = useArchiveWriteOffs()

const openView = async (target) => {
  if (target === 'calendar') {
    view.value = 'calendar'
    await calendar.loadMonth()
    return
  }
  if (target === 'employees') {
    view.value = 'employees'
    await employeeArchive.enableEmployeeSearch()
    return
  }
  if (target === 'period') {
    view.value = 'period'
    await period.enablePeriod()
    return
  }
  if (target === 'writeOffs') {
    writeOffBackView.value = view.value === 'period' ? 'period' : 'home'
    view.value = 'writeOffs'
    if (!writeOffs.loaded.value) await writeOffs.load()
  }
}

const openDay = async (date) => {
  view.value = 'day'
  await calendar.loadDay(date)
}

const openEmployee = async (employee) => {
  view.value = 'employee'
  await employeeArchive.loadEmployee(employee)
}

const goBack = () => {
  if (view.value === 'day') view.value = 'calendar'
  else if (view.value === 'employee') view.value = 'employees'
  else if (view.value === 'writeOffs') view.value = writeOffBackView.value
  else view.value = 'home'
}

onMounted(() => reports.loadRecords())
</script>

<template>
  <div class="space-y-3 overflow-x-clip pb-10">
    <ArchiveReportsView
      v-if="lockedMode === 'records'"
      :loading="reports.recordsLoading.value"
      :sections="reports.recordsDaySections.value"
      :has-more="reports.hasMoreRecordDays.value"
      @load-more="reports.loadMoreRecordDays"
    />

    <Transition v-else name="archive-panel" mode="out-in">
      <ArchiveHomeView
        v-if="view === 'home'"
        key="home"
        :loading="reports.recordsLoading.value"
        :sections="reports.recordsDaySections.value"
        :has-more="reports.hasMoreRecordDays.value"
        @open="openView"
        @load-more="reports.loadMoreRecordDays"
      />

      <ArchiveCalendarView
        v-else-if="view === 'calendar'"
        key="calendar"
        :month-label="calendar.monthLabel.value"
        :cells="calendar.calendarCells.value"
        :loading="calendar.calendarLoading.value"
        @back="goBack"
        @change-month="calendar.changeMonth"
        @select-day="openDay"
      />

      <ArchiveDayView
        v-else-if="view === 'day'"
        key="day"
        :date="calendar.selectedDate.value"
        :data="calendar.dayData.value"
        :sections="calendar.daySections.value"
        :loading="calendar.dayLoading.value"
        @back="goBack"
      />

      <ArchiveEmployeesView
        v-else-if="view === 'employees'"
        key="employees"
        :search="employeeArchive.employeeSearch.value"
        :employees="employeeArchive.employees.value"
        :total="employeeArchive.employeesTotal.value"
        :loading="employeeArchive.employeesLoading.value"
        :has-more="employeeArchive.employeesHasMore.value"
        @back="goBack"
        @update:search="employeeArchive.employeeSearch.value = $event"
        @select="openEmployee"
        @load-more="employeeArchive.loadMoreEmployees"
      />

      <ArchiveEmployeeView
        v-else-if="view === 'employee'"
        key="employee"
        :employee="employeeArchive.selectedEmployee.value"
        :detail="employeeArchive.employeeDetail.value"
        :loading="employeeArchive.employeeDetailLoading.value"
        @back="goBack"
        @load-more="employeeArchive.loadMoreEmployeeShifts"
      />

      <ArchivePeriodView
        v-else-if="view === 'period'"
        key="period"
        :start="period.periodStart.value"
        :end="period.periodEnd.value"
        :data="period.periodData.value"
        :loading="period.periodLoading.value"
        @back="goBack"
        @update:start="period.periodStart.value = $event"
        @update:end="period.periodEnd.value = $event"
        @open-write-offs="openView('writeOffs')"
      />

      <div v-else key="write-offs" class="space-y-3">
        <ArchivePageHeader title="Списания" subtitle="По дням" @back="goBack" />
        <ArchiveWriteOffsView
          :loading="writeOffs.loading.value"
          :details-loading="writeOffs.detailsLoading.value"
          :days="writeOffs.chartDays.value"
          :details="writeOffs.details.value"
          :selected-date="writeOffs.selectedDate.value"
          :selected-label="writeOffs.selectedLabel.value"
          :has-more="writeOffs.hasMore.value"
          @select-day="writeOffs.loadDetails"
          @load-more="writeOffs.loadMore"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.archive-panel-enter-active,
.archive-panel-leave-active {
  transition: opacity 180ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.archive-panel-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.archive-panel-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
