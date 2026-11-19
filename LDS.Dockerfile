FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216
# hadolint ignore=DL3018
RUN apk --no-cache add \
    openssl=3.5.9-r1    

WORKDIR /home/node/

COPY . /home/node/

RUN chown -R node:node /home/node/

USER node

RUN npm install

EXPOSE 4840/tcp
EXPOSE 5353/udp 

ENTRYPOINT ["npm", "run", "dev-start_lds"]
