<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, recordsApi } from './api'
import ProductSelector from './components/ProductSelector.vue'
import EntryCard from './components/EntryCard.vue'
import AdminArchive from './components/AdminArchive.vue'
import ScheduleView from './components/ScheduleView.vue'
import AuthView from './components/AuthView.vue'
import NavIcon from './components/NavIcon.vue'
import {
  RotateCw,
  LayoutGrid,
  History,
  ShoppingBasket,
  ChefHat,
  CalendarClock,
  LogOut,
  ShieldCheck,
  UserRound,
  Plus,
  HandHelping,
  Bell,
} from 'lucide-vue-next'

const tabRoutes = {
  main: '/report',
  schedule: '/schedule',
  archive: '/archive',
  profile: '/profile',
}

const routeTabs = Object.fromEntries(
  Object.entries(tabRoutes).map(([tab, route]) => [route, tab]),
)

const getTabFromLocation = () => {
  if (typeof window === 'undefined') return 'main'

  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
  return routeTabs[normalizedPath] || 'main'
}

const activeTab = ref(getTabFromLocation())
const scheduleViewRef = ref(null)
const schedulePendingCount = ref(0)
const products = ref([])
const dailyEntries = ref([])

const currentUser = ref(null)
const authLoading = ref(true)
const appLoading = ref(false)
const authBusy = ref(false)
const authMessage = ref('')

const userRole = computed(() => currentUser.value?.role || null)
const userName = computed(() => currentUser.value?.name || 'Сотрудник')
const pageTitle = computed(() => {
  if (activeTab.value === 'schedule') return 'График'
  if (activeTab.value === 'archive') return 'Архив'
  if (activeTab.value === 'profile') return 'Профиль'
  return 'Отчет'
})

const navItems = computed(() => {
  const items = [
    { tab: 'main', label: 'Отчет', icon: 'report' },
    { tab: 'schedule', label: 'График', icon: 'schedule' },
  ]

  if (userRole.value === 'admin') {
    items.push({ tab: 'archive', label: 'Архив', icon: 'archive' })
  }

  items.push({ tab: 'profile', label: 'Профиль', icon: 'profile' })
  return items
})

const updateRoute = (tab, replace = false) => {
  if (typeof window === 'undefined') return

  const route = tabRoutes[tab] || tabRoutes.main
  if (window.location.pathname === route) return

  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', route)
}

const navigateTo = (tab, replace = false) => {
  const nextTab = tab === 'archive' && userRole.value !== 'admin' ? 'main' : tab
  activeTab.value = nextTab
  updateRoute(nextTab, replace)
}

const handlePopState = () => {
  navigateTo(getTabFromLocation(), true)
}

const fetchAppData = async () => {
  appLoading.value = true
  authMessage.value = ''

  try {
    const [productsResponse, todayResponse] = await Promise.all([
      recordsApi.products(),
      recordsApi.today(),
    ])

    products.value = productsResponse.products || []
    dailyEntries.value = (todayResponse.entries || []).map((entry) => ({
      product_id: entry.product_id,
      name: entry.name,
      category: entry.category || 'other',
      arrival: entry.arrival ?? null,
      remainder: entry.remainder ?? null,
      write_off: entry.write_off ?? null,
    }))
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось загрузить данные'
  } finally {
    appLoading.value = false
  }
}

const initialize = async () => {
  authLoading.value = true

  try {
    const response = await authApi.me()
    currentUser.value = response.user || null

    if (currentUser.value) {
      await fetchAppData()
    }
  } catch {
    currentUser.value = null
  } finally {
    authLoading.value = false
  }
}

const onAddProduct = (product) => {
  if (!dailyEntries.value.find((entry) => entry.product_id === product.id)) {
    dailyEntries.value.unshift({
      product_id: product.id,
      name: product.name,
      category: product.category || 'other',
      arrival: null,
      remainder: null,
      write_off: null,
    })
  }
}

const saveReport = async () => {
  try {
    await recordsApi.saveToday(
      dailyEntries.value.map((entry) => ({
        product_id: entry.product_id,
        arrival:
          entry.arrival !== null && entry.arrival !== '' ? Number(entry.arrival) : 0,
        remainder:
          entry.remainder !== null && entry.remainder !== ''
            ? Number(entry.remainder)
            : 0,
        write_off:
          entry.write_off !== null && entry.write_off !== ''
            ? Number(entry.write_off)
            : 0,
      })),
    )

    alert('✅ Сохранено')
  } catch (error) {
    alert('Ошибка: ' + (error?.message || 'Не удалось сохранить отчет'))
  }
}

