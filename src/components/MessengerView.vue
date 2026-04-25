<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  RotateCw,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-vue-next'
import { messengerApi } from '../api'
import {
  conversationInitial,
  conversationSubtitle,
  filterUsersByQuery,
  formatBytes,
  formatMessageTime,
  isImageAttachment,
  sortConversations,
  sortUsersByName,
  userInitial,
} from '../messengerUtils'
import { roleLabels } from '../permissions'
import MessengerConversationList from './MessengerConversationList.vue'
import MessengerPeopleList from './MessengerPeopleList.vue'

const props = defineProps({
  currentUser: { type: Object, default: null },
  peopleSearchQuery: { type: String, default: '' },
})
const emit = defineEmits(['person-selected', 'chat-open-change'])

const users = ref([])
const conversations = ref([])
const messages = ref([])
const activeConversationId = ref(null)
const chatOpen = ref(false)
const draft = ref('')
const replyingToMessage = ref(null)
const selectedFile = ref(null)
const fileInput = ref(null)
const messageInput = ref(null)
const messageList = ref(null)
const peoplePanelOpen = ref(false)
const groupSheetOpen = ref(false)
const groupMode = ref('create')
const groupTitle = ref('')
const groupSearchQuery = ref('')
const selectedGroupMemberIds = ref([])
const groupBusy = ref(false)
const loading = ref(true)
const messagesLoading = ref(false)
const sending = ref(false)
const errorMessage = ref('')
const startingUserId = ref(null)
const touchStart = ref({ x: 0, y: 0 })
const composerTouchStart = ref({ x: 0, y: 0 })
const messagePointerStart = ref({ x: 0, y: 0, moved: false, eligible: false })
const messageReplyGesture = ref({ id: null, startX: 0, startY: 0, dragX: 0, active: false })
const composerDragY = ref(0)
const composerDragging = ref(false)
const composerGestureActive = ref(false)
const chatDragX = ref(0)
const chatDragging = ref(false)
const chatGestureActive = ref(false)
const chatViewportHeight = ref('100dvh')
const chatViewportTop = ref('0px')
const standalonePwa = ref(false)
let keyboardBlurTimer = null
let refreshTimer = null

const activeConversation = computed(() =>
  conversations.value.find((item) => item.id === activeConversationId.value),
)

const sortedUsers = computed(() => sortUsersByName(users.value))

const visiblePeopleUsers = computed(() => {
  return filterUsersByQuery(sortedUsers.value, props.peopleSearchQuery)
})

const hasDraft = computed(
  () => draft.value.trim().length > 0 || Boolean(selectedFile.value),
)

const chatShellStyle = computed(() => ({
  top: chatViewportTop.value,
  height: chatViewportHeight.value,
  transform: chatDragX.value ? `translate3d(${chatDragX.value}px, 0, 0)` : '',
  opacity: chatDragX.value ? String(Math.max(0.72, 1 - chatDragX.value / 700)) : '',
}))

const composerStyle = computed(() => ({
  transform: composerDragY.value ? `translate3d(0, ${composerDragY.value}px, 0)` : '',
}))

const groupSearchUsers = computed(() => {
  const existingMemberIds = new Set(
    groupMode.value === 'add'
      ? activeConversation.value?.members?.map((member) => member.id) || []
      : [],
  )
  const query = groupSearchQuery.value.trim().toLowerCase()

  return users.value.filter((user) => {
    if (existingMemberIds.has(user.id)) return false
    if (!query) return true
    const name = String(user.name || '').toLowerCase()
    const email = String(user.email || '').toLowerCase()
    return name.includes(query) || email.includes(query)
  })
})

const selectedGroupUsers = computed(() => {
  const selected = new Set(selectedGroupMemberIds.value)
  return users.value.filter((user) => selected.has(user.id))
})

const groupActionTitle = computed(() =>
  groupMode.value === 'add' ? 'Добавить участников' : 'Новая группа',
)

const canSubmitGroup = computed(() => {
  if (groupBusy.value || selectedGroupMemberIds.value.length === 0) return false
  if (groupMode.value === 'create') return groupTitle.value.trim().length > 0
  return Boolean(activeConversation.value)
})

