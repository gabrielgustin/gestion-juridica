# Imagen del worker de tribunales (Railway / Fly.io). Se construye desde la raíz del proyecto:
#   docker build -f worker/Dockerfile -t estudio-worker .
FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save playwright@1.49.1 tsx@4.19.2
COPY . .
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]
