FROM node:24-alpine

# Install curl (needed for Cloudflare TLS bypass)
RUN apk add --no-cache curl python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cookie store is persisted here — mount a volume to survive restarts:
# docker run -v ./data:/app/data ...
ENV COOKIE_STORE_PATH=/app/data/cookies.json
RUN mkdir -p /app/data

EXPOSE 3000
ENV HTTP_PORT=3000

CMD ["node", "index.js"]
