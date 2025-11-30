#!/bin/sh

echo "🧪 Waiting for Postgres..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "✅ Postgres is ready"

echo "🧪 Waiting for Redis..."
while ! nc -z redis 6379; do
  sleep 1
done
echo "✅ Redis is ready"

echo "🔄 Running Prisma generate..."
npx prisma generate

echo "🛠️ Running Prisma migrate dev (safe fallback)..."
npx prisma migrate dev --name init --skip-seed || true

echo "🚀 Starting dev server with hot reload..."
npm run dev
