FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
    multimon-ng \
    sox \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]
