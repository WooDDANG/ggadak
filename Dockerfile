FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/be/package.json apps/be/package.json
COPY apps/frontend-main/package.json apps/frontend-main/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN HUSKY=0 npm ci
COPY packages/shared packages/shared
COPY apps/be apps/be
RUN npm run build --workspace=@ggaddak/shared \
 && npm run db:generate --workspace=@ggaddak/be \
 && npm run build --workspace=@ggaddak/be

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATABASE_URL=file:/data/decisions.sqlite
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data
COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/be/package.json apps/be/package.json
COPY apps/frontend-main/package.json apps/frontend-main/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/be/dist apps/be/dist
COPY --from=build /app/apps/be/prisma apps/be/prisma
COPY --from=build /app/apps/be/node_modules apps/be/node_modules
COPY apps/be/scripts apps/be/scripts
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R node:node /app /data
USER node
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
