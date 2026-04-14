<script setup>
import { ref, computed } from 'vue'
import { LogIn, UserRoundPlus, Mail, KeyRound, IdCard } from 'lucide-vue-next'

const props = defineProps({
  loading: { type: Boolean, default: false },
  message: { type: String, default: '' },
})

const emit = defineEmits(['sign-in', 'sign-up'])

const mode = ref('signin')
const email = ref('')
const password = ref('')
const displayName = ref('')

const canSubmit = computed(() => {
  if (!email.value || !password.value) return false
  if (mode.value === 'signup' && !displayName.value.trim()) return false
  return true
})

const submit = () => {
  if (!canSubmit.value || props.loading) return

  if (mode.value === 'signin') {
    emit('sign-in', {
      email: email.value.trim(),
      password: password.value,
    })
    return
  }

  emit('sign-up', {
    email: email.value.trim(),
    password: password.value,
    displayName: displayName.value.trim(),
  })
}
</script>

<template>
  <section class="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white flex items-center justify-center p-4">
    <div class="w-full max-w-sm bg-white rounded-3xl p-5 shadow-xl border border-blue-100/70">
      <div class="mb-5 text-center">
        <h1 class="text-2xl font-black italic tracking-tight text-slate-900 uppercase">Кофетерий</h1>
        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
          Вход в систему
        </p>
      </div>

      <div class="flex p-1 rounded-2xl bg-slate-100 mb-4">
        <button
          @click="mode = 'signin'"
          class="flex-1 py-2 rounded-xl text-[11px] font-black uppercase transition-colors"
          :class="mode === 'signin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'"
        >
          Войти
        </button>
        <button
          @click="mode = 'signup'"
          class="flex-1 py-2 rounded-xl text-[11px] font-black uppercase transition-colors"
          :class="mode === 'signup' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'"
        >
          Регистрация
        </button>
      </div>

      <div class="space-y-3">
        <label v-if="mode === 'signup'" class="block">
          <span class="text-[10px] font-black uppercase text-slate-400">Имя</span>
          <div class="relative mt-1">
            <IdCard class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              v-model="displayName"
              type="text"
              placeholder="Ваше имя"
              autocomplete="name"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
            />
          </div>
        </label>

        <label class="block">
          <span class="text-[10px] font-black uppercase text-slate-400">Email</span>
          <div class="relative mt-1">
            <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              v-model="email"
              type="email"
              placeholder="name@company.com"
              autocomplete="email"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
            />
          </div>
        </label>

        <label class="block">
          <span class="text-[10px] font-black uppercase text-slate-400">Пароль</span>
          <div class="relative mt-1">
            <KeyRound class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              v-model="password"
              type="password"
              placeholder="Минимум 6 символов"
              autocomplete="current-password"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
              @keydown.enter="submit"
            />
          </div>
        </label>
      </div>

      <button
        @click="submit"
        :disabled="!canSubmit || loading"
        class="w-full mt-5 rounded-2xl py-3 text-[11px] font-black uppercase text-white flex items-center justify-center gap-2 transition-all"
        :class="
          !canSubmit || loading
            ? 'bg-slate-300 cursor-not-allowed'
            : 'bg-blue-600 active:scale-95 shadow-lg shadow-blue-200'
        "
      >
        <span
          v-if="loading"
          class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
        />
        <component v-else :is="mode === 'signin' ? LogIn : UserRoundPlus" class="w-4 h-4" />
        {{ mode === 'signin' ? 'Войти' : 'Создать аккаунт' }}
      </button>

      <p v-if="message" class="mt-4 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
        {{ message }}
      </p>
    </div>
  </section>
</template>
