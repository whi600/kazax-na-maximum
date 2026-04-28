<script setup>
import {
  BellRing,
  LogOut,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-vue-next'

defineProps({
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  canManageProducts: { type: Boolean, default: false },
  canManageRoles: { type: Boolean, default: false },
})

const emit = defineEmits(['open-assortment', 'open-notifications', 'open-roles', 'logout'])
</script>

<template>
  <section class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        <UserRound class="w-6 h-6" />
      </div>
      <div>
        <h2 class="text-lg font-black text-slate-800">{{ userName }}</h2>
        <p class="text-[10px] font-bold text-slate-400">{{ email }}</p>
      </div>
    </div>

    <div class="space-y-2 mb-5">
      <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-3">
        <span class="text-[10px] font-black text-slate-400 uppercase">Роль</span>
        <span class="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100 flex items-center gap-1">
          <ShieldCheck class="w-3 h-3" />
          {{ roleLabel }}
        </span>
      </div>
    </div>

    <div class="grid gap-2 mb-5">
      <button
        type="button"
        @click="emit('open-notifications')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <BellRing class="w-4 h-4" />
        Уведомления
      </button>

      <button
        v-if="canManageProducts"
        type="button"
        @click="emit('open-assortment')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <Pencil class="w-4 h-4" />
        Ассортимент
      </button>

      <button
        v-if="canManageRoles"
        type="button"
        @click="emit('open-roles')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <SlidersHorizontal class="w-4 h-4" />
        Роли и права
      </button>
    </div>

    <button
      type="button"
      @click="emit('logout')"
      class="w-full bg-red-500 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
    >
      <LogOut class="w-4 h-4" />
      Выйти
    </button>
  </section>
</template>
