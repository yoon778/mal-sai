FROM node:24.18.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production DATA_DIRECTORY=/data PORT=3000
EXPOSE 3000
# One instance, persistent /data volume, TLS termination in front of this server.
CMD ["node", "server.js"]