const handleSignIn = async ({ email, password }) => {
  authBusy.value = true
  authMessage.value = ''

  try {
    const response = await authApi.login(email, password)
    currentUser.value = response.user
    navigateTo(getTabFromLocation(), true)
    await fetchAppData()
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось войти'
  } finally {
    authBusy.value = false
  }
}

const handleSignUp = async ({ email, password, displayName }) => {
  authBusy.value = true
  authMessage.value = ''

  try {
    const response = await authApi.register({ email, password, displayName })
    currentUser.value = response.user
    navigateTo(getTabFromLocation(), true)
    await fetchAppData()
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось зарегистрироваться'
  } finally {
    authBusy.value = false
  }
}

const logout = async () => {
  try {
    await authApi.logout()
  } catch {
    // noop
  }

  currentUser.value = null
  navigateTo('main', true)
  products.value = []
  dailyEntries.value = []
  authMessage.value = ''
}

const openScheduleAction = () => {
  if (userRole.value === 'admin') {
    scheduleViewRef.value?.openCreateShift()
    return
  }

  scheduleViewRef.value?.openHelpRequest()
}

const openScheduleRequests = () => {
  scheduleViewRef.value?.openPendingRequests()
}

const closeKeyboard = (event) => {
  if (event.target.tagName !== 'INPUT') {
    document.activeElement?.blur()
  }
}

const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [], other: [] }

  dailyEntries.value.forEach((entry) => {
    if (entry.category === 'bakery' || entry.category === 'pastry') {
      groups[entry.category].push(entry)
    } else {
      groups.other.push(entry)
    }
  })

  return groups
})

watch(userRole, (role) => {
  if (activeTab.value === 'archive' && role !== 'admin') {
    navigateTo('main', true)
  }
})

