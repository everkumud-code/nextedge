FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db ./src/db
COPY --from=build /app/drizzle.config.ts ./
EXPOSE 3000
CMD ["sh","-c","npx drizzle-kit push && node dist/main.js"]
