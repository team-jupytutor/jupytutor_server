# Cloud Run image for the Jupytutor server (see README "Google Cloud Run").
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# src/ stays in the image: prompts are read from src/prompts at runtime.
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
