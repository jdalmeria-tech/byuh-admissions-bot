import { Pool } from 'pg';
import { config } from 'dotenv';

config({ path: '.env' });

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
  });
  const client = await pool.connect();

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('pgvector extension ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        source_url TEXT,
        source_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL
          REFERENCES byuh_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS byuh_chunks_embedding_idx
      ON byuh_document_chunks
      USING hnsw (embedding vector_cosine_ops);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL
          REFERENCES byuh_sessions(id) ON DELETE CASCADE,
        title TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE byuh_message_role AS ENUM ('system', 'user', 'assistant');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL
          REFERENCES byuh_conversations(id) ON DELETE CASCADE,
        role byuh_message_role NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('All migrations complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
