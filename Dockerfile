FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV DB_PATH=/app/data/kofeteriy.sqlite

COPY package.json ./
COPY server ./server
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
COPY data/kofeteriy.sqlite /app/seed-data/kofeteriy.sqlite
COPY docker/entrypoint.sh /entrypoint.sh

RUN mkdir -p /app/data/uploads \
  && chmod +x /entrypoint.sh

EXPOSE 8787

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]

