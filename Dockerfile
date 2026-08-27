FROM node:24-alpine

# openssl for auto-generating the self-signed TLS certificate
RUN apk add --no-cache curl openssl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Saves dir: tokens, profiles list, and TLS cert are persisted here
RUN mkdir -p /app/Backend/saves/tokens /app/Backend/saves/tls

# HTTP (for Home Assistant / LAN clients)
EXPOSE 80
# HTTPS (for Browser Extension – requires accepting the self-signed cert once)
EXPOSE 443

ENV HTTP_PORT=80
ENV HTTPS_PORT=443

CMD ["node", "index.js"]
