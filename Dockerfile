FROM node:18-alpine

WORKDIR /app

# Salin package.json dan install dependensi
COPY package*.json ./
RUN npm install --production

# Salin seluruh kode proyek
COPY . .

# Pastikan folder data ada
RUN mkdir -p /app/data

# Expose port aplikasi
EXPOSE 82 3000

# Jalankan server
CMD ["node", "server.js"]
