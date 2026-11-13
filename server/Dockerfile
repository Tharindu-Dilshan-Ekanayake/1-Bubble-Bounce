# The +1 Arm Length game server, as Bloxity Legion runs it. Build from the repo root,
# since the server imports the rules shared with the client:
#   docker build -f server/Dockerfile .
FROM node:24-alpine

ENV NODE_ENV=production
# Only used if MONGODB_URI is missing (Legion always sets it): a scratch SQLite file
# somewhere the non-root user may write.
ENV DB_PATH=/tmp/game.db

WORKDIR /app
# Game rules and world layout, shared with the client (plain ESM, no dependencies).
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src

WORKDIR /app/server
# Legion requires a non-root user; the official Node image ships one called node.
USER node
# Legion injects PORT (2567); HTTP and the game's WebSocket share it.
EXPOSE 2567
CMD ["node", "src/server.js"]
