# Build Stage
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN bun run build


# Production Stage
FROM oven/bun:1 AS production

WORKDIR /app

COPY --from=build /app/.output ./.output

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["bun", ".output/server/index.mjs"]