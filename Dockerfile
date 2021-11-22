FROM node:12 as base

WORKDIR /home/node/app

COPY package*.json ./
COPY flow-scanner-lib-1.0.0.tgz ./

RUN npm i

COPY . .

FROM base as production

ENV NODE_PATH=./build

RUN npm run build