const isMine = (message) => message.sender_user_id === props.currentUser?.id

const messageSenderName = (message) => {
  if (!message) return 'Пользователь'
  if (message.sender_user_id === props.currentUser?.id) return 'Вы'
  return message.sender_name || 'Пользователь'
}

const messagePreview = (message) => {
  if (!message) return ''
  const text = String(message.body || '').replace(/\s+/g, ' ').trim()
  if (text) return text
  return message.attachments?.length || message.has_attachment ? 'Файл или фото' : 'Сообщение'
}

const replyToPreviewText = (reply) => {
  if (!reply) return ''
  const text = String(reply.body || '').replace(/\s+/g, ' ').trim()
  return text || (reply.has_attachment ? 'Файл или фото' : 'Сообщение')
}

const messageDragStyle = (message) => {
  const gesture = messageReplyGesture.value
  if (gesture.id !== message.id || !gesture.dragX) return {}
  return { transform: `translate3d(${gesture.dragX}px, 0, 0)` }
}

const messageDragClass = (message) => ({
  'is-dragging': messageReplyGesture.value.id === message.id && messageReplyGesture.value.active,
})

const upsertConversation = (conversation) => {
  if (!conversation) return
  conversations.value = sortConversations([
    conversation,
    ...conversations.value.filter((item) => item.id !== conversation.id),
  ])
}

const scrollToBottom = async () => {
  await nextTick()
  if (!messageList.value) return
  messageList.value.scrollTop = messageList.value.scrollHeight
}

const isMessageListNearBottom = () => {
  const list = messageList.value
  if (!list) return true
  return list.scrollHeight - list.scrollTop - list.clientHeight < 80
}

const focusMessageInput = async () => {
  await nextTick()
  messageInput.value?.focus?.({ preventScroll: true })
}

const blurMessageInput = () => {
  if (document.activeElement !== messageInput.value) return
  messageInput.value?.blur()
}

const clearKeyboardBlurTimer = () => {
  if (!keyboardBlurTimer) return
  clearTimeout(keyboardBlurTimer)
  keyboardBlurTimer = null
}

const scheduleKeyboardBlur = () => {
  clearKeyboardBlurTimer()
  keyboardBlurTimer = setTimeout(() => {
    keyboardBlurTimer = null
    blurMessageInput()
  }, 180)
}

const detectStandalonePwa = () => {
  standalonePwa.value =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    window.navigator?.standalone === true
}

const updateChatViewportHeight = () => {
  const shouldKeepBottom = chatOpen.value && isMessageListNearBottom()
  const viewport = window.visualViewport
  const height = viewport?.height || window.innerHeight
  const offsetTop = viewport?.offsetTop || 0
  chatViewportHeight.value = `${Math.round(height)}px`
  chatViewportTop.value = `${Math.round(offsetTop)}px`

  if (shouldKeepBottom) {
    requestAnimationFrame(() => {
      scrollToBottom()
    })
  }
}

const adjustMessageInputHeight = async () => {
  const shouldKeepBottom = isMessageListNearBottom()
  await nextTick()
  const input = messageInput.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  if (shouldKeepBottom) await scrollToBottom()
}

