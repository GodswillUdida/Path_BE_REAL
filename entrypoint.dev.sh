echo "Waiting for Postgres..."
until npx wait-port postgres:5432 > /dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready"

echo "Waiting for Redis..."
until npx wait-port redis:6379 > /dev/null 2>&1; do
  sleep 1
done
echo "Redis is ready"

echo "Generating Prisma client..."
npx prisma generate

echo "Running migrations..."
npx prisma migrate deploy

echo "Starting dev server..."
npm run dev
