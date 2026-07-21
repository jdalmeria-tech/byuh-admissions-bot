import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  vector,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Documents
// One row per source document you feed into the bot (a webpage, a PDF, a
// policy doc, etc). This is the "what did we ingest" table.
// ---------------------------------------------------------------------------
export const byuh_documents = pgTable('byuh_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceUrl: text('source_url'),
  sourceType: text('source_type').notNull(), // e.g. 'webpage' | 'pdf' | 'manual'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Document chunks
// Long documents get split into smaller pieces before embedding — an LLM
// can only usefully compare/retrieve on chunks that are roughly
// paragraph-sized, not a whole PDF at once. Each chunk stores its own
// embedding vector so we can do similarity search at query time.
//
// 1536 dimensions matches OpenAI's text-embedding-3-small. If you switch
// embedding models later, this number has to match that model's output size.
// ---------------------------------------------------------------------------
export const byuh_document_chunks = pgTable(
  'byuh_document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => byuh_documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(), // order within the source doc
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // HNSW index lets pgvector find nearest-neighbor chunks fast instead of
    // scanning every row. cosine distance is the standard choice for
    // OpenAI-style embeddings.
    index('byuh_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// ---------------------------------------------------------------------------
// Conversations
// One row per chat session a user has with the bot.
// ---------------------------------------------------------------------------
export const byuh_conversations = pgTable('byuh_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const byuh_message_role = pgEnum('byuh_message_role', [
  'system',
  'user',
  'assistant',
]);

// ---------------------------------------------------------------------------
// Messages
// One row per message inside a conversation, in order.
// ---------------------------------------------------------------------------
export const byuh_messages = pgTable('byuh_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => byuh_conversations.id, { onDelete: 'cascade' }),
  role: byuh_message_role('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (optional, but lets Drizzle's query API do nested selects like
// db.query.byuh_documents.findMany({ with: { chunks: true } }))
// ---------------------------------------------------------------------------
export const documentsRelations = relations(byuh_documents, ({ many }) => ({
  chunks: many(byuh_document_chunks),
}));

export const chunksRelations = relations(byuh_document_chunks, ({ one }) => ({
  document: one(byuh_documents, {
    fields: [byuh_document_chunks.documentId],
    references: [byuh_documents.id],
  }),
}));

export const conversationsRelations = relations(
  byuh_conversations,
  ({ many }) => ({
    messages: many(byuh_messages),
  })
);

export const messagesRelations = relations(byuh_messages, ({ one }) => ({
  conversation: one(byuh_conversations, {
    fields: [byuh_messages.conversationId],
    references: [byuh_conversations.id],
  }),
}));
