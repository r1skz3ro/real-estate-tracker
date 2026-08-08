import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/models/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'data/estate.db' },
})
