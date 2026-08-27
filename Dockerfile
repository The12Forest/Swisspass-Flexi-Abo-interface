FROM node:24-alpine

# Only curl needed — no python3
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Token + profile saves are persisted in /app/Backend/saves
# Mount a volume to survive restarts:
#   docker run -v ./data:/app/Backend/saves ...
RUN mkdir -p /app/Backend/saves/tokens

EXPOSE 3000
ENV HTTP_PORT=3000

CMD ["node", "index.js"]
