<script setup>
import { computed, onMounted, ref } from 'vue'
import { authApi, recordsApi } from './api'
import ProductSelector from './components/ProductSelector.vue'
import EntryCard from './components/EntryCard.vue'
import AdminArchive from './components/AdminArchive.vue'
import ScheduleView from './components/ScheduleView.vue'
import AuthView from './components/AuthView.vue'
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
} from 'lucide-vue-next'

const activeTab = ref('main')
const products = ref([])
const dailyEntries = ref([])

const currentUser = ref(null)
const authLoading = ref(true)
const appLoading = ref(false)
const authBusy = ref(false)
const authMessage = ref('')

const userRole = computed(() => currentUser.value?.role || null)
const userName = computed(() => currentUser.value?.name || 'Сотрудник')

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
    activeTab.value = 'main'
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
    activeTab.value = 'main'
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
  activeTab.value = 'main'
  products.value = []
  dailyEntries.value = []
  authMessage.value = ''
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

onMounted(initialize)
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 text-slate-900 pb-24 select-none touch-manipulation"
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
        class="bg-white/95 backdrop-blur-md p-3 sticky top-0 z-40 border-b border-slate-200 flex justify-between items-center shadow-sm"
      >
        <div @click="fetchAppData" class="cursor-pointer">
          <h1
            class="text-lg font-black italic tracking-tighter text-blue-600 leading-none uppercase"
          >
            Кофетерий
          </h1>
          <p
            class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1"
          >
            Смена
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span
            class="text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100 flex items-center gap-1"
          >
            <ShieldCheck class="w-2.5 h-2.5" />
            {{ userRole }}
          </span>

          <span
            class="hidden sm:inline-flex text-[9px] font-bold text-slate-500 items-center gap-1"
          >
            <UserRound class="w-3 h-3" />
            {{ userName }}
          </span>

          <button
            @click="fetchAppData"
            class="text-slate-300 active:rotate-180 transition-all duration-500"
            title="Обновить"
          >
            <RotateCw class="w-4 h-4" />
          </button>

          <button
            @click="logout"
            class="text-slate-400 hover:text-slate-700 transition-colors"
            title="Выйти"
          >
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </header>

      <main class="p-2">
        <div v-if="appLoading" class="flex justify-center py-10">
          <RotateCw class="w-6 h-6 animate-spin text-blue-500" />
        </div>

        <div v-else-if="activeTab === 'schedule'">
          <ScheduleView
            :userRole="userRole"
            :currentUser="currentUser"
            :displayName="userName"
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
        :style="{ bottom: 'calc(85px + env(safe-area-inset-bottom))' }"
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
        class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 flex justify-around z-[100] pb-safe"
      >
        <button
          @click="activeTab = 'main'"
          :class="activeTab === 'main' ? 'text-blue-600' : 'text-slate-300'"
          class="flex flex-col items-center flex-1 py-3 transition-colors"
        >
          <LayoutGrid class="w-5 h-5" />
          <span class="text-[9px] font-black uppercase mt-1">Смена</span>
        </button>

        <button
          @click="activeTab = 'schedule'"
          :class="activeTab === 'schedule' ? 'text-blue-600' : 'text-slate-300'"
          class="flex flex-col items-center flex-1 py-3 transition-colors"
        >
          <CalendarClock class="w-5 h-5" />
          <span class="text-[9px] font-black uppercase mt-1">График</span>
        </button>

        <button
          v-if="userRole === 'admin'"
          @click="activeTab = 'archive'"
          :class="activeTab === 'archive' ? 'text-blue-600' : 'text-slate-300'"
          class="flex flex-col items-center flex-1 py-3 transition-colors"
        >
          <History class="w-5 h-5" />
          <span class="text-[9px] font-black uppercase mt-1">Архив</span>
        </button>
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
}

body {
  background-color: #f8fafc;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  touch-action: pan-x pan-y;
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.pb-24 {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom));
}
</style>
