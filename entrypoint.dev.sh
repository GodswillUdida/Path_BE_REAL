#!/bin/sh

set -e  # exit immediately if a command fails

echo "🚀 Starting Pathfinder API (Dev)..."

MAX_RETRIES=30
RETRY_COUNT=0

wait_for_service() {
  SERVICE_NAME=$1
  HOST=$2
  PORT=$3

  echo "⏳ Waiting for $SERVICE_NAME at $HOST:$PORT..."

  while ! nc -z $HOST $PORT; do
    RETRY_COUNT=$((RETRY_COUNT+1))

    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
      echo "❌ $SERVICE_NAME not available after $MAX_RETRIES attempts. Exiting."
      exit 1
    fi

    sleep 1
  done

  echo "✅ $SERVICE_NAME is ready"
  RETRY_COUNT=0
}

# Wait for dependencies
wait_for_service "Postgres" "postgres" 5432
wait_for_service "Redis" "redis" 6379

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗄️ Running migrations..."
npx prisma migrate deploy

echo "🔥 Starting dev server..."
exec npm run dev