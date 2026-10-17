# Builds the site, then serves it with Caddy, which also handles HTTPS and passes /api to the backend.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite bakes these into the bundle; compose passes them from backend/.env.
ARG VITE_API_BASE_URL
ARG VITE_TURNSTILE_SITE_KEY
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
