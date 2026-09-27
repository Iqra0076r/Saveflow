FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm install
COPY client ./client
RUN npm run build -w client

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates curl \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY server/package.json ./server/package.json
RUN npm install --omit=dev --workspace server
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 10000
CMD ["node", "server/index.mjs"]
