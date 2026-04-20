export const formatBytes = (value) => {
  const size = Number(value || 0)
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`
  return `${(size / 1024 / 1024).toFixed(1)} МБ`
}

export const formatMessageTime = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export const formatConversationTime = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

export const firstLetter = (value) =>
  String(value || '?')
    .trim()
    .slice(0, 1)
    .toUpperCase()

export const userInitial = (user) => firstLetter(user?.name || user?.email)

export const conversationInitial = (conversation) =>
  firstLetter(conversation?.displayTitle)

export const isImageAttachment = (attachment) =>
  String(attachment.mime_type || '').startsWith('image/')

export const conversationSubtitle = (conversation) => {
  if (!conversation) return ''
  if (conversation.type === 'group') {
    const count = conversation.members?.length || 0
    return `${count} участн.`
  }
  return 'Личный диалог'
}

export const lastMessagePreview = (conversation) => {
  if (!conversation?.lastMessage) return 'Сообщений пока нет'
  const body = conversation.lastMessage.body || 'Файл или фото'
  if (conversation.type !== 'group') return body
  const sender = conversation.lastMessage.sender?.name
  return sender ? `${sender}: ${body}` : body
}

export const sortConversations = (items) =>
  [...items].sort((a, b) => {
    const first = new Date(a.updated_at || 0).getTime()
    const second = new Date(b.updated_at || 0).getTime()
    return second - first
  })

export const sortUsersByName = (items) =>
  [...items].sort((a, b) => {
    const first = String(a.name || a.email || '').localeCompare(
      String(b.name || b.email || ''),
      'ru',
      { sensitivity: 'base' },
    )
    if (first !== 0) return first
    return String(a.email || '').localeCompare(String(b.email || ''), 'ru', {
      sensitivity: 'base',
    })
  })

export const filterUsersByQuery = (items, rawQuery) => {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return items

  return items.filter((user) => {
    const name = String(user.name || '').toLowerCase()
    const email = String(user.email || '').toLowerCase()
    return name.includes(query) || email.includes(query)
  })
}
