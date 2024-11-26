FROM node:22

RUN mkdir /service
WORKDIR /service

COPY package.json package-lock.json ./
RUN npm install

COPY lib lib
COPY index.js .

CMD ["node", "index.js"]