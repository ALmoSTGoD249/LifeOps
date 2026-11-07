# Build the SPA, then serve it with Nginx (which also reverse-proxies /api to the backend).
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf nginx/proxy.inc /etc/nginx/conf.d/
COPY --from=build /app/dist /usr/share/nginx/html
