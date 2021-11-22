FROM node:12 as base

WORKDIR /home/node/app

COPY package*.json ./

RUN npm i

COPY src/ src/
COPY tsconfig.json .

FROM base as production

ENV NODE_PATH=./build

RUN npm run build

CMD ["node", "build/server.js"]
