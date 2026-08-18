FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm run build
ENV NODE_ENV=production
USER node
EXPOSE 4173
CMD ["npm", "start"]
