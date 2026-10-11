# Базовый образ из Amazon ECR Public (зеркало официального node), чтобы не зависеть от лимитов Docker Hub
FROM public.ecr.aws/docker/library/node:22-slim
# openssl — для Prisma; python3-reportlab и шрифт DejaVu — для PDF смет (кириллица и ₽); python3-openpyxl — для Excel
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 python3-reportlab python3-openpyxl fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
