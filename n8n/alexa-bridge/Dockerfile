FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

# Volume para persistir cookie de sessao Amazon
VOLUME /app/data

ENV ALEXA_COOKIE_FILE=/app/data/.alexa-cookie
ENV PORT=3456

EXPOSE 3456
EXPOSE 3457

CMD ["node", "server.js"]