const clearFile = () => {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const loadUsers = async () => {
  const response = await messengerApi.users()
  users.value = response.users || []
}

const loadMessages = async (conversationId, { silent = false } = {}) => {
  if (!conversationId) return
  if (!silent) messagesLoading.value = true
  const shouldKeepBottom = !silent || isMessageListNearBottom()
  try {
    const response = await messengerApi.messages(conversationId)
    if (activeConversationId.value === conversationId) {
      messages.value = response.messages || []
      upsertConversation(response.conversation)
      if (shouldKeepBottom) await scrollToBottom()
    }
  } catch (error) {
    if (!silent) errorMessage.value = error?.message || 'Не удалось загрузить сообщения'
  } finally {
    if (!silent) messagesLoading.value = false
  }
}

const openConversation = async (conversation) => {
  if (!conversation) return
  activeConversationId.value = conversation.id
  chatOpen.value = true
  emit('chat-open-change', true)
  messages.value = []
  await loadMessages(conversation.id)
}

const closeConversation = () => {
  chatOpen.value = false
  emit('chat-open-change', false)
  draft.value = ''
  replyingToMessage.value = null
  clearFile()
  blurMessageInput()
  clearKeyboardBlurTimer()
  chatDragX.value = 0
  composerDragY.value = 0
}

const togglePeoplePanel = () => {
  peoplePanelOpen.value = !peoplePanelOpen.value
}

const closePeoplePanel = () => {
  peoplePanelOpen.value = false
}

const openPeoplePanel = () => {
  peoplePanelOpen.value = true
}

const openGroupSheet = (mode = 'create') => {
  groupMode.value = mode
  groupSheetOpen.value = true
  peoplePanelOpen.value = false
  groupSearchQuery.value = ''
  selectedGroupMemberIds.value = []
  if (mode === 'create') {
    groupTitle.value = ''
  }
}

const closeGroupSheet = (force = false) => {
  if (groupBusy.value && !force) return
  groupSheetOpen.value = false
  groupSearchQuery.value = ''
  selectedGroupMemberIds.value = []
  groupTitle.value = ''
  groupMode.value = 'create'
}

const toggleGroupMember = (userId) => {
  if (selectedGroupMemberIds.value.includes(userId)) {
    selectedGroupMemberIds.value = selectedGroupMemberIds.value.filter((id) => id !== userId)
    return
  }

  selectedGroupMemberIds.value = [...selectedGroupMemberIds.value, userId]
}

const submitGroup = async () => {
  if (!canSubmitGroup.value) return
  groupBusy.value = true
  errorMessage.value = ''

  try {
    const response =
      groupMode.value === 'add'
        ? await messengerApi.addMembers(
            activeConversation.value.id,
            selectedGroupMemberIds.value,
          )
        : await messengerApi.createGroup({
            title: groupTitle.value.trim(),
            memberIds: selectedGroupMemberIds.value,
          })

    upsertConversation(response.conversation)
    closeGroupSheet(true)
    await openConversation(response.conversation)
  } catch (error) {
    errorMessage.value =
      error?.message ||
      (groupMode.value === 'add'
        ? 'Не удалось добавить участников'
        : 'Не удалось создать группу')
  } finally {
    groupBusy.value = false
  }
}

const loadConversations = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  try {
    const response = await messengerApi.conversations()
    conversations.value = sortConversations(response.conversations || [])

    if (
      activeConversationId.value &&
      !conversations.value.some((item) => item.id === activeConversationId.value)
    ) {
      activeConversationId.value = null
      chatOpen.value = false
      messages.value = []
    }
  } catch (error) {
    if (!silent) errorMessage.value = error?.message || 'Не удалось загрузить диалоги'
  } finally {
    if (!silent) loading.value = false
  }
}

const startConversation = async (user) => {
  if (!user || startingUserId.value) return
  startingUserId.value = user.id
  errorMessage.value = ''
  try {
    const response = await messengerApi.startDirect(user.id)
    upsertConversation(response.conversation)
    emit('person-selected')
    closePeoplePanel()
    await openConversation(response.conversation)
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось открыть диалог'
  } finally {
    startingUserId.value = null
  }
}

const onFileChange = (event) => {
  const file = event.target.files?.[0] || null
  errorMessage.value = ''

  if (file && String(file.type || '').startsWith('video/')) {
    errorMessage.value = 'Видео пока не отправляем'
    event.target.value = ''
    selectedFile.value = null
    return
  }

  selectedFile.value = file
}

const sendMessage = async () => {
  if (!activeConversation.value || sending.value || !hasDraft.value) return
  sending.value = true
  errorMessage.value = ''

  try {
    const response = await messengerApi.sendMessage(activeConversation.value.id, {
      body: draft.value.trim(),
      file: selectedFile.value,
      replyToMessageId: replyingToMessage.value?.id || null,
    })
    messages.value = [...messages.value, response.message]
    upsertConversation(response.conversation)
    draft.value = ''
    replyingToMessage.value = null
    clearFile()
    await adjustMessageInputHeight()
    await scrollToBottom()
    await focusMessageInput()
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось отправить сообщение'
  } finally {
    sending.value = false
  }
}

