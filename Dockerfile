FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_APP_ENV=prod
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_DEV_SERVER_PORT=3001
ARG VITE_PREVIEW_PORT=3001

ENV VITE_APP_ENV=$VITE_APP_ENV
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DEV_SERVER_PORT=$VITE_DEV_SERVER_PORT
ENV VITE_PREVIEW_PORT=$VITE_PREVIEW_PORT

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run "build:$VITE_APP_ENV"

FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
