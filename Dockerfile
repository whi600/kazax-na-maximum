FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh

RUN mkdir -p /app/data \
  && chmod +x /entrypoint.sh

EXPOSE 8787

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