onMounted(async () => {
  updateRoute(activeTab.value, true)
  window.addEventListener('popstate', handlePopState)
  await initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 text-slate-800 pb-24 select-none touch-manipulation"
    @click="closeKeyboard"
  >
    <div v-if="authLoading" class="flex min-h-screen items-center justify-center">
      <RotateCw class="w-7 h-7 animate-spin text-blue-600" />
    </div>

    <AuthView
      v-else-if="!currentUser"
      :loading="authBusy"
      :message="authMessage"
      @sign-in="handleSignIn"
      @sign-up="handleSignUp"
    />

    <template v-else>
      <header
        class="bg-white/95 backdrop-blur-md px-4 py-3 pt-safe sticky top-0 z-40 border-b border-slate-100 flex justify-between items-center shadow-sm"
      >
        <div>
          <h1
            class="text-xl font-black italic tracking-tighter text-slate-800 leading-none uppercase"
          >
            {{ pageTitle }}
          </h1>
          <p
            class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1"
          >
            Кофетерий
          </p>
        </div>

        <div v-if="activeTab === 'schedule' && userRole" class="flex items-center gap-2">
          <button
            v-if="userRole === 'admin' && schedulePendingCount > 0"
            @click="openScheduleRequests"
            class="relative bg-white text-blue-600 border border-blue-100 px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Bell class="w-3.5 h-3.5 animate-swing" />
            Заявки
            <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center border-2 border-white">
              {{ schedulePendingCount }}
            </span>
          </button>

          <button
            @click="openScheduleAction"
            class="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg shadow-blue-200 active:scale-95 transition-all"
          >
            <Plus v-if="userRole === 'admin'" class="w-3.5 h-3.5" />
            <HandHelping v-else class="w-3.5 h-3.5" />
            {{ userRole === 'admin' ? 'Смена' : 'Помочь' }}
          </button>
        </div>
      </header>

      <main class="p-2">
        <div v-if="appLoading" class="flex justify-center py-10">
          <RotateCw class="w-6 h-6 animate-spin text-blue-600" />
        </div>

        <div v-else-if="activeTab === 'profile'" class="p-2">
          <section class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <UserRound class="w-6 h-6" />
              </div>
              <div>
                <h2 class="text-lg font-black text-slate-800">{{ userName }}</h2>
                <p class="text-[10px] font-bold text-slate-400">{{ currentUser?.email }}</p>
              </div>
            </div>

            <div class="space-y-2 mb-5">
              <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-3">
                <span class="text-[10px] font-black text-slate-400 uppercase">Роль</span>
                <span class="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100 flex items-center gap-1">
                  <ShieldCheck class="w-3 h-3" />
                  {{ userRole }}
                </span>
              </div>
            </div>

            <button
              @click="logout"
              class="w-full bg-slate-900 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <LogOut class="w-4 h-4" />
              Выйти
            </button>
          </section>
        </div>

        <div v-else-if="activeTab === 'schedule'">
          <ScheduleView
            ref="scheduleViewRef"
            :userRole="userRole"
            :currentUser="currentUser"
            :displayName="userName"
            @pending-count="schedulePendingCount = $event"
          />
        </div>

        <div v-else>
          <div v-if="activeTab === 'archive' && userRole === 'admin'">
            <AdminArchive />
          </div>

          <div v-else class="space-y-4">
            <div v-if="userRole === 'chef'">
              <AdminArchive :lockedMode="'records'" :hideToggle="true" />
            </div>

            <div v-else class="space-y-4">
              <ProductSelector
                :products="products"
                :dailyEntries="dailyEntries"
                @add="onAddProduct"
              />

              <div v-for="(items, cat) in groupedEntries" :key="cat" class="space-y-1">
                <h3
                  v-if="items.length"
                  class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] pt-2 pb-1 ml-1 flex items-center gap-1"
                >
                  <component
                    :is="
                      cat === 'bakery'
                        ? ShoppingBasket
                        : cat === 'pastry'
                          ? ChefHat
                          : LayoutGrid
                    "
                    class="w-2.5 h-2.5"
                  />
                  {{
                    cat === 'bakery'
                      ? 'Выпечка'
                      : cat === 'pastry'
                        ? 'Кондитерка'
                        : 'Другое'
                  }}
                </h3>

                <EntryCard
                  v-for="item in items"
                  :key="item.product_id"
                  :item="item"
                  @remove="
                    () => {
                      const idx = dailyEntries.indexOf(item)
                      if (idx > -1) dailyEntries.splice(idx, 1)
                    }
                  "
                />
              </div>

              <div v-if="dailyEntries.length === 0" class="text-center py-10 opacity-20">
                <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
                <p class="text-[10px] font-black uppercase">Нет товаров в отчете</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div
        v-if="userRole && userRole !== 'chef' && activeTab === 'main'"
        class="fixed left-4 right-4 z-50"
        :style="{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }"
      >
        <button
          @click="saveReport"
          class="w-full bg-blue-600 text-white py-4 rounded-2xl shadow-2xl shadow-blue-300 font-black uppercase text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          СОХРАНИТЬ ОТЧЕТ
        </button>
      </div>

      <nav
        v-if="userRole"
        class="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-safe nav-safe"
      >
        <div class="max-w-md mx-auto mb-3">
          <div
            class="kof-tabbar"
            :style="{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }"
          >
            <button
              v-for="item in navItems"
              :key="item.tab"
              class="kof-tabbtn"
              @click="navigateTo(item.tab)"
              :aria-label="item.label"
              type="button"
            >
              <span
                class="kof-tabbtn__icon"
                :class="{ 'is-active': activeTab === item.tab }"
              >
                <NavIcon :name="item.icon" class="w-6 h-6" />
              </span>
            </button>
          </div>
        </div>
      </nav>
    </template>
  </div>
</template>

<style>
::-webkit-scrollbar {
  display: none;
}

* {
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
}

body {
  background-color: #f8fafc;
  touch-action: pan-x pan-y;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  overscroll-behavior: none;
}

button,
input,
select,
textarea {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
}

button {
  -webkit-appearance: none;
  appearance: none;
}

input,
select,
textarea {
  -webkit-appearance: none;
  appearance: none;
  border-radius: 0;
}

@supports (-webkit-touch-callout: none) {
  input,
  select,
  textarea {
    font-size: 16px !important;
  }
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.pt-safe {
  padding-top: calc(0.75rem + env(safe-area-inset-top));
}

.nav-safe {
  min-height: calc(4rem + env(safe-area-inset-bottom));
}

.sheet-safe {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}

.sheet-max {
  max-height: calc(100vh - env(safe-area-inset-top) - 0.75rem);
  max-height: calc(100dvh - env(safe-area-inset-top) - 0.75rem);
}

.pb-24 {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom));
}

@keyframes swing {
  0%,
  100% {
    transform: rotate(0);
  }
  20% {
    transform: rotate(10deg);
  }
  40% {
    transform: rotate(-10deg);
  }
  60% {
    transform: rotate(5deg);
  }
  80% {
    transform: rotate(-5deg);
  }
}

.animate-swing {
  animation: swing 2s infinite;
}

.kof-tabbar {
  background: rgba(2, 6, 23, 0.95);
  border-radius: 16px;
  height: 56px;
  padding: 0 8px;
  box-shadow: 0 20px 38px rgba(15, 23, 42, 0.24);
  display: grid;
  position: relative;
  overflow: visible;
}

.kof-tabbtn {
  border: 0;
  background: transparent;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.kof-tabbtn__icon {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 190ms ease, color 180ms ease;
  position: relative;
  z-index: 1;
}

.kof-tabbtn__icon.is-active {
  transform: translateY(-8px);
  background-color: #2563eb;
  color: #fff;
}
</style>
