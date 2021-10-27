FROM node:17.0

COPY . /

RUN npm install

ENTRYPOINT ["npm", "run", "start"]
