FROM node:18.20.4-alpine

WORKDIR /app

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    tzdata

ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY package*.json ./

RUN npm install --production

COPY chatbot-telegram.js ./

RUN mkdir -p logs

CMD ["node", "chatbot-telegram.js"]