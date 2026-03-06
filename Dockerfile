FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY demo-popup-connector/package.json demo-popup-connector/
RUN npm ci --omit=dev

# --- popup-service ---
FROM node:22-slim AS popup-service
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY lib/ ./lib/
COPY index.js ./
ENV NODE_ENV=production
EXPOSE 3000 9090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "lib/standalone.js"]

# --- demo-popup-connector ---
FROM node:22-slim AS demo-popup-connector
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY demo-popup-connector/ ./demo-popup-connector/
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "demo-popup-connector/index.js"]
