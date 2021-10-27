FROM node:16.13

COPY . /

RUN npm install

ENTRYPOINT ["npm", "run", "start"]
