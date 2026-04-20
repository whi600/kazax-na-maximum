<script setup>
import { MessageCircle, Users } from 'lucide-vue-next'
import {
  conversationInitial,
  conversationSubtitle,
  formatConversationTime,
  lastMessagePreview,
} from '../messengerUtils'

defineProps({
  conversations: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['open'])
</script>

<template>
  <section class="rounded-lg border border-slate-100 bg-white shadow-sm">
    <div v-if="conversations.length" class="divide-y divide-slate-100">
      <button
        v-for="conversation in conversations"
        :key="conversation.id"
        type="button"
        class="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-slate-50"
        @click="emit('open', conversation)"
      >
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[13px] font-black text-white"
          :class="conversation.type === 'group' ? 'bg-blue-600' : 'bg-slate-900'"
        >
          <Users v-if="conversation.type === 'group'" class="h-5 w-5" />
          <span v-else>{{ conversationInitial(conversation) }}</span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center justify-between gap-2">
            <span class="min-w-0 flex items-center gap-1.5">
              <span class="truncate text-[12px] font-black text-slate-800">
                {{ conversation.displayTitle }}
              </span>
              <span
                v-if="conversation.type === 'group'"
                class="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-blue-600"
              >
                Группа
              </span>
            </span>
            <span class="shrink-0 text-[8px] font-black uppercase text-slate-300">
              {{ formatConversationTime(conversation.updated_at) }}
            </span>
          </span>
          <span class="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span class="shrink-0 text-[9px] font-black uppercase text-slate-300">
              {{ conversationSubtitle(conversation) }}
            </span>
            <span class="min-w-0 truncate text-[10px] font-bold text-slate-400">
              {{ lastMessagePreview(conversation) }}
            </span>
          </span>
        </span>
      </button>
    </div>

    <div v-else-if="!loading" class="flex min-h-[48vh] items-center justify-center px-6 py-10 text-center">
      <div class="opacity-30">
        <MessageCircle class="mx-auto mb-2 h-10 w-10" />
        <p class="text-[10px] font-black uppercase">Чатов пока нет</p>
      </div>
    </div>
  </section>
</template>
