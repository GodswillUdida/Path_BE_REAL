# Use a lightweight Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install OS dependencies required by Prisma
RUN apk add --no-cache openssl
#RUN apt-get update && apt-get install -y openssl

# Install only prod dependencies first for layer caching
COPY package*.json ./
RUN npm install

# Copy Prisma schema & generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy entire project files
COPY . .

# Copy EJS views to built directory
COPY src/views ./dist/views

# Build TypeScript
RUN npm run build

# Set environment to production explicitly
ENV NODE_ENV=production

# Expose correct port for API
EXPOSE 5000

# Start the app
# CMD ["npm", "run", "dev"]
CMD ["npm", "start"]