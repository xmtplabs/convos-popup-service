FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY convos-popup-client/package.json convos-popup-client/
COPY twitter-popup-connector/package.json twitter-popup-connector/
RUN npm ci --omit=dev

FROM node:22-slim
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
