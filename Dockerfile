FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --omit=dev --workspace server
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
EXPOSE 5000
CMD ["node", "server/dist/server.js"]