const startReplyToMessage = async (message) => {
  replyingToMessage.value = message
  await focusMessageInput()
}

const clearReply = () => {
  replyingToMessage.value = null
}

const resetMessageReplyGesture = () => {
  messageReplyGesture.value = { id: null, startX: 0, startY: 0, dragX: 0, active: false }
}

const resetComposerGesture = () => {
  composerGestureActive.value = false
  composerDragging.value = false
  composerDragY.value = 0
}

const resetChatGesture = () => {
  chatGestureActive.value = false
  chatDragging.value = false
  chatDragX.value = 0
}

const onChatTouchStart = (event) => {
  if (!standalonePwa.value) return
  const touch = event.touches?.[0]
  if (!touch) return
  const startedAtLeftEdge = touch.clientX <= 34
  if (!startedAtLeftEdge) return
  if (event.target?.closest?.('.messenger-composer, .messenger-message-row, a, button, textarea')) return

  clearKeyboardBlurTimer()
  chatGestureActive.value = true
  chatDragging.value = false
  touchStart.value = { x: touch.clientX, y: touch.clientY }
}

const onChatTouchMove = (event) => {
  if (!chatGestureActive.value) return
  const touch = event.touches?.[0]
  if (!touch) return

  const deltaX = touch.clientX - touchStart.value.x
  const deltaY = touch.clientY - touchStart.value.y
  if (deltaX < 0 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return

  event.preventDefault()
  chatDragging.value = true
  chatDragX.value = Math.min(deltaX, window.innerWidth * 0.88)
}

const onChatTouchEnd = (event) => {
  if (!chatGestureActive.value) return
  const shouldClose = chatDragX.value > Math.min(140, window.innerWidth * 0.32)

  if (shouldClose) {
    chatDragging.value = false
    chatDragX.value = window.innerWidth
    setTimeout(() => {
      closeConversation()
      resetChatGesture()
    }, 170)
    return
  }

  resetChatGesture()
}

const onMessagesPointerDown = (event) => {
  clearKeyboardBlurTimer()
  const interactive = event.target?.closest?.(
    'a, button, input, textarea, select, .messenger-message-bubble',
  )
  messagePointerStart.value = {
    x: event.clientX,
    y: event.clientY,
    moved: false,
    eligible: !interactive,
  }
}

const onMessagesPointerMove = (event) => {
  const pointer = messagePointerStart.value
  if (!pointer.eligible) return
  const moved =
    Math.abs(event.clientX - pointer.x) > 8 ||
    Math.abs(event.clientY - pointer.y) > 8
  if (!moved) return
  messagePointerStart.value = { ...pointer, moved: true }
  clearKeyboardBlurTimer()
}

const onMessagesPointerUp = () => {
  const pointer = messagePointerStart.value
  if (pointer.eligible && !pointer.moved) scheduleKeyboardBlur()
  messagePointerStart.value = { x: 0, y: 0, moved: false, eligible: false }
}

const onMessageTouchStart = (event, message) => {
  const touch = event.touches?.[0]
  if (!touch) return
  if (event.target?.closest?.('a, button')) return
  clearKeyboardBlurTimer()
  messageReplyGesture.value = {
    id: message.id,
    startX: touch.clientX,
    startY: touch.clientY,
    dragX: 0,
    active: false,
  }
}

const onMessageTouchMove = (event, message) => {
  const gesture = messageReplyGesture.value
  if (gesture.id !== message.id) return
  const touch = event.touches?.[0]
  if (!touch) return

  const deltaX = touch.clientX - gesture.startX
  const deltaY = touch.clientY - gesture.startY
  if (deltaX > 0 || Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return

  event.preventDefault()
  const dragX = Math.max(deltaX * 0.72, -86)
  messageReplyGesture.value = { ...gesture, dragX, active: true }
}

const onMessageTouchEnd = (message) => {
  const gesture = messageReplyGesture.value
  if (gesture.id !== message.id) return
  const shouldReply = gesture.dragX < -46

  if (shouldReply) {
    messageReplyGesture.value = { ...gesture, dragX: -58, active: false }
    startReplyToMessage(message)
    setTimeout(resetMessageReplyGesture, 150)
    return
  }

  resetMessageReplyGesture()
}

const onComposerTouchStart = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  clearKeyboardBlurTimer()
  composerGestureActive.value = true
  composerDragging.value = false
  composerTouchStart.value = { x: touch.clientX, y: touch.clientY }
}

const onComposerTouchMove = (event) => {
  if (!composerGestureActive.value) return
  const touch = event.touches?.[0]
  if (!touch) return

  const deltaX = touch.clientX - composerTouchStart.value.x
  const deltaY = touch.clientY - composerTouchStart.value.y
  if (deltaY < 0 || Math.abs(deltaY) < Math.abs(deltaX) * 1.15) return

  event.preventDefault()
  composerDragging.value = true
  composerDragY.value = Math.min(deltaY * 0.72, 92)
}

const onComposerTouchEnd = (event) => {
  if (!composerGestureActive.value) return
  const shouldBlur = composerDragY.value > 42
  if (shouldBlur) blurMessageInput()
  resetComposerGesture()
}

onMounted(async () => {
  detectStandalonePwa()
  updateChatViewportHeight()
  window.visualViewport?.addEventListener('resize', updateChatViewportHeight)
  window.visualViewport?.addEventListener('scroll', updateChatViewportHeight)
  window.addEventListener('resize', updateChatViewportHeight)

  loading.value = true
  try {
    await Promise.all([loadUsers(), loadConversations()])
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось загрузить сообщения'
  } finally {
    loading.value = false
  }

  refreshTimer = setInterval(() => {
    loadConversations({ silent: true })
    if (chatOpen.value && activeConversationId.value) {
      loadMessages(activeConversationId.value, { silent: true })
    }
  }, 10000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  clearKeyboardBlurTimer()
  window.visualViewport?.removeEventListener('resize', updateChatViewportHeight)
  window.visualViewport?.removeEventListener('scroll', updateChatViewportHeight)
  window.removeEventListener('resize', updateChatViewportHeight)
  document.documentElement.classList.remove('messenger-chat-lock')
  emit('chat-open-change', false)
})

watch(chatOpen, (open) => {
  document.documentElement.classList.toggle('messenger-chat-lock', open)
  if (open) {
    updateChatViewportHeight()
  }
})

watch(draft, () => {
  adjustMessageInputHeight()
})

defineExpose({
  openGroupSheet,
  togglePeoplePanel,
  closePeoplePanel,
  openPeoplePanel,
  closeConversation,
})
</script>

<template>
  <section class="space-y-3 pb-4">
    <div
      v-if="errorMessage"
      class="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-500"
    >
      {{ errorMessage }}
    </div>

    <Transition name="people-panel" mode="out-in">
      <MessengerPeopleList
        v-if="peoplePanelOpen"
        key="people"
        :users="visiblePeopleUsers"
        :starting-user-id="startingUserId"
        @select="startConversation"
      />

      <MessengerConversationList
        v-else
        key="chats"
        :conversations="conversations"
        :loading="loading"
        @open="openConversation"
      />
    </Transition>

    <Transition name="chat-slide">
      <section
        v-if="chatOpen && activeConversation"
        class="messenger-chat-shell fixed left-0 right-0 z-[180] flex min-h-0 flex-col bg-slate-50 text-slate-800"
        :class="{ 'is-dragging': chatDragging }"
        :style="chatShellStyle"
        @click.stop
        @touchstart="onChatTouchStart"
        @touchmove="onChatTouchMove"
        @touchend="onChatTouchEnd"
        @touchcancel="resetChatGesture"
      >
        <header class="shrink-0 border-b border-slate-100 bg-white/95 px-3 py-3 pt-safe shadow-sm backdrop-blur-md">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95"
              aria-label="Назад к чатам"
              @click="closeConversation"
            >
              <ArrowLeft class="h-5 w-5" />
            </button>

            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[13px] font-black text-white"
              :class="activeConversation.type === 'group' ? 'bg-blue-600' : 'bg-slate-900'"
            >
              <Users v-if="activeConversation.type === 'group'" class="h-5 w-5" />
              <span v-else>{{ conversationInitial(activeConversation) }}</span>
            </span>

            <div class="min-w-0 flex-1">
              <h2 class="truncate text-[13px] font-black uppercase text-slate-800">
                {{ activeConversation.displayTitle }}
              </h2>
              <p class="text-[9px] font-black uppercase text-slate-400">
                {{ conversationSubtitle(activeConversation) }}
              </p>
            </div>

            <RotateCw v-if="messagesLoading" class="h-4 w-4 shrink-0 animate-spin text-blue-600" />

            <button
              v-if="activeConversation.type === 'group'"
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95"
              aria-label="Добавить участников"
              @click="openGroupSheet('add')"
            >
              <UserPlus class="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          ref="messageList"
          class="messenger-chat-messages flex-1 overflow-y-auto px-3 py-3"
          @pointerdown="onMessagesPointerDown"
          @pointermove="onMessagesPointerMove"
          @pointerup="onMessagesPointerUp"
          @pointercancel="clearKeyboardBlurTimer"
        >
          <div
            v-if="messages.length === 0 && !messagesLoading"
            class="flex h-full min-h-[320px] items-center justify-center text-center"
          >
            <div class="opacity-30">
              <MessageCircle class="mx-auto mb-2 h-10 w-10" />
              <p class="text-[10px] font-black uppercase">Сообщений пока нет</p>
            </div>
          </div>

          <div v-else class="messenger-message-stack">
            <div
              v-for="message in messages"
              :key="message.id"
              class="messenger-message-row flex"
              :class="isMine(message) ? 'justify-end' : 'justify-start'"
              @touchstart.passive="onMessageTouchStart($event, message)"
              @touchmove="onMessageTouchMove($event, message)"
              @touchend="onMessageTouchEnd(message)"
              @touchcancel="resetMessageReplyGesture"
            >
              <div
                class="messenger-message-bubble relative max-w-[82%] rounded-lg px-3 py-2 shadow-sm"
                :class="[
                  messageDragClass(message),
                  isMine(message)
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-100 bg-white text-slate-800',
                ]"
                :style="messageDragStyle(message)"
              >
                <span
                  class="messenger-reply-pull pointer-events-none absolute -right-8 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-blue-50 text-blue-600"
                >
                  <CornerUpLeft class="h-4 w-4" />
                </span>

                <div
                  v-if="message.reply_to"
                  class="mb-1.5 rounded-md border-l-2 px-2 py-1"
                  :class="
                    isMine(message)
                      ? 'border-white/50 bg-white/10'
                      : 'border-blue-500 bg-blue-50'
                  "
                >
                  <p
                    class="truncate text-[8px] font-black uppercase"
                    :class="isMine(message) ? 'text-blue-100' : 'text-blue-600'"
                  >
                    {{ message.reply_to.sender_name }}
                  </p>
                  <p
                    class="truncate text-[10px] font-bold"
                    :class="isMine(message) ? 'text-white/90' : 'text-slate-600'"
                  >
                    {{ replyToPreviewText(message.reply_to) }}
                  </p>
                </div>

                <p
                  v-if="!isMine(message)"
                  class="mb-1 text-[8px] font-black uppercase text-slate-400"
                >
                  {{ message.sender_name }}
                </p>

                <p
                  v-if="message.body"
                  class="whitespace-pre-wrap break-words text-[12px] font-bold leading-snug"
                >
                  {{ message.body }}
                </p>

                <div v-if="message.attachments?.length" class="mt-2 space-y-1.5">
                  <a
                    v-for="attachment in message.attachments"
                    :key="attachment.id"
                    :href="attachment.url"
                    target="_blank"
                    rel="noreferrer"
                    class="block overflow-hidden rounded-lg border text-left"
                    :class="isMine(message) ? 'border-white/20 bg-white/10' : 'border-slate-100 bg-slate-50'"
                  >
                    <img
                      v-if="isImageAttachment(attachment)"
                      :src="attachment.url"
                      :alt="attachment.original_name"
                      class="max-h-52 w-full object-cover"
                    />
                    <span class="flex items-center gap-2 px-2 py-2">
                      <ImageIcon v-if="isImageAttachment(attachment)" class="h-4 w-4 shrink-0" />
                      <FileText v-else class="h-4 w-4 shrink-0" />
                      <span class="min-w-0">
                        <span class="block truncate text-[10px] font-black">
                          {{ attachment.original_name }}
                        </span>
                        <span
                          class="block text-[8px] font-black uppercase"
                          :class="isMine(message) ? 'text-blue-100' : 'text-slate-400'"
                        >
                          {{ formatBytes(attachment.size) }}
                        </span>
                      </span>
                    </span>
                  </a>
                </div>

                <p
                  class="mt-1 text-right text-[8px] font-black uppercase"
                  :class="isMine(message) ? 'text-blue-100' : 'text-slate-300'"
                >
                  {{ formatMessageTime(message.created_at) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form
          class="messenger-composer shrink-0 border-t border-slate-100 bg-white"
          :class="{ 'is-dragging': composerDragging }"
          :style="composerStyle"
          @submit.prevent="sendMessage"
          @touchstart="onComposerTouchStart"
          @touchmove="onComposerTouchMove"
          @touchend="onComposerTouchEnd"
          @touchcancel="resetComposerGesture"
        >
          <div
            v-if="replyingToMessage"
            class="mb-2 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"
          >
            <CornerUpLeft class="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[9px] font-black uppercase text-blue-600">
                Ответ {{ messageSenderName(replyingToMessage) }}
              </p>
              <p class="truncate text-[10px] font-bold text-slate-600">
                {{ messagePreview(replyingToMessage) }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-md p-1 text-slate-400 active:scale-95"
              aria-label="Отменить ответ"
              @click="clearReply"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div
            v-if="selectedFile"
            class="mb-2 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2"
          >
            <Paperclip class="h-4 w-4 shrink-0 text-blue-600" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[10px] font-black text-slate-800">
                {{ selectedFile.name }}
              </p>
              <p class="text-[8px] font-black uppercase text-slate-400">
                {{ formatBytes(selectedFile.size) }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-md p-1 text-slate-400 active:scale-95"
              aria-label="Убрать файл"
              @click="clearFile"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex items-center gap-2">
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.doc,.docx,.xls,.xlsx"
              @change="onFileChange"
            />
            <button
              type="button"
              @click="fileInput?.click()"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:scale-95 transition-all"
              aria-label="Прикрепить файл"
            >
              <Paperclip class="h-5 w-5" />
            </button>
            <textarea
              ref="messageInput"
              v-model="draft"
              :disabled="sending"
              rows="1"
              enterkeyhint="enter"
              placeholder="Сообщение"
              class="messenger-message-input min-w-0 flex-1 resize-none rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] font-bold leading-5 text-slate-800 placeholder:text-slate-300 disabled:opacity-50"
            ></textarea>
            <button
              type="button"
              :disabled="sending || !hasDraft"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-100 disabled:opacity-40 active:scale-95 transition-all"
              aria-label="Отправить"
              @pointerdown.prevent="sendMessage"
            >
              <RotateCw v-if="sending" class="h-5 w-5 animate-spin" />
              <Send v-else class="h-5 w-5" />
            </button>
          </div>
        </form>
      </section>
    </Transition>

    <Transition name="sheet-fade">
      <div
        v-if="groupSheetOpen"
        class="fixed inset-0 z-[220] flex items-end bg-slate-950/45 px-2 pb-2 pt-safe backdrop-blur-sm"
        @click.self="closeGroupSheet"
      >
        <section class="max-h-[86vh] w-full overflow-hidden rounded-lg bg-white shadow-2xl">
          <header class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 class="text-[13px] font-black uppercase text-slate-800">
                {{ groupActionTitle }}
              </h2>
              <p class="text-[9px] font-black uppercase text-slate-400">
                {{ groupMode === 'add' ? activeConversation?.displayTitle : 'Название и участники' }}
              </p>
            </div>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:scale-95"
              aria-label="Закрыть"
              @click="closeGroupSheet"
            >
              <X class="h-4 w-4" />
            </button>
          </header>

          <div class="space-y-3 overflow-y-auto p-4">
            <input
              v-if="groupMode === 'create'"
              v-model="groupTitle"
              type="text"
              maxlength="80"
              placeholder="Название группы"
              class="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 px-3 text-[12px] font-bold text-slate-800 placeholder:text-slate-300"
            />

            <div class="relative">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <input
                v-model="groupSearchQuery"
                type="text"
                placeholder="Найти участника"
                class="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 pl-9 pr-3 text-[12px] font-bold text-slate-800 placeholder:text-slate-300"
              />
            </div>

            <div v-if="selectedGroupUsers.length" class="flex flex-wrap gap-1.5">
              <button
                v-for="user in selectedGroupUsers"
                :key="user.id"
                type="button"
                class="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-600"
                @click="toggleGroupMember(user.id)"
              >
                {{ user.name }}
                <X class="h-3 w-3" />
              </button>
            </div>

            <div class="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
              <button
                v-for="user in groupSearchUsers"
                :key="user.id"
                type="button"
                class="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 active:bg-slate-50"
                @click="toggleGroupMember(user.id)"
              >
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-black"
                  :class="
                    selectedGroupMemberIds.includes(user.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-600'
                  "
                >
                  {{ userInitial(user) }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[11px] font-black text-slate-800">
                    {{ user.name }}
                  </span>
                  <span class="block truncate text-[9px] font-black uppercase text-slate-400">
                    {{ roleLabels[user.role] || user.role }}
                  </span>
                </span>
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                  :class="
                    selectedGroupMemberIds.includes(user.id)
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-200 bg-white'
                  "
                >
                  <span
                    v-if="selectedGroupMemberIds.includes(user.id)"
                    class="h-2 w-2 rounded-sm bg-white"
                  />
                </span>
              </button>

              <p
                v-if="groupSearchUsers.length === 0"
                class="px-3 py-4 text-center text-[10px] font-black uppercase text-slate-300"
              >
                Нет доступных участников
              </p>
            </div>

            <button
              type="button"
              :disabled="!canSubmitGroup"
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-[11px] font-black uppercase text-white disabled:opacity-40 active:scale-95 transition-all"
              @click="submitGroup"
            >
              <RotateCw v-if="groupBusy" class="h-4 w-4 animate-spin" />
              <Users v-else class="h-4 w-4" />
              {{ groupMode === 'add' ? 'Добавить' : 'Создать группу' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.messenger-chat-shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;
  will-change: transform;
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.messenger-chat-shell.is-dragging {
  transition: none;
}

.messenger-chat-messages {
  min-height: 0;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.messenger-message-stack {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.5rem;
}

.messenger-message-bubble {
  will-change: transform;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.messenger-message-bubble.is-dragging {
  transition: none;
}

.messenger-reply-pull {
  opacity: 0;
  transform: translate3d(8px, -50%, 0) scale(0.85);
  transition:
    opacity 150ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.messenger-message-bubble.is-dragging .messenger-reply-pull {
  opacity: 1;
  transform: translate3d(0, -50%, 0) scale(1);
}

.messenger-composer {
  padding: 0.5rem 0.75rem calc(1rem + max(env(safe-area-inset-bottom), 16px));
  will-change: transform;
  transition: transform 190ms cubic-bezier(0.22, 1, 0.36, 1);
}

.messenger-composer.is-dragging {
  transition: none;
}

.messenger-message-input {
  min-height: 2.75rem;
  max-height: 7.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

:global(html.messenger-chat-lock),
:global(html.messenger-chat-lock body) {
  height: 100%;
  overflow: hidden;
}

.chat-slide-enter-active,
.chat-slide-leave-active {
  transition:
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease;
}

.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0.96;
  transform: translateX(100%);
}

.chat-slide-enter-to,
.chat-slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 180ms ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.people-panel-enter-active,
.people-panel-leave-active {
  transition:
    opacity 220ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    max-height 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.people-panel-enter-from,
.people-panel-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  max-height: 0;
}

.people-panel-enter-to,
.people-panel-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 1000px;
}
</style>
