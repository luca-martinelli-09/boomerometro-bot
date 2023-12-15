FROM node:20

WORKDIR /app

COPY . .

RUN npm install && npx prisma generate

RUN npx tsc -p .

EXPOSE 3000

CMD [ "node", "build/index.js" ]