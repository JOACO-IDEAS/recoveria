FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
COPY scripts/ingestion/run-google-drive-cloud-runtime.ts ./scripts/ingestion/run-google-drive-cloud-runtime.ts
COPY scripts/ingestion/run-google-drive-pilot.ts ./scripts/ingestion/run-google-drive-pilot.ts
CMD ["npm", "run", "pilot:google-drive:cloud-runtime"]
