FROM docker.io/node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json ./package.json
COPY frontend ./frontend
ARG VITE_API_URL
RUN npm install --prefix frontend
RUN if [ -n "${VITE_API_URL:-}" ]; then \
      VITE_API_URL="${VITE_API_URL}" npm run build --prefix frontend; \
    else \
      unset VITE_API_URL && npm run build --prefix frontend; \
    fi

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/frontend/dist ./dist
EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
