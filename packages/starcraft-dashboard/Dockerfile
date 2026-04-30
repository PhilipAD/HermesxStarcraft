FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev
RUN npm install tsx --save-dev

# Copy source
COPY . .

# Build viewer for production
RUN npm run build

EXPOSE 9120 9121

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9121/api/health || exit 1

# Run both services
CMD node --import tsx server/index.ts &
CMD npm run dev -- --host 0.0.0.0
