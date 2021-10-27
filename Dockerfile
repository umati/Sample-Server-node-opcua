FROM node:16.12

COPY . /

RUN npm install

ENTRYPOINT ["npm", "run", "start"]
