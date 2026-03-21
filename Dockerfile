FROM mcr.microsoft.com/playwright:v1.50.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

CMD ["node", "dist/index.js"]
