import { db } from '../db.js'

export const listUsersForMessengerStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  ORDER BY LOWER(name) ASC, email ASC
`)

export const getConversationByDirectKeyStatement = db.prepare(
  'SELECT id, type, title, direct_key, created_by, created_at, updated_at FROM conversations WHERE direct_key = ?',
)

export const getConversationByIdStatement = db.prepare(
  'SELECT id, type, title, direct_key, created_by, created_at, updated_at FROM conversations WHERE id = ?',
)

export const createConversationStatement = db.prepare(`
  INSERT INTO conversations(type, title, direct_key, created_by, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  RETURNING id
`)

export const addConversationMemberStatement = db.prepare(`
  INSERT INTO conversation_members(conversation_id, user_id)
  VALUES (?, ?)
  ON CONFLICT(conversation_id, user_id) DO NOTHING
`)

export const isConversationMemberStatement = db.prepare(`
  SELECT 1 AS ok
  FROM conversation_members
  WHERE conversation_id = ? AND user_id = ?
`)

export const listUserConversationsStatement = db.prepare(`
  SELECT
    c.id,
    c.type,
    c.title,
    c.direct_key,
    c.created_at,
    c.updated_at,
    lm.id AS last_message_id,
    lm.body AS last_message_body,
    lm.created_at AS last_message_created_at,
    sender.id AS last_sender_id,
    sender.name AS last_sender_name
  FROM conversations c
  JOIN conversation_members cm ON cm.conversation_id = c.id
  LEFT JOIN messages lm ON lm.id = (
    SELECT m.id
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  )
  LEFT JOIN users sender ON sender.id = lm.sender_user_id
  WHERE cm.user_id = ?
  ORDER BY c.updated_at DESC, c.id DESC
`)

export const listConversationMembersStatement = db.prepare(`
  SELECT u.id, u.email, u.name, u.role
  FROM conversation_members cm
  JOIN users u ON u.id = cm.user_id
  WHERE cm.conversation_id = ?
  ORDER BY LOWER(u.name) ASC
`)

export const listMessagesStatement = db.prepare(`
  SELECT
    m.id,
    m.conversation_id,
    m.sender_user_id,
    m.body,
    m.reply_to_message_id,
    m.created_at,
    u.name AS sender_name,
    u.email AS sender_email,
    rm.body AS reply_body,
    rm.sender_user_id AS reply_sender_user_id,
    ru.name AS reply_sender_name,
    ru.email AS reply_sender_email,
    (
      SELECT COUNT(*)
      FROM message_attachments rma
      WHERE rma.message_id = rm.id
    ) AS reply_attachment_count
  FROM messages m
  LEFT JOIN users u ON u.id = m.sender_user_id
  LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
  LEFT JOIN users ru ON ru.id = rm.sender_user_id
  WHERE m.conversation_id = ?
    AND m.id IN (
      SELECT id
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    )
  ORDER BY m.created_at ASC, m.id ASC
`)

export const getMessageByIdStatement = db.prepare(`
  SELECT
    m.id,
    m.conversation_id,
    m.sender_user_id,
    m.body,
    m.reply_to_message_id,
    m.created_at,
    u.name AS sender_name,
    u.email AS sender_email,
    rm.body AS reply_body,
    rm.sender_user_id AS reply_sender_user_id,
    ru.name AS reply_sender_name,
    ru.email AS reply_sender_email,
    (
      SELECT COUNT(*)
      FROM message_attachments rma
      WHERE rma.message_id = rm.id
    ) AS reply_attachment_count
  FROM messages m
  LEFT JOIN users u ON u.id = m.sender_user_id
  LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
  LEFT JOIN users ru ON ru.id = rm.sender_user_id
  WHERE m.id = ?
`)

export const listAttachmentsForConversationStatement = db.prepare(`
  SELECT
    ma.id,
    ma.message_id,
    ma.original_name,
    ma.stored_name,
    ma.mime_type,
    ma.size,
    ma.created_at
  FROM message_attachments ma
  JOIN messages m ON m.id = ma.message_id
  WHERE m.conversation_id = ?
`)

export const listAttachmentsForMessageStatement = db.prepare(`
  SELECT
    id,
    message_id,
    original_name,
    stored_name,
    mime_type,
    size,
    created_at
  FROM message_attachments
  WHERE message_id = ?
`)

export const insertMessageStatement = db.prepare(`
  INSERT INTO messages(conversation_id, sender_user_id, body, reply_to_message_id)
  VALUES (?, ?, ?, ?)
  RETURNING id
`)

export const insertAttachmentStatement = db.prepare(`
  INSERT INTO message_attachments(
    message_id,
    original_name,
    stored_name,
    mime_type,
    size,
    storage_path
  )
  VALUES (?, ?, ?, ?, ?, ?)
`)

export const updateConversationTimestampStatement = db.prepare(
  "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
)

export const getAttachmentByIdStatement = db.prepare(`
  SELECT
    ma.id,
    ma.message_id,
    ma.original_name,
    ma.stored_name,
    ma.mime_type,
    ma.size,
    ma.storage_path,
    m.conversation_id
  FROM message_attachments ma
  JOIN messages m ON m.id = ma.message_id
  WHERE ma.id = ?
`)
