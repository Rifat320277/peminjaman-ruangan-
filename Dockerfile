FROM node:18-alpine

WORKDIR /app

# Salin package.json dan install dependensi
COPY package*.json ./
RUN npm install --production

# Salin seluruh kode proyek
COPY . .

# Expose port aplikasi
EXPOSE 3000

# Jalankan server
CMD ["node", "server.js"]
