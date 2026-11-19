FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

# Workspace package.json files must exist before npm ci, so copy everything first.
COPY . .

RUN npm ci && npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production

CMD ["npm", "run", "docker-start"]
