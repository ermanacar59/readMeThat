FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci && npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "run", "start", "-w", "@doc2speech/api"]
