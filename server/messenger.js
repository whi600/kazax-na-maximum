import { forbidden, notFound } from './http.js'
import {
  getConversationByIdStatement,
  isConversationMemberStatement,
  listAttachmentsForConversationStatement,
  listConversationMembersStatement,
  listMessagesStatement,
} from './statements.js'

export const normalizePersonName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

export const makeDirectConversationKey = (firstUserId, secondUserId) => {
  const ids = [Number(firstUserId), Number(secondUserId)].sort((a, b) => a - b)
  return `${ids[0]}:${ids[1]}`
}

export const normalizeGroupTitle = (value) => String(value || '').trim().slice(0, 80)

export const normalizeMemberIds = (value, currentUserId) => {
  const source = Array.isArray(value) ? value : []
  const ids = new Set()

  for (const item of source) {
    const id = Number(item)
    if (!Number.isFinite(id) || id <= 0 || id === currentUserId) continue
    ids.add(id)
  }

  return [...ids].slice(0, 50)
}

export const mapMessengerUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  created_at: row.created_at,
})

export const conversationToDto = async (row, currentUser) => {
  const members = (await listConversationMembersStatement.all(row.id)).map(mapMessengerUser)
  const otherMember = members.find((member) => member.id !== currentUser.id) || members[0]
  const displayTitle =
    row.type === 'direct'
      ? otherMember?.name || otherMember?.email || 'Диалог'
      : row.title || 'Диалог'

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    displayTitle,
    direct_key: row.direct_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    members,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          body: row.last_message_body,
          created_at: row.last_message_created_at,
          sender: {
            id: row.last_sender_id,
            name: row.last_sender_name,
          },
        }
      : null,
  }
}

export const attachmentToDto = (row) => ({
  id: row.id,
  message_id: row.message_id,
  original_name: row.original_name,
  mime_type: row.mime_type,
  size: row.size,
  created_at: row.created_at,
  url: `/api/messenger/attachments/${row.id}`,
})

export const messageToDto = (row, attachments = []) => ({
  id: row.id,
  conversation_id: row.conversation_id,
  sender_user_id: row.sender_user_id,
  sender_name: row.sender_name || row.sender_email || 'Пользователь',
  sender_email: row.sender_email,
  body: row.body || '',
  reply_to_message_id: row.reply_to_message_id || null,
  reply_to: row.reply_to_message_id
    ? {
        id: row.reply_to_message_id,
        sender_user_id: row.reply_sender_user_id,
        sender_name: row.reply_sender_name || row.reply_sender_email || 'Пользователь',
        sender_email: row.reply_sender_email,
        body: row.reply_body || '',
        has_attachment: Number(row.reply_attachment_count || 0) > 0,
      }
    : null,
  created_at: row.created_at,
  attachments: attachments.map(attachmentToDto),
})

export const buildMessagePreview = (body, hasAttachment) => {
  const text = String(body || '').trim()
  if (text) return text.slice(0, 120)
  if (hasAttachment) return 'Файл'
  return 'Новое сообщение'
}

export const listMessageDtos = async (conversationId, limit) => {
  const messageRows = await listMessagesStatement.all(conversationId, conversationId, limit)
  const attachmentsByMessage = new Map()

  for (const attachment of await listAttachmentsForConversationStatement.all(conversationId)) {
    const list = attachmentsByMessage.get(attachment.message_id) || []
    list.push(attachment)
    attachmentsByMessage.set(attachment.message_id, list)
  }

  return messageRows.map((row) =>
    messageToDto(row, attachmentsByMessage.get(row.id) || []),
  )
}

export const ensureConversationMember = async (conversationId, user, res) => {
  const conversation = await getConversationByIdStatement.get(conversationId)
  if (!conversation) {
    notFound(res, 'Диалог не найден')
    return null
  }

  const member = await isConversationMemberStatement.get(conversationId, user.id)
  if (!member) {
    forbidden(res, 'У вас нет доступа к этому диалогу')
    return null
  }

  return conversation
}
