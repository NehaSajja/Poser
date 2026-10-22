FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Only the browser-safe license is a build argument. API keys are runtime secrets.
ARG VITE_TLDRAW_LICENSE_KEY
RUN npm run build
RUN node --input-type=module -e "import { restoreMetAssets } from './scripts/met-assets.mjs'; await restoreMetAssets(process.cwd());"

FROM python:3.11-slim-bookworm
COPY --from=web /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tools/met-art/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir torch==2.9.0 torchvision==0.24.0 --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install --no-cache-dir -r /tmp/requirements.txt
COPY --from=web /app/node_modules ./node_modules
COPY --from=web /app/dist ./dist
COPY --from=web /app/.local/met-art/mobileclip-s1.safetensors /opt/poser/mobileclip-s1.safetensors
COPY server ./server
COPY src ./src
COPY data ./data
COPY tools/met-art ./tools/met-art
COPY scripts ./scripts
COPY package.json ./package.json
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 \
    POSER_DATA_DIR=/data MET_MODEL_PATH=/opt/poser/mobileclip-s1.safetensors \
    MET_PYTHON=/usr/local/bin/python PYTHONUNBUFFERED=1 \
    DAILY_NODE_API_CALLS=250 DAILY_REFERENCE_API_CALLS=100 REQUESTS_PER_MINUTE=12 \
    MET_SEARCH_WORKERS=1 MET_QUEUE_LIMIT=4 MET_TORCH_THREADS=2
RUN mkdir -p /data && node scripts/check-setup.mjs \
    && python tools/met-art/verify_setup.py
# Single replica: the local queue and persistent quotas are not distributed.
EXPOSE 8080
CMD ["node", "server/index.mjs"]
