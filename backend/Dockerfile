FROM docker.io/node:20-alpine AS build
WORKDIR /app
COPY package.json ./package.json
COPY backend ./backend
COPY knowledgeGraph ./knowledgeGraph
RUN npm install --prefix backend
RUN npm install --prefix knowledgeGraph
RUN npm run build --prefix knowledgeGraph
RUN npm run build --prefix backend

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/knowledgeGraph/dist ./knowledgeGraph/dist
COPY --from=build /app/knowledgeGraph/materialized ./knowledgeGraph/materialized
COPY --from=build /app/knowledgeGraph/neo4j ./knowledgeGraph/neo4j
COPY --from=build /app/knowledgeGraph/package.json ./knowledgeGraph/package.json
COPY package.json ./package.json
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
