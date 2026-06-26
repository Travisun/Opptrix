FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
COPY client-ui client-ui

RUN npm ci && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV STOCK_RESEARCH_PORT=8711
ENV STOCK_RESEARCH_HOST=0.0.0.0
ENV API_PROXY_TARGET=http://127.0.0.1:8711

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps apps
COPY --from=build /app/client-ui/dist client-ui/dist

EXPOSE 5173

CMD ["npm", "run", "serve"]
